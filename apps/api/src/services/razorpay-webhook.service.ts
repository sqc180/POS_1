import type { ApiEnv } from "@repo/config"
import { RazorpayPaymentProvider } from "@repo/payments"
import { idempotencyKey } from "@repo/utils"
import { PaymentWebhookEventModel } from "../models/payment-webhook-event.model.js"
import { QrPaymentSessionModel } from "../models/qr-payment-session.model.js"
import { auditService } from "./audit.service.js"
import { paymentService } from "./payment.service.js"

const snapshot = (raw: string, max = 12000) => (raw.length > max ? raw.slice(0, max) : raw)

export const razorpayWebhookService = {
  async handle(env: ApiEnv, rawBody: string, signature: string | undefined): Promise<{ ignored?: boolean }> {
    const secret = env.RAZORPAY_WEBHOOK_SECRET
    if (!secret) {
      const err = new Error("Webhook not configured")
      ;(err as Error & { statusCode?: number }).statusCode = 503
      throw err
    }
    const rzp = new RazorpayPaymentProvider({
      keyId: env.RAZORPAY_KEY_ID || "placeholder",
      keySecret: env.RAZORPAY_KEY_SECRET || "placeholder",
      webhookSecret: secret,
    })
    if (!signature || !rzp.verifyWebhookSignature?.(rawBody, signature, secret)) {
      const err = new Error("Invalid signature")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }

    let payload: unknown
    try {
      payload = JSON.parse(rawBody) as unknown
    } catch {
      const err = new Error("Invalid JSON")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }

    const parsed = rzp.parseWebhook?.(payload) ?? { event: "unknown" }
    const ev = String(parsed.event ?? "").toLowerCase()
    const paymentId = parsed.paymentId?.trim() ?? ""

    const statusOk =
      ev === "payment.captured" ||
      ev === "order.paid" ||
      String(parsed.status ?? "").toLowerCase() === "captured"

    if (!statusOk || !parsed.orderId || !paymentId) {
      const ignKey = idempotencyKey(["rzp_wh_skip", paymentId || parsed.orderId || "none", ev])
      await PaymentWebhookEventModel.findOneAndUpdate(
        { dedupeKey: ignKey },
        {
          $set: {
            provider: "razorpay",
            eventType: ev,
            payloadSnapshot: snapshot(rawBody),
            signatureValid: true,
            status: "ignored",
            processedAt: new Date(),
            failureReason: "not_actionable",
          },
        },
        { upsert: true },
      )
      return { ignored: true }
    }

    const dedupeKey = idempotencyKey(["rzp_payment_apply", paymentId])
    const prior = await PaymentWebhookEventModel.findOne({ dedupeKey })
    if (prior?.status === "processed") {
      return { ignored: true }
    }

    const session = await QrPaymentSessionModel.findOne({
      providerOrderId: parsed.orderId,
      state: "generated",
    })
    if (!session) {
      await PaymentWebhookEventModel.findOneAndUpdate(
        { dedupeKey },
        {
          $set: {
            provider: "razorpay",
            eventType: ev,
            payloadSnapshot: snapshot(rawBody),
            signatureValid: true,
            status: "ignored",
            processedAt: new Date(),
            failureReason: "no_open_session",
          },
        },
        { upsert: true },
      )
      return { ignored: true }
    }

    const tenantId = session.tenantId.toString()
    const actorId = session.createdBy.toString()

    await paymentService.create(tenantId, actorId, {
      invoiceId: session.invoiceId.toString(),
      amount: session.amount,
      method: "razorpay",
      providerRef: paymentId,
      idempotencyKey: idempotencyKey(["razorpay_payment", paymentId]),
      meta: { orderId: parsed.orderId, via: "razorpay_webhook" },
    })

    session.state = "paid"
    await session.save()

    await PaymentWebhookEventModel.findOneAndUpdate(
      { dedupeKey },
      {
        $set: {
          tenantId: session.tenantId,
          provider: "razorpay",
          eventType: ev,
          payloadSnapshot: snapshot(rawBody),
          signatureValid: true,
          status: "processed",
          processedAt: new Date(),
        },
      },
      { upsert: true },
    )

    await auditService.log({
      tenantId,
      actorId,
      action: "razorpay.webhook_payment",
      entity: "QrPaymentSession",
      entityId: session._id.toString(),
      metadata: { paymentId, orderId: parsed.orderId, event: ev },
    })

    return {}
  },
}
