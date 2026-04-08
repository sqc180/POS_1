import mongoose from "mongoose"
import { InvoiceModel } from "../models/invoice.model.js"
import { PaymentModel } from "../models/payment.model.js"
import { RefundModel, type RefundDoc } from "../models/refund.model.js"
import { auditService } from "./audit.service.js"
import { numberingService } from "./numbering.service.js"

const toPublic = (r: RefundDoc) => ({
  id: r._id.toString(),
  tenantId: r.tenantId.toString(),
  refundNumber: r.refundNumber ?? "",
  invoiceId: r.invoiceId.toString(),
  paymentId: r.paymentId?.toString() ?? null,
  amount: r.amount,
  status: r.status,
  reason: r.reason ?? "",
  providerRefundId: r.providerRefundId ?? "",
  createdBy: r.createdBy.toString(),
  createdAt: r.createdAt?.toISOString?.() ?? "",
})

export const refundService = {
  toPublic,

  async list(tenantId: string) {
    const rows = await RefundModel.find({ tenantId: new mongoose.Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .limit(200)
    return rows.map(toPublic)
  },

  async getById(tenantId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null
    const r = await RefundModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    return r ? toPublic(r) : null
  },

  async create(
    tenantId: string,
    actorId: string,
    input: { invoiceId: string; paymentId?: string; amount: number; reason?: string },
  ) {
    if (!mongoose.Types.ObjectId.isValid(input.invoiceId)) {
      const err = new Error("Invalid invoice")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const inv = await InvoiceModel.findOne({
      _id: new mongoose.Types.ObjectId(input.invoiceId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!inv || inv.status !== "completed") {
      const err = new Error("Invoice not eligible for refund")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    const refundedAgg = await RefundModel.aggregate<{ s: number }>([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          invoiceId: new mongoose.Types.ObjectId(input.invoiceId),
          status: "completed",
        },
      },
      { $group: { _id: null, s: { $sum: "$amount" } } },
    ])
    const alreadyRefunded = refundedAgg[0]?.s ?? 0
    const maxRefundable = Math.round((inv.amountPaid - alreadyRefunded) * 100) / 100
    if (input.amount <= 0 || input.amount > maxRefundable + 0.0001) {
      const err = new Error("Invalid refund amount")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    if (input.paymentId && mongoose.Types.ObjectId.isValid(input.paymentId)) {
      const pay = await PaymentModel.findOne({
        _id: new mongoose.Types.ObjectId(input.paymentId),
        tenantId: new mongoose.Types.ObjectId(tenantId),
        invoiceId: inv._id,
        status: "completed",
      })
      if (!pay) {
        const err = new Error("Payment not found for invoice")
        ;(err as Error & { statusCode?: number }).statusCode = 400
        throw err
      }
    }
    const { number } = await numberingService.nextRefundNumber(tenantId)
    const r = await RefundModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      refundNumber: number,
      invoiceId: inv._id,
      paymentId:
        input.paymentId && mongoose.Types.ObjectId.isValid(input.paymentId)
          ? new mongoose.Types.ObjectId(input.paymentId)
          : undefined,
      amount: input.amount,
      status: "pending",
      reason: input.reason ?? "",
      createdBy: new mongoose.Types.ObjectId(actorId),
    })
    await auditService.log({
      tenantId,
      actorId,
      action: "refund.create",
      entity: "Refund",
      entityId: r._id.toString(),
      metadata: { amount: input.amount },
    })
    return toPublic(r)
  },

  async complete(tenantId: string, actorId: string, id: string, providerRefundId?: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid refund")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const r = await RefundModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!r || r.status !== "pending") {
      const err = new Error("Refund not completable")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    r.status = "completed"
    if (providerRefundId) r.providerRefundId = providerRefundId
    await r.save()
    const inv = await InvoiceModel.findById(r.invoiceId)
    if (inv) {
      inv.amountPaid = Math.round((inv.amountPaid - r.amount) * 100) / 100
      if (inv.amountPaid < 0) inv.amountPaid = 0
      await inv.save()
    }
    await auditService.log({
      tenantId,
      actorId,
      action: "refund.complete",
      entity: "Refund",
      entityId: r._id.toString(),
    })
    return toPublic(r)
  },
}
