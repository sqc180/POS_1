import mongoose from "mongoose"
import { computeLineTax, sumMoney, type GstSlabRates } from "@repo/utils"
import type { TaxMode } from "@repo/types"
import { BusinessSettingsModel } from "../models/business-settings.model.js"
import { GstSlabModel } from "../models/gst-slab.model.js"
import { ProductModel } from "../models/product.model.js"
import { ProductVariantModel } from "../models/product-variant.model.js"
import type { BatchConsumption } from "./stock-batch.service.js"

export type LineInput = {
  productId: string
  qty: number
  variantId?: string
  batchId?: string
  serialNumbers?: string[]
}

export type BuiltLine = {
  productId: mongoose.Types.ObjectId
  variantId?: mongoose.Types.ObjectId
  variantLabel: string
  variantSku: string
  batchId?: mongoose.Types.ObjectId
  batchCode: string
  expiryDate?: Date
  batchAllocations: BatchConsumption[]
  serialNumbers: string[]
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
    lines: LineInput[],
  ): Promise<{ lines: BuiltLine[]; useIgst: boolean }> {
    const settings = await BusinessSettingsModel.findOne({ tenantId: new mongoose.Types.ObjectId(tenantId) })
    const useIgst = !(settings?.intraStateDefault ?? true)
    const built: BuiltLine[] = []
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    for (const row of lines) {
      if (!mongoose.Types.ObjectId.isValid(row.productId) || row.qty <= 0) {
        const err = new Error("Invalid line")
        ;(err as Error & { statusCode?: number }).statusCode = 400
        throw err
      }
      const p = await ProductModel.findOne({
        _id: new mongoose.Types.ObjectId(row.productId),
        tenantId: tenantOid,
      })
      if (!p || p.status !== "active") {
        const err = new Error(`Product not available: ${row.productId}`)
        ;(err as Error & { statusCode?: number }).statusCode = 400
        throw err
      }

      const mode = (p.variantMode as "none" | "optional" | "required" | undefined) ?? "none"
      if (mode === "none" && row.variantId) {
        const err = new Error("Variant not allowed for this product")
        ;(err as Error & { statusCode?: number }).statusCode = 400
        throw err
      }
      if (mode === "required" && !row.variantId) {
        const err = new Error("Variant is required for this product line")
        ;(err as Error & { statusCode?: number }).statusCode = 400
        throw err
      }

      let variantOid: mongoose.Types.ObjectId | undefined
      let variantLabel = ""
      let variantSku = ""
      let unitPrice = p.sellingPrice
      let gstSlabId = p.gstSlabId ?? undefined
      let taxMode = (p.taxMode as TaxMode) || "exclusive"

      if (row.variantId) {
        if (!mongoose.Types.ObjectId.isValid(row.variantId)) {
          const err = new Error("Invalid variant")
          ;(err as Error & { statusCode?: number }).statusCode = 400
          throw err
        }
        const v = await ProductVariantModel.findOne({
          _id: new mongoose.Types.ObjectId(row.variantId),
          tenantId: tenantOid,
          productId: p._id,
          status: "active",
        })
        if (!v) {
          const err = new Error("Variant not found or inactive")
          ;(err as Error & { statusCode?: number }).statusCode = 400
          throw err
        }
        variantOid = v._id
        variantLabel = v.label
        variantSku = v.sku
        if (v.sellingPrice != null && v.sellingPrice >= 0) unitPrice = v.sellingPrice
        if (v.gstSlabId) gstSlabId = v.gstSlabId
        if (v.taxMode) taxMode = v.taxMode as TaxMode
      }

      let slab: GstSlabRates = { cgstRate: 0, sgstRate: 0, igstRate: 0 }
      if (gstSlabId) {
        const g = await GstSlabModel.findOne({
          _id: gstSlabId,
          tenantId: tenantOid,
          status: "active",
        })
        if (g) {
          slab = { cgstRate: g.cgstRate, sgstRate: g.sgstRate, igstRate: g.igstRate }
        }
      }
      const t = computeLineTax(row.qty, unitPrice, slab, taxMode, useIgst)
      const displayName = variantLabel ? `${p.name} (${variantLabel})` : p.name
      const displaySku = variantSku || p.sku
      built.push({
        productId: p._id,
        variantId: variantOid,
        variantLabel,
        variantSku,
        batchId: row.batchId && mongoose.Types.ObjectId.isValid(row.batchId)
          ? new mongoose.Types.ObjectId(row.batchId)
          : undefined,
        batchCode: "",
        batchAllocations: [],
        serialNumbers: row.serialNumbers ?? [],
        name: displayName,
        sku: displaySku,
        qty: row.qty,
        unitPrice,
        taxMode,
        gstSlabId,
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
