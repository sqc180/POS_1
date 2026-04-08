import mongoose from "mongoose"
import type { ApiEnv } from "@repo/config"
import { verifyRazorpayPaymentSignature } from "@repo/payments"
import { idempotencyKey } from "@repo/utils"
import { QrPaymentSessionModel } from "../models/qr-payment-session.model.js"
import { auditService } from "./audit.service.js"
import { paymentService } from "./payment.service.js"
import { qrSessionService } from "./qr-session.service.js"

export const razorpayPosService = {
  async createCheckoutSession(tenantId: string, actorId: string, invoiceId: string, env: ApiEnv) {
    return qrSessionService.create(tenantId, actorId, invoiceId, env, { channel: "checkout" })
  },

  async verifyCheckout(
    tenantId: string,
    actorId: string,
    env: ApiEnv,
    input: {
      sessionId: string
      razorpay_order_id: string
      razorpay_payment_id: string
      razorpay_signature: string
    },
  ) {
    const secret = env.RAZORPAY_KEY_SECRET?.trim()
    if (!secret) {
      const err = new Error("Razorpay key secret not configured on server")
      ;(err as Error & { statusCode?: number }).statusCode = 503
      throw err
    }
    if (!mongoose.Types.ObjectId.isValid(input.sessionId)) {
      const err = new Error("Invalid session")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    if (
      !verifyRazorpayPaymentSignature(
        input.razorpay_order_id,
        input.razorpay_payment_id,
        input.razorpay_signature,
        secret,
      )
    ) {
      const err = new Error("Invalid payment signature")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }

    const s = await QrPaymentSessionModel.findOne({
      _id: new mongoose.Types.ObjectId(input.sessionId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!s || s.state !== "generated") {
      const err = new Error("Session not open for verification")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    if (!s.providerOrderId || s.providerOrderId !== input.razorpay_order_id) {
      const err = new Error("Order mismatch for this session")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }

    const payKey = idempotencyKey(["razorpay_payment", input.razorpay_payment_id])
    const payment = await paymentService.create(tenantId, actorId, {
      invoiceId: s.invoiceId.toString(),
      amount: s.amount,
      method: "razorpay",
      providerRef: input.razorpay_payment_id,
      idempotencyKey: payKey,
      meta: {
        orderId: input.razorpay_order_id,
        sessionId: s._id.toString(),
        verifiedVia: "checkout_callback",
      },
    })

    s.state = "paid"
    await s.save()

    await auditService.log({
      tenantId,
      actorId,
      action: "razorpay.checkout_verified",
      entity: "QrPaymentSession",
      entityId: s._id.toString(),
      metadata: { paymentId: payment.id, razorpayPaymentId: input.razorpay_payment_id },
    })

    return { payment, session: qrSessionService.toPublic(s) }
  },
}
