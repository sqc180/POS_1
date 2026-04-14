import mongoose from "mongoose"
import { InventoryItemModel } from "../models/inventory-item.model.js"
import { ProductModel } from "../models/product.model.js"
import { StockBatchModel, type StockBatchDoc } from "../models/stock-batch.model.js"

export type BatchConsumption = { batchId: mongoose.Types.ObjectId; qty: number }

export const stockBatchService = {
  async receive(
    tenantId: string,
    actorId: string,
    input: {
      productId: string
      variantId?: string
      branchId: string
      batchCode: string
      qty: number
      mfgDate?: string
      expiryDate?: string
    },
  ): Promise<{ id: string; qtyOnHand: number }> {
    if (!mongoose.Types.ObjectId.isValid(input.productId) || input.qty <= 0) {
      const err = new Error("Invalid receive input")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    const p = await ProductModel.findOne({
      _id: new mongoose.Types.ObjectId(input.productId),
      tenantId: tenantOid,
    })
    if (!p?.batchTracking) {
      const err = new Error("Batch tracking is not enabled for this product")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const variantOid =
      input.variantId && mongoose.Types.ObjectId.isValid(input.variantId)
        ? new mongoose.Types.ObjectId(input.variantId)
        : null
    const b = await StockBatchModel.create({
      tenantId: tenantOid,
      productId: new mongoose.Types.ObjectId(input.productId),
      variantId: variantOid ?? undefined,
      branchId: input.branchId,
      batchCode: input.batchCode.trim(),
      mfgDate: input.mfgDate ? new Date(input.mfgDate) : undefined,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
      qtyOnHand: input.qty,
      status: "active",
    })
    const invFilter: Record<string, unknown> = {
      tenantId: tenantOid,
      productId: new mongoose.Types.ObjectId(input.productId),
      branchId: input.branchId,
    }
    if (variantOid) invFilter.variantId = variantOid
    else invFilter.$or = [{ variantId: null }, { variantId: { $exists: false } }]
    let inv = await InventoryItemModel.findOne(invFilter)
    if (!inv) {
      inv = await InventoryItemModel.create({
        tenantId: tenantOid,
        productId: new mongoose.Types.ObjectId(input.productId),
        variantId: variantOid ?? null,
        branchId: input.branchId,
        openingStock: 0,
        currentStock: input.qty,
        reservedStock: 0,
        reorderLevel: 0,
        lowStockThreshold: 0,
      })
    } else {
      inv.currentStock += input.qty
      await inv.save()
    }
    return { id: b._id.toString(), qtyOnHand: b.qtyOnHand }
  },

  /**
   * FEFO: earliest expiry first; batches with null expiry last.
   * If explicitBatchId is set, consume from that batch only (qty must fit).
   */
  async allocateConsumption(
    tenantId: string,
    productId: string,
    variantId: string | undefined,
    branchId: string,
    qty: number,
    explicitBatchId?: string,
  ): Promise<{
    primaryBatchId: mongoose.Types.ObjectId
    batchCode: string
    expiryDate?: Date
    consumption: BatchConsumption[]
  }> {
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    const productOid = new mongoose.Types.ObjectId(productId)
    const variantClause =
      variantId && mongoose.Types.ObjectId.isValid(variantId)
        ? { variantId: new mongoose.Types.ObjectId(variantId) }
        : { $or: [{ variantId: null }, { variantId: { $exists: false } }] }

    if (explicitBatchId && mongoose.Types.ObjectId.isValid(explicitBatchId)) {
      const b = await StockBatchModel.findOne({
        _id: new mongoose.Types.ObjectId(explicitBatchId),
        tenantId: tenantOid,
        productId: productOid,
        branchId,
        status: "active",
        ...variantClause,
      })
      if (!b || b.qtyOnHand < qty) {
        const err = new Error("Insufficient quantity in selected batch")
        ;(err as Error & { statusCode?: number }).statusCode = 409
        throw err
      }
      return {
        primaryBatchId: b._id,
        batchCode: b.batchCode,
        expiryDate: b.expiryDate ?? undefined,
        consumption: [{ batchId: b._id, qty }],
      }
    }

    const batches = await StockBatchModel.find({
      tenantId: tenantOid,
      productId: productOid,
      branchId,
      status: "active",
      qtyOnHand: { $gt: 0 },
      ...variantClause,
    })
      .sort({ expiryDate: 1, createdAt: 1 })
      .lean()

    const consumption: BatchConsumption[] = []
    let remaining = qty
    for (const row of batches) {
      if (remaining <= 0) break
      const doc = row as StockBatchDoc & { _id: mongoose.Types.ObjectId }
      const take = Math.min(remaining, doc.qtyOnHand)
      if (take <= 0) continue
      consumption.push({ batchId: doc._id, qty: take })
      remaining -= take
    }
    if (remaining > 0) {
      const err = new Error("Insufficient batch stock for this line")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    const first = consumption[0]!
    const meta = batches.find((b) => (b as { _id: mongoose.Types.ObjectId })._id.equals(first.batchId))
    return {
      primaryBatchId: first.batchId,
      batchCode: (meta as { batchCode?: string })?.batchCode ?? "",
      expiryDate: (meta as { expiryDate?: Date })?.expiryDate,
      consumption,
    }
  },

  async applyConsumption(tenantId: string, consumption: BatchConsumption[]): Promise<void> {
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    for (const c of consumption) {
      const res = await StockBatchModel.updateOne(
        { _id: c.batchId, tenantId: tenantOid, qtyOnHand: { $gte: c.qty } },
        { $inc: { qtyOnHand: -c.qty } },
      )
      if (res.modifiedCount !== 1) {
        const err = new Error("Concurrent batch update failed")
        ;(err as Error & { statusCode?: number }).statusCode = 409
        throw err
      }
      const after = await StockBatchModel.findById(c.batchId).lean()
      if (after && after.qtyOnHand <= 0) {
        await StockBatchModel.updateOne({ _id: c.batchId }, { $set: { status: "depleted" } })
      }
    }
  },

  async restoreConsumption(tenantId: string, consumption: BatchConsumption[]): Promise<void> {
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    for (const c of consumption) {
      await StockBatchModel.updateOne(
        { _id: c.batchId, tenantId: tenantOid },
        { $inc: { qtyOnHand: c.qty }, $set: { status: "active" } },
      )
    }
  },

  async listNearExpiry(tenantId: string, withinDays: number) {
    const until = new Date()
    until.setDate(until.getDate() + withinDays)
    const rows = await StockBatchModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: "active",
      qtyOnHand: { $gt: 0 },
      expiryDate: { $lte: until, $gte: new Date() },
    })
      .sort({ expiryDate: 1 })
      .limit(200)
      .lean()
    return rows.map((r) => ({
      id: (r as { _id: mongoose.Types.ObjectId })._id.toString(),
      productId: (r as { productId: mongoose.Types.ObjectId }).productId.toString(),
      variantId: (r as { variantId?: mongoose.Types.ObjectId }).variantId?.toString() ?? null,
      branchId: (r as { branchId: string }).branchId,
      batchCode: (r as { batchCode: string }).batchCode,
      expiryDate: (r as { expiryDate?: Date }).expiryDate?.toISOString() ?? null,
      qtyOnHand: (r as { qtyOnHand: number }).qtyOnHand,
    }))
  },
}
