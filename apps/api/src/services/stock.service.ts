import mongoose from "mongoose"
import type { StockMovementType } from "@repo/types"
import { BusinessSettingsModel } from "../models/business-settings.model.js"
import { InventoryItemModel } from "../models/inventory-item.model.js"
import { ProductModel } from "../models/product.model.js"
import { StockMovementModel } from "../models/stock-movement.model.js"
import { auditService } from "./audit.service.js"
import { inventoryService } from "./inventory.service.js"

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
      variantId?: string
      batchId?: string
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
      case "opening":
      case "purchase":
      case "transfer_in":
      case "production_output":
      case "sale_return":
        delta = q
        break
      case "out":
      case "sale":
      case "transfer_out":
      case "purchase_return":
      case "production_consumption":
      case "damage":
      case "expiry_write_off":
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
    const vOid =
      input.variantId && mongoose.Types.ObjectId.isValid(input.variantId)
        ? new mongoose.Types.ObjectId(input.variantId)
        : item.variantId ?? undefined
    const bOid =
      input.batchId && mongoose.Types.ObjectId.isValid(input.batchId)
        ? new mongoose.Types.ObjectId(input.batchId)
        : undefined
    await StockMovementModel.create({
      tenantId: item.tenantId,
      inventoryItemId: item._id,
      variantId: vOid,
      batchId: bOid,
      type: input.type,
      quantity:
        input.type === "out" ||
        input.type === "sale" ||
        input.type === "transfer_out" ||
        input.type === "purchase_return" ||
        input.type === "production_consumption" ||
        input.type === "damage" ||
        input.type === "expiry_write_off"
          ? -q
          : input.type === "in" ||
              input.type === "opening" ||
              input.type === "purchase" ||
              input.type === "transfer_in" ||
              input.type === "production_output" ||
              input.type === "sale_return"
            ? q
            : input.quantity,
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
    opts?: { variantId?: string; primaryBatchId?: string },
  ) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      const err = new Error("Invalid product")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    const productOid = new mongoose.Types.ObjectId(productId)
    const variantOid =
      opts?.variantId && mongoose.Types.ObjectId.isValid(opts.variantId)
        ? new mongoose.Types.ObjectId(opts.variantId)
        : null
    const invFilter: Record<string, unknown> = {
      tenantId: tenantOid,
      productId: productOid,
      branchId,
    }
    if (variantOid) invFilter.variantId = variantOid
    else invFilter.$or = [{ variantId: null }, { variantId: { $exists: false } }]
    const item = await InventoryItemModel.findOne(invFilter)
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
      variantId: variantOid ? variantOid.toString() : undefined,
      batchId: opts?.primaryBatchId,
    })
  },

  /**
   * Moves quantity from one branch row to another (same product+variant). Not transactional on standalone MongoDB;
   * uses paired transfer_out / transfer_in movements with a shared reference id for reconciliation.
   */
  async applyInterBranchTransfer(
    tenantId: string,
    actorId: string,
    input: { fromInventoryItemId: string; toBranchId: string; quantity: number; reason?: string },
  ): Promise<{
    referenceId: string
    fromInventoryItemId: string
    toInventoryItemId: string
    quantity: number
  }> {
    if (!mongoose.Types.ObjectId.isValid(input.fromInventoryItemId)) {
      const err = new Error("Invalid source inventory item")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const q = Math.abs(input.quantity)
    if (q <= 0) {
      const err = new Error("Quantity must be positive")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const source = await InventoryItemModel.findOne({
      _id: new mongoose.Types.ObjectId(input.fromInventoryItemId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!source) {
      const err = new Error("Source inventory item not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    const toBranch = String(input.toBranchId ?? "").trim()
    if (!toBranch) {
      const err = new Error("Destination branch is required")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    if (source.branchId === toBranch) {
      const err = new Error("Source and destination branch must differ")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const variantIdStr = source.variantId?.toString()
    const destDoc = await inventoryService.ensureRowForBranch(
      tenantId,
      actorId,
      source.productId.toString(),
      toBranch,
      variantIdStr,
    )
    const referenceId = new mongoose.Types.ObjectId().toString()
    const reason = input.reason?.trim() || "Inter-branch transfer"
    await stockService.applyMovement(tenantId, actorId, {
      inventoryItemId: source._id.toString(),
      type: "transfer_out",
      quantity: q,
      reason,
      referenceType: "inter_branch_transfer",
      referenceId,
      variantId: variantIdStr,
    })
    await stockService.applyMovement(tenantId, actorId, {
      inventoryItemId: destDoc._id.toString(),
      type: "transfer_in",
      quantity: q,
      reason,
      referenceType: "inter_branch_transfer",
      referenceId,
      variantId: variantIdStr,
    })
    await auditService.log({
      tenantId,
      actorId,
      action: "stock.inter_branch_transfer",
      entity: "StockMovement",
      entityId: referenceId,
      metadata: {
        fromInventoryItemId: source._id.toString(),
        toInventoryItemId: destDoc._id.toString(),
        quantity: q,
        fromBranch: source.branchId,
        toBranch,
      },
    })
    return {
      referenceId,
      fromInventoryItemId: source._id.toString(),
      toInventoryItemId: destDoc._id.toString(),
      quantity: q,
    }
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
