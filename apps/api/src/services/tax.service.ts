import mongoose from "mongoose"
import { computeLineTax, sumMoney, type GstSlabRates } from "@repo/utils"
import type { TaxMode } from "@repo/types"
import { BusinessSettingsModel } from "../models/business-settings.model.js"
import { GstSlabModel } from "../models/gst-slab.model.js"
import { ProductModel } from "../models/product.model.js"

export type BuiltLine = {
  productId: mongoose.Types.ObjectId
  name: string
  sku: string
  qty: number
  unitPrice: number
  taxMode: TaxMode
  gstSlabId?: mongoose.Types.ObjectId
  cgstRate: number
  sgstRate: number
  igstRate: number
  taxableValue: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  lineTotal: number
}

export const taxService = {
  async buildLinesFromProducts(
    tenantId: string,
    lines: { productId: string; qty: number }[],
  ): Promise<{ lines: BuiltLine[]; useIgst: boolean }> {
    const settings = await BusinessSettingsModel.findOne({ tenantId: new mongoose.Types.ObjectId(tenantId) })
    const useIgst = !(settings?.intraStateDefault ?? true)
    const built: BuiltLine[] = []
    for (const row of lines) {
      if (!mongoose.Types.ObjectId.isValid(row.productId) || row.qty <= 0) {
        const err = new Error("Invalid line")
        ;(err as Error & { statusCode?: number }).statusCode = 400
        throw err
      }
      const p = await ProductModel.findOne({
        _id: new mongoose.Types.ObjectId(row.productId),
        tenantId: new mongoose.Types.ObjectId(tenantId),
      })
      if (!p || p.status !== "active") {
        const err = new Error(`Product not available: ${row.productId}`)
        ;(err as Error & { statusCode?: number }).statusCode = 400
        throw err
      }
      let slab: GstSlabRates = { cgstRate: 0, sgstRate: 0, igstRate: 0 }
      if (p.gstSlabId) {
        const g = await GstSlabModel.findOne({
          _id: p.gstSlabId,
          tenantId: new mongoose.Types.ObjectId(tenantId),
          status: "active",
        })
        if (g) {
          slab = { cgstRate: g.cgstRate, sgstRate: g.sgstRate, igstRate: g.igstRate }
        }
      }
      const taxMode = (p.taxMode as TaxMode) || "exclusive"
      const t = computeLineTax(row.qty, p.sellingPrice, slab, taxMode, useIgst)
      built.push({
        productId: p._id,
        name: p.name,
        sku: p.sku,
        qty: row.qty,
        unitPrice: p.sellingPrice,
        taxMode,
        gstSlabId: p.gstSlabId ?? undefined,
        cgstRate: slab.cgstRate,
        sgstRate: slab.sgstRate,
        igstRate: slab.igstRate,
        taxableValue: t.taxableValue,
        cgstAmount: t.cgstAmount,
        sgstAmount: t.sgstAmount,
        igstAmount: t.igstAmount,
        lineTotal: t.lineTotal,
      })
    }
    return { lines: built, useIgst }
  },

  summarize(lines: BuiltLine[]) {
    const subtotal = sumMoney(lines.map((l) => l.taxableValue))
    const cgstTotal = sumMoney(lines.map((l) => l.cgstAmount))
    const sgstTotal = sumMoney(lines.map((l) => l.sgstAmount))
    const igstTotal = sumMoney(lines.map((l) => l.igstAmount))
    const grandTotal = sumMoney(lines.map((l) => l.lineTotal))
    return { subtotal, cgstTotal, sgstTotal, igstTotal, grandTotal }
  },
}
