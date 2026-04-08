import mongoose from "mongoose"
import { generateDocumentNumberStub } from "@repo/utils"
import { BusinessSettingsModel } from "../models/business-settings.model.js"

const bumpSeq = async (
  tenantId: string,
  field: "invoiceSeq" | "receiptSeq" | "refundSeq",
  prefixField: "invoiceNumberPrefix" | "receiptNumberPrefix" | "refundNumberPrefix",
): Promise<{ number: string; seq: number }> => {
  const updated = await BusinessSettingsModel.findOneAndUpdate(
    { tenantId: new mongoose.Types.ObjectId(tenantId) },
    { $inc: { [field]: 1 } },
    { new: true },
  )
  if (!updated) {
    const err = new Error("Business settings not found")
    ;(err as Error & { statusCode?: number }).statusCode = 404
    throw err
  }
  const seq = updated[field] as number
  const prefix = String(updated[prefixField] ?? "DOC")
  return { number: generateDocumentNumberStub(prefix, seq), seq }
}

export const numberingService = {
  async nextInvoiceNumber(tenantId: string) {
    return bumpSeq(tenantId, "invoiceSeq", "invoiceNumberPrefix")
  },

  async nextReceiptNumber(tenantId: string) {
    return bumpSeq(tenantId, "receiptSeq", "receiptNumberPrefix")
  },

  async nextRefundNumber(tenantId: string) {
    return bumpSeq(tenantId, "refundSeq", "refundNumberPrefix")
  },
}
