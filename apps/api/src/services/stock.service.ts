import mongoose from "mongoose"
import type { StockMovementType } from "@repo/types"
import { BusinessSettingsModel } from "../models/business-settings.model.js"
import { InventoryItemModel } from "../models/inventory-item.model.js"
import { ProductModel } from "../models/product.model.js"
import { StockMovementModel } from "../models/stock-movement.model.js"
import { auditService } from "./audit.service.js"

const productLabel = async (tenantId: string, productId: string): Promise<string> => {
  const p = await ProductModel.findOne({
    _id: new mongoose.Types.ObjectId(productId),
    tenantId: new mongoose.Types.ObjectId(tenantId),
  }).lean()
  if (!p) return "this product"
  return `"${p.name}" (${p.sku})`
}

export const stockService = {
  async applyMovement(
    tenantId: string,
    actorId: string,
    input: {
      inventoryItemId: string
      type: StockMovementType
      quantity: number
      reason?: string
      referenceType?: string
      referenceId?: string
    },
  ) {
    if (!mongoose.Types.ObjectId.isValid(input.inventoryItemId)) {
      const err = new Error("Invalid inventory item")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const item = await InventoryItemModel.findOne({
      _id: new mongoose.Types.ObjectId(input.inventoryItemId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!item) {
      const err = new Error("Inventory item not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    const settings = await BusinessSettingsModel.findOne({ tenantId: new mongoose.Types.ObjectId(tenantId) })
    const allowNegative = settings?.allowNegativeStock ?? false
    let delta = 0
    const q = Math.abs(input.quantity)
    switch (input.type) {
      case "in":
        delta = q
        break
      case "out":
        delta = -q
        break
      case "adjustment":
      case "correction":
      case "transfer":
        delta = input.quantity
        break
      default:
        delta = 0
    }
    const next = item.currentStock + delta
    if (next < 0 && !allowNegative) {
      const err = new Error("Insufficient stock")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    item.currentStock = next
    await item.save()
    await StockMovementModel.create({
      tenantId: item.tenantId,
      inventoryItemId: item._id,
      type: input.type,
      quantity: input.type === "out" ? -q : input.type === "in" ? q : input.quantity,
      reason: input.reason,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      createdBy: new mongoose.Types.ObjectId(actorId),
    })
    await auditService.log({
      tenantId,
      actorId,
      action: "stock.movement",
      entity: "StockMovement",
      entityId: item._id.toString(),
      metadata: { type: input.type, delta, newStock: item.currentStock },
    })
    return {
      inventoryItemId: item._id.toString(),
      currentStock: item.currentStock,
    }
  },

  async applyForProduct(
    tenantId: string,
    actorId: string,
    productId: string,
    branchId: string,
    direction: "out" | "in",
    qty: number,
    referenceType: string,
    referenceId: string,
  ) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      const err = new Error("Invalid product")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const item = await InventoryItemModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      productId: new mongoose.Types.ObjectId(productId),
      branchId,
    })
    const settings = await BusinessSettingsModel.findOne({ tenantId: new mongoose.Types.ObjectId(tenantId) })
    const allowNegative = settings?.allowNegativeStock ?? false
    const q = Math.abs(qty)

    if (!item) {
      const label = await productLabel(tenantId, productId)
      const err = new Error(
        `No stock record for ${label} at branch "${branchId}". Add stock in Inventory for this branch, or turn off stock tracking on the product.`,
      )
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }

    if (direction === "out" && !allowNegative && item.currentStock - q < 0) {
      const label = await productLabel(tenantId, productId)
      const err = new Error(
        `Insufficient stock for ${label}: available ${item.currentStock}, needed ${q}. Receive stock in Inventory, turn off "Track stock" on the product, or enable "Allow negative stock" in Settings.`,
      )
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }

    return stockService.applyMovement(tenantId, actorId, {
      inventoryItemId: item._id.toString(),
      type: direction === "out" ? "out" : "in",
      quantity: qty,
      reason: `Invoice ${referenceType}`,
      referenceType,
      referenceId,
    })
  },

  async history(tenantId: string, inventoryItemId?: string, limit = 100) {
    const filter: Record<string, unknown> = { tenantId: new mongoose.Types.ObjectId(tenantId) }
    if (inventoryItemId && mongoose.Types.ObjectId.isValid(inventoryItemId)) {
      filter.inventoryItemId = new mongoose.Types.ObjectId(inventoryItemId)
    }
    const rows = await StockMovementModel.find(filter).sort({ createdAt: -1 }).limit(limit)
    return rows.map((m) => ({
      id: m._id.toString(),
      inventoryItemId: m.inventoryItemId.toString(),
      type: m.type,
      quantity: m.quantity,
      reason: m.reason ?? "",
      referenceType: m.referenceType ?? "",
      referenceId: m.referenceId ?? "",
      createdAt: m.createdAt?.toISOString?.() ?? "",
      createdBy: m.createdBy.toString(),
    }))
  },
}
