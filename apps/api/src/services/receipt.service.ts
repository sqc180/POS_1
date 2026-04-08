import mongoose from "mongoose"
import { InvoiceModel } from "../models/invoice.model.js"
import { PaymentModel } from "../models/payment.model.js"
import { ReceiptModel, type ReceiptDoc } from "../models/receipt.model.js"
import { auditService } from "./audit.service.js"
import { numberingService } from "./numbering.service.js"

const toPublic = (r: ReceiptDoc) => ({
  id: r._id.toString(),
  tenantId: r.tenantId.toString(),
  receiptNumber: r.receiptNumber,
  invoiceId: r.invoiceId.toString(),
  paymentIds: r.paymentIds.map((x) => x.toString()),
  grandTotal: r.grandTotal,
  issuedBy: r.issuedBy.toString(),
  createdAt: r.createdAt?.toISOString?.() ?? "",
})

export const receiptService = {
  toPublic,

  async list(tenantId: string) {
    const rows = await ReceiptModel.find({ tenantId: new mongoose.Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .limit(200)
    return rows.map(toPublic)
  },

  async getById(tenantId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null
    const r = await ReceiptModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    return r ? toPublic(r) : null
  },

  async issueForInvoice(tenantId: string, actorId: string, invoiceId: string) {
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
      const err = new Error("Invoice not eligible")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    if (inv.amountPaid + 0.001 < inv.grandTotal) {
      const err = new Error("Invoice not fully paid")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    const existing = await ReceiptModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      invoiceId: inv._id,
    })
    if (existing) return toPublic(existing)
    const payments = await PaymentModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      invoiceId: inv._id,
      status: "completed",
    })
    const { number } = await numberingService.nextReceiptNumber(tenantId)
    const r = await ReceiptModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      receiptNumber: number,
      invoiceId: inv._id,
      paymentIds: payments.map((p) => p._id),
      grandTotal: inv.grandTotal,
      issuedBy: new mongoose.Types.ObjectId(actorId),
    })
    inv.receiptIssued = true
    await inv.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "receipt.issue",
      entity: "Receipt",
      entityId: r._id.toString(),
      metadata: { receiptNumber: number, invoiceId: inv._id.toString() },
    })
    return toPublic(r)
  },
}
