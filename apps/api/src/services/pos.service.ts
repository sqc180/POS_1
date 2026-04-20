import mongoose from "mongoose"
import { BusinessSettingsModel } from "../models/business-settings.model.js"
import { InventoryItemModel } from "../models/inventory-item.model.js"
import { ProductModel } from "../models/product.model.js"
import { taxService, type LineInput } from "./tax.service.js"

const invStockKey = (productId: string, variantId?: string): string =>
  variantId ? `${productId}:${variantId}` : `${productId}:`

export const posService = {
  /**
   * Product IDs with positive stock at branch (base inventory rows only — no variant split).
   */
  async listInStockProductIds(tenantId: string, branchId: string): Promise<string[]> {
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    const rows = await InventoryItemModel.find({
      tenantId: tenantOid,
      branchId,
      $or: [{ variantId: null }, { variantId: { $exists: false } }],
      currentStock: { $gt: 0 },
    })
      .select({ productId: 1 })
      .lean()
    return [...new Set(rows.map((r) => (r as { productId: mongoose.Types.ObjectId }).productId.toString()))]
  },

  async previewTotals(tenantId: string, lines: LineInput[]) {
    const { lines: built } = await taxService.buildLinesFromProducts(tenantId, lines)
    const sums = taxService.summarize(built)
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    const settings = await BusinessSettingsModel.findOne({ tenantId: tenantOid }).lean()
    const branchId = settings?.defaultBranchId ?? "main"

    const productIds = [...new Set(built.map((l) => l.productId.toString()))]
    const oids = productIds.map((id) => new mongoose.Types.ObjectId(id))
    const [products, invRows] = await Promise.all([
      ProductModel.find({ tenantId: tenantOid, _id: { $in: oids } })
        .select({ _id: 1, trackStock: 1, variantMode: 1 })
        .lean(),
      InventoryItemModel.find({
        tenantId: tenantOid,
        productId: { $in: oids },
        branchId,
      })
        .select({ productId: 1, variantId: 1, currentStock: 1 })
        .lean(),
    ])
    const trackByProduct = new Map(products.map((p) => [p._id.toString(), p.trackStock === true]))
    const variantModeByProduct = new Map(
      products.map((p) => [p._id.toString(), (p as { variantMode?: string }).variantMode ?? "none"]),
    )
    const stockByKey = new Map(
      invRows.map((r) => {
        const pid = (r as { productId: mongoose.Types.ObjectId }).productId.toString()
        const vid = (r as { variantId?: mongoose.Types.ObjectId }).variantId?.toString() ?? ""
        return [invStockKey(pid, vid || undefined), (r as { currentStock: number }).currentStock]
      }),
    )

    return {
      lines: built.map((l) => {
        const pid = l.productId.toString()
        const tracked = trackByProduct.get(pid) === true
        const mode = variantModeByProduct.get(pid) ?? "none"
        const vKey = invStockKey(pid, l.variantId?.toString())
        const available = tracked ? (stockByKey.get(vKey) ?? null) : null
        const needVariant = tracked && mode === "required" && !l.variantId
        const sufficient = !tracked || (!needVariant && available !== null && available >= l.qty)
        return {
          productId: pid,
          variantId: l.variantId?.toString() ?? null,
          name: l.name,
          sku: l.sku,
          qty: l.qty,
          unitPrice: l.unitPrice,
          taxMode: l.taxMode,
          lineTotal: l.lineTotal,
          cgstAmount: l.cgstAmount,
          sgstAmount: l.sgstAmount,
          igstAmount: l.igstAmount,
          stock: tracked
            ? {
                tracked: true as const,
                branchId,
                available,
                sufficient: needVariant ? false : sufficient,
                requiresVariant: needVariant,
              }
            : { tracked: false as const },
        }
      }),
      ...sums,
    }
  },
}
