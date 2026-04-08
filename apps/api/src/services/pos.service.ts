import mongoose from "mongoose"
import { BusinessSettingsModel } from "../models/business-settings.model.js"
import { InventoryItemModel } from "../models/inventory-item.model.js"
import { ProductModel } from "../models/product.model.js"
import { taxService } from "./tax.service.js"

export const posService = {
  async previewTotals(tenantId: string, lines: { productId: string; qty: number }[]) {
    const { lines: built } = await taxService.buildLinesFromProducts(tenantId, lines)
    const sums = taxService.summarize(built)
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    const settings = await BusinessSettingsModel.findOne({ tenantId: tenantOid }).lean()
    const branchId = settings?.defaultBranchId ?? "main"

    const productIds = [...new Set(built.map((l) => l.productId.toString()))]
    const oids = productIds.map((id) => new mongoose.Types.ObjectId(id))
    const [products, invRows] = await Promise.all([
      ProductModel.find({ tenantId: tenantOid, _id: { $in: oids } })
        .select({ _id: 1, trackStock: 1 })
        .lean(),
      InventoryItemModel.find({
        tenantId: tenantOid,
        productId: { $in: oids },
        branchId,
      })
        .select({ productId: 1, currentStock: 1 })
        .lean(),
    ])
    const trackByProduct = new Map(products.map((p) => [p._id.toString(), p.trackStock === true]))
    const stockByProduct = new Map(invRows.map((r) => [r.productId.toString(), r.currentStock]))

    return {
      lines: built.map((l) => {
        const pid = l.productId.toString()
        const tracked = trackByProduct.get(pid) === true
        const available = tracked ? (stockByProduct.get(pid) ?? null) : null
        const sufficient = !tracked || (available !== null && available >= l.qty)
        return {
          productId: pid,
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
                sufficient,
              }
            : { tracked: false as const },
        }
      }),
      ...sums,
    }
  },
}
