import mongoose from "mongoose"
import { InvoiceModel } from "../models/invoice.model.js"

export type GstSummaryRow = {
  invoiceCount: number
  subtotal: number
  cgstTotal: number
  sgstTotal: number
  igstTotal: number
  grandTotal: number
}

export const gstSummaryService = {
  async summarizeCompleted(
    tenantId: string,
    opts: { from?: string; to?: string },
  ): Promise<GstSummaryRow> {
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    const match: Record<string, unknown> = { tenantId: tenantOid, status: "completed" }
    if (opts.from || opts.to) {
      const range: Record<string, Date> = {}
      if (opts.from) {
        const d = new Date(opts.from)
        if (!Number.isNaN(d.getTime())) range.$gte = d
      }
      if (opts.to) {
        const d = new Date(opts.to)
        if (!Number.isNaN(d.getTime())) range.$lte = d
      }
      if (Object.keys(range).length > 0) match.createdAt = range
    }
    const agg = await InvoiceModel.aggregate<{ invoiceCount: number; subtotal: number; cgst: number; sgst: number; igst: number; grand: number }>([
      { $match: match },
      {
        $group: {
          _id: null,
          invoiceCount: { $sum: 1 },
          subtotal: { $sum: "$subtotal" },
          cgst: { $sum: "$cgstTotal" },
          sgst: { $sum: "$sgstTotal" },
          igst: { $sum: "$igstTotal" },
          grand: { $sum: "$grandTotal" },
        },
      },
    ])
    const row = agg[0]
    return {
      invoiceCount: row?.invoiceCount ?? 0,
      subtotal: row?.subtotal ?? 0,
      cgstTotal: row?.cgst ?? 0,
      sgstTotal: row?.sgst ?? 0,
      igstTotal: row?.igst ?? 0,
      grandTotal: row?.grand ?? 0,
    }
  },
}
