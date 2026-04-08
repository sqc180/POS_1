import mongoose from "mongoose"
import { getDocumentBehavior } from "@repo/business-type-engine"
import { renderInvoicePdf, renderReceiptPdf, renderRefundNotePdf } from "@repo/pdf"
import type { BusinessTypeId } from "@repo/types"
import { CustomerModel } from "../models/customer.model.js"
import { InvoiceModel } from "../models/invoice.model.js"
import { ReceiptModel } from "../models/receipt.model.js"
import { RefundModel } from "../models/refund.model.js"
import { TenantModel } from "../models/tenant.model.js"

const tenantBusinessType = async (tenantId: string): Promise<{ name: string; businessType: BusinessTypeId }> => {
  const t = await TenantModel.findById(new mongoose.Types.ObjectId(tenantId))
  if (!t) {
    const err = new Error("Tenant not found")
    ;(err as Error & { statusCode?: number }).statusCode = 404
    throw err
  }
  return { name: t.name, businessType: t.businessType as BusinessTypeId }
}

export const documentPdfService = {
  async invoicePdfBuffer(tenantId: string, invoiceId: string): Promise<Buffer> {
    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      const err = new Error("Invalid invoice")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const inv = await InvoiceModel.findOne({
      _id: new mongoose.Types.ObjectId(invoiceId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!inv) {
      const err = new Error("Not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    const { name, businessType } = await tenantBusinessType(tenantId)
    const footer = getDocumentBehavior(businessType).invoiceFooterNote
    let customerName: string | undefined
    if (inv.customerId) {
      const c = await CustomerModel.findById(inv.customerId)
      if (c) customerName = c.name
    }
    const lines = inv.items.map((i) => ({
      description: `${i.name} (${i.sku})`,
      qty: i.qty,
      rate: i.unitPrice,
      tax: i.cgstAmount + i.sgstAmount + i.igstAmount,
      total: i.lineTotal,
    }))
    return renderInvoicePdf({
      tenantName: name,
      invoiceNumber: inv.invoiceNumber ?? "DRAFT",
      customerName,
      subtotal: inv.subtotal,
      cgstTotal: inv.cgstTotal,
      sgstTotal: inv.sgstTotal,
      igstTotal: inv.igstTotal,
      grandTotal: inv.grandTotal,
      amountPaid: inv.amountPaid,
      lines,
      footerNote: footer,
    })
  },

  async receiptPdfBuffer(tenantId: string, receiptId: string): Promise<Buffer> {
    if (!mongoose.Types.ObjectId.isValid(receiptId)) {
      const err = new Error("Invalid receipt")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const r = await ReceiptModel.findOne({
      _id: new mongoose.Types.ObjectId(receiptId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!r) {
      const err = new Error("Not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    const inv = await InvoiceModel.findById(r.invoiceId)
    const { name, businessType } = await tenantBusinessType(tenantId)
    const footer = getDocumentBehavior(businessType).receiptFooterNote
    return renderReceiptPdf({
      tenantName: name,
      receiptNumber: r.receiptNumber,
      invoiceNumber: inv?.invoiceNumber ?? "",
      amount: r.grandTotal,
      method: "mixed",
      footerNote: footer,
    })
  },

  async refundPdfBuffer(tenantId: string, refundId: string): Promise<Buffer> {
    if (!mongoose.Types.ObjectId.isValid(refundId)) {
      const err = new Error("Invalid refund")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const ref = await RefundModel.findOne({
      _id: new mongoose.Types.ObjectId(refundId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!ref) {
      const err = new Error("Not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    const inv = await InvoiceModel.findById(ref.invoiceId)
    const { name, businessType } = await tenantBusinessType(tenantId)
    const footer = getDocumentBehavior(businessType).invoiceFooterNote
    return renderRefundNotePdf({
      tenantName: name,
      refundNumber: ref.refundNumber ?? "",
      invoiceNumber: inv?.invoiceNumber ?? "",
      amount: ref.amount,
      reason: ref.reason,
      footerNote: footer,
    })
  },
}
