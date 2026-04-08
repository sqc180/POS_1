import mongoose from "mongoose"
import { idempotencyKey } from "@repo/utils"
import { InvoiceModel } from "../models/invoice.model.js"
import { PaymentModel, type PaymentDoc } from "../models/payment.model.js"
import { auditService } from "./audit.service.js"
import { invoiceService } from "./invoice.service.js"

const toPublic = (p: PaymentDoc) => ({
  id: p._id.toString(),
  tenantId: p.tenantId.toString(),
  invoiceId: p.invoiceId.toString(),
  amount: p.amount,
  method: p.method,
  status: p.status,
  providerRef: p.providerRef ?? "",
  idempotencyKey: p.idempotencyKey ?? "",
  meta: p.meta,
  createdBy: p.createdBy.toString(),
  createdAt: p.createdAt?.toISOString?.() ?? "",
  updatedAt: p.updatedAt?.toISOString?.() ?? "",
})

export const paymentService = {
  toPublic,

  async list(tenantId: string, invoiceId?: string) {
    const q: Record<string, unknown> = { tenantId: new mongoose.Types.ObjectId(tenantId) }
    if (invoiceId && mongoose.Types.ObjectId.isValid(invoiceId)) {
      q.invoiceId = new mongoose.Types.ObjectId(invoiceId)
    }
    const rows = await PaymentModel.find(q).sort({ createdAt: -1 }).limit(200)
    return rows.map(toPublic)
  },

  async getById(tenantId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null
    const p = await PaymentModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    return p ? toPublic(p) : null
  },

  async create(
    tenantId: string,
    actorId: string,
    input: {
      invoiceId: string
      amount: number
      method: "cash" | "card_offline" | "qr" | "razorpay"
      providerRef?: string
      idempotencyKey?: string
      meta?: Record<string, unknown>
      forceComplete?: boolean
    },
  ) {
    if (!mongoose.Types.ObjectId.isValid(input.invoiceId)) {
      const err = new Error("Invalid invoice")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const key =
      input.idempotencyKey?.trim() ||
      idempotencyKey(["pay", tenantId, input.invoiceId, String(input.amount), input.method])
    const existing = await PaymentModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      idempotencyKey: key,
    })
    if (existing) return toPublic(existing)

    const inv = await InvoiceModel.findOne({
      _id: new mongoose.Types.ObjectId(input.invoiceId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!inv || inv.status !== "completed") {
      const err = new Error("Invoice not open for payment")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    const paid = await PaymentModel.aggregate<{ s: number }>([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          invoiceId: new mongoose.Types.ObjectId(input.invoiceId),
          status: "completed",
        },
      },
      { $group: { _id: null, s: { $sum: "$amount" } } },
    ])
    const already = paid[0]?.s ?? 0
    const remaining = Math.round((inv.grandTotal - already) * 100) / 100
    if (input.amount <= 0 || input.amount > remaining + 0.0001) {
      const err = new Error("Invalid payment amount")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const status = input.forceComplete !== false ? "completed" : "pending"
    const p = await PaymentModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      invoiceId: inv._id,
      amount: input.amount,
      method: input.method,
      status,
      providerRef: input.providerRef ?? "",
      idempotencyKey: key,
      meta: input.meta,
      createdBy: new mongoose.Types.ObjectId(actorId),
    })
    if (status === "completed") {
      await invoiceService.addAmountPaid(tenantId, inv._id.toString(), input.amount)
    }
    await auditService.log({
      tenantId,
      actorId,
      action: "payment.create",
      entity: "Payment",
      entityId: p._id.toString(),
      metadata: { amount: input.amount, method: input.method, status },
    })
    return toPublic(p)
  },

  async updateStatus(
    tenantId: string,
    actorId: string,
    id: string,
    status: "pending" | "completed" | "failed",
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid payment")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const p = await PaymentModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!p) {
      const err = new Error("Not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    const was = p.status
    p.status = status
    await p.save()
    if (was !== "completed" && status === "completed") {
      await invoiceService.addAmountPaid(tenantId, p.invoiceId.toString(), p.amount)
    }
    await auditService.log({
      tenantId,
      actorId,
      action: "payment.update",
      entity: "Payment",
      entityId: p._id.toString(),
      metadata: { status },
    })
    return toPublic(p)
  },
}
