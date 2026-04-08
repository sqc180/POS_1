import mongoose from "mongoose"
import type { ApiEnv } from "@repo/config"
import { getProviderForTenant, type TenantGatewayConfig } from "@repo/payments"
import QRCode from "qrcode"
import { decimalFromMinor, idempotencyKey, minorFromDecimal } from "@repo/utils"
import { InvoiceModel } from "../models/invoice.model.js"
import { PaymentGatewayConfigModel } from "../models/payment-gateway-config.model.js"
import { PaymentModel } from "../models/payment.model.js"
import { QrPaymentSessionModel, type QrPaymentSessionDoc } from "../models/qr-payment-session.model.js"
import { auditService } from "./audit.service.js"
import { gatewayService } from "./gateway.service.js"

export const qrSessionToPublic = (s: QrPaymentSessionDoc) => {
  const channel = (s.channel as "qr" | "checkout" | undefined) ?? "qr"
  const amountMinor = minorFromDecimal(s.amount, 2)
  const checkout =
    channel === "checkout" && s.providerOrderId && s.razorpayKeyIdPublic
      ? {
          keyId: s.razorpayKeyIdPublic,
          orderId: s.providerOrderId,
          amountPaise: Number(amountMinor),
          currency: "INR" as const,
          amount: s.amount,
          displayAmount: decimalFromMinor(amountMinor, 2),
        }
      : undefined
  return {
    id: s._id.toString(),
    tenantId: s.tenantId.toString(),
    invoiceId: s.invoiceId.toString(),
    amount: s.amount,
    channel,
    state: s.state,
    payload: s.payload,
    providerOrderId: s.providerOrderId,
    dataUrl: s.dataUrl,
    checkout,
    expiresAt: s.expiresAt?.toISOString() ?? null,
    createdAt: s.createdAt?.toISOString?.() ?? "",
  }
}

export const qrSessionService = {
  async getById(tenantId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null
    const s = await QrPaymentSessionModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    return s ? qrSessionToPublic(s) : null
  },

  async create(
    tenantId: string,
    actorId: string,
    invoiceId: string,
    env: ApiEnv,
    opts?: { channel?: "qr" | "checkout" },
  ) {
    const channel = opts?.channel ?? "qr"
    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      const err = new Error("Invalid invoice")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const inv = await InvoiceModel.findOne({
      _id: new mongoose.Types.ObjectId(invoiceId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!inv || inv.status !== "completed") {
      const err = new Error("Invoice not eligible for QR")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    const paid = await PaymentModel.aggregate<{ s: number }>([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          invoiceId: inv._id,
          status: "completed",
        },
      },
      { $group: { _id: null, s: { $sum: "$amount" } } },
    ])
    const already = paid[0]?.s ?? 0
    const remaining = Math.round((inv.grandTotal - already) * 100) / 100
    if (remaining <= 0) {
      const err = new Error("Nothing to pay")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }

    const gwDoc = await PaymentGatewayConfigModel.findOne({ tenantId: new mongoose.Types.ObjectId(tenantId) })
    const gw: TenantGatewayConfig = {
      provider: (gwDoc?.provider as "noop" | "razorpay") ?? "noop",
      razorpayKeyId: gwDoc?.razorpayKeyId ?? "",
    }
    const envCreds = gatewayService.envCreds(env)
    const provider = getProviderForTenant(gw, envCreds)

    let payload = ""
    let providerOrderId = ""
    const useRazorpayOrder = gw.provider === "razorpay" && Boolean(envCreds.keySecret)
    if (channel === "checkout" && !useRazorpayOrder) {
      const err = new Error("Razorpay Checkout requires provider Razorpay and API key secret on the server")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }

    let razorpayKeyIdPublic = ""
    if (useRazorpayOrder) {
      const receipt = `inv_${inv._id.toString().slice(-12)}`
      const order = await provider.createOrder({
        tenantId,
        amountMinor: minorFromDecimal(remaining, 2),
        currency: "INR",
        receipt,
        notes: { invoiceId: inv._id.toString(), channel },
      })
      providerOrderId = order.providerOrderId
      payload = JSON.stringify({ provider: "razorpay", orderId: order.providerOrderId, amount: remaining })
      razorpayKeyIdPublic = (gwDoc?.razorpayKeyId?.trim() || env.RAZORPAY_KEY_ID || "").trim()
    } else {
      const vpa = gwDoc?.upiVpa?.trim() || "merchant@upi"
      const name = encodeURIComponent("POS ERP")
      payload = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${name}&am=${remaining.toFixed(2)}&cu=INR&tn=INV-${inv.invoiceNumber ?? inv._id.toString()}`
    }

    const dataUrl =
      channel === "checkout"
        ? ""
        : await QRCode.toDataURL(payload, { width: 256, margin: 1 })
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
    const s = await QrPaymentSessionModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      invoiceId: inv._id,
      amount: remaining,
      channel,
      razorpayKeyIdPublic,
      state: "generated",
      payload,
      providerOrderId,
      dataUrl,
      expiresAt,
      createdBy: new mongoose.Types.ObjectId(actorId),
    })
    await auditService.log({
      tenantId,
      actorId,
      action: "qr_session.generate",
      entity: "QrPaymentSession",
      entityId: s._id.toString(),
      metadata: { invoiceId: inv._id.toString(), amount: remaining, channel },
    })
    return qrSessionToPublic(s)
  },

  async markPaid(tenantId: string, actorId: string, sessionId: string, paymentIdHint?: string) {
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      const err = new Error("Invalid session")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const s = await QrPaymentSessionModel.findOne({
      _id: new mongoose.Types.ObjectId(sessionId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!s || s.state !== "generated") {
      const err = new Error("Session not payable")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    s.state = "paid"
    await s.save()
    const { paymentService } = await import("./payment.service.js")
    await paymentService.create(tenantId, actorId, {
      invoiceId: s.invoiceId.toString(),
      amount: s.amount,
      method: "qr",
      providerRef: paymentIdHint ?? s.providerOrderId,
      idempotencyKey: idempotencyKey(["qr_session", s._id.toString()]),
      meta: { qrSessionId: s._id.toString() },
    })
    await auditService.log({
      tenantId,
      actorId,
      action: "qr_session.paid",
      entity: "QrPaymentSession",
      entityId: s._id.toString(),
    })
    return qrSessionToPublic(s)
  },

  toPublic: qrSessionToPublic,
}
