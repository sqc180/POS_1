import mongoose from "mongoose"
import { BusinessSettingsModel } from "../models/business-settings.model.js"
import { InventoryItemModel, type InventoryItemDoc } from "../models/inventory-item.model.js"
import { ProductModel } from "../models/product.model.js"

const toPublic = async (i: InventoryItemDoc) => {
  const product = await ProductModel.findById(i.productId)
  return {
    id: i._id.toString(),
    tenantId: i.tenantId.toString(),
    productId: i.productId.toString(),
    productName: product?.name ?? "",
    sku: product?.sku ?? "",
    branchId: i.branchId,
    openingStock: i.openingStock,
    currentStock: i.currentStock,
    reservedStock: i.reservedStock,
    reorderLevel: i.reorderLevel,
    lowStockThreshold: i.lowStockThreshold,
    isLowStock: i.lowStockThreshold > 0 && i.currentStock <= i.lowStockThreshold,
    createdAt: i.createdAt?.toISOString?.() ?? "",
    updatedAt: i.updatedAt?.toISOString?.() ?? "",
  }
}

export const inventoryService = {
  async list(tenantId: string) {
    const items = await InventoryItemModel.find({ tenantId: new mongoose.Types.ObjectId(tenantId) }).sort({
      updatedAt: -1,
    })
    return Promise.all(items.map(toPublic))
  },

  async getById(tenantId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null
    const i = await InventoryItemModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    return i ? toPublic(i) : null
  },

  async updateLevels(
    tenantId: string,
    id: string,
    input: Partial<{ reorderLevel: number; lowStockThreshold: number; openingStock: number }>,
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid id")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const i = await InventoryItemModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!i) {
      const err = new Error("Not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    if (input.reorderLevel !== undefined) i.reorderLevel = input.reorderLevel
    if (input.lowStockThreshold !== undefined) i.lowStockThreshold = input.lowStockThreshold
    if (input.openingStock !== undefined) {
      i.openingStock = input.openingStock
    }
    await i.save()
    return toPublic(i)
  },

  async getSettings(tenantId: string) {
    const s = await BusinessSettingsModel.findOne({ tenantId: new mongoose.Types.ObjectId(tenantId) })
    return {
      allowNegativeStock: s?.allowNegativeStock ?? false,
      defaultBranchId: s?.defaultBranchId ?? "main",
    }
  },
}
