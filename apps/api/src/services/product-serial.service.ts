import mongoose from "mongoose"
import { ProductModel } from "../models/product.model.js"
import { ProductSerialModel } from "../models/product-serial.model.js"

export const productSerialService = {
  async register(
    tenantId: string,
    actorId: string,
    input: { productId: string; variantId?: string; serialNumber: string },
  ): Promise<{ id: string }> {
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    const p = await ProductModel.findOne({
      _id: new mongoose.Types.ObjectId(input.productId),
      tenantId: tenantOid,
    })
    if (!p?.serialTracking) {
      const err = new Error("Serial tracking is not enabled for this product")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const sn = input.serialNumber.trim()
    if (!sn) {
      const err = new Error("Serial number required")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const variantOid =
      input.variantId && mongoose.Types.ObjectId.isValid(input.variantId)
        ? new mongoose.Types.ObjectId(input.variantId)
        : undefined
    const doc = await ProductSerialModel.create({
      tenantId: tenantOid,
      productId: new mongoose.Types.ObjectId(input.productId),
      variantId: variantOid,
      serialNumber: sn,
      status: "available",
    })
    void actorId
    return { id: doc._id.toString() }
  },

  async assertAvailableForSale(
    tenantId: string,
    productId: string,
    variantId: string | undefined,
    serials: string[],
    qty: number,
  ): Promise<void> {
    if (serials.length !== qty) {
      const err = new Error(`Provide exactly ${qty} serial numbers for this line`)
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const uniq = new Set(serials.map((s) => s.trim()))
    if (uniq.size !== serials.length) {
      const err = new Error("Duplicate serial numbers in request")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    const productOid = new mongoose.Types.ObjectId(productId)
    for (const raw of serials) {
      const serialNumber = raw.trim()
      const q: Record<string, unknown> = {
        tenantId: tenantOid,
        productId: productOid,
        serialNumber,
        status: "available",
      }
      if (variantId && mongoose.Types.ObjectId.isValid(variantId)) {
        q.variantId = new mongoose.Types.ObjectId(variantId)
      } else {
        q.$or = [{ variantId: null }, { variantId: { $exists: false } }]
      }
      const row = await ProductSerialModel.findOne(q)
      if (!row) {
        const err = new Error(`Serial not available: ${serialNumber}`)
        ;(err as Error & { statusCode?: number }).statusCode = 409
        throw err
      }
    }
  },

  async markSold(
    tenantId: string,
    invoiceId: string,
    productId: string,
    variantId: string | undefined,
    serials: string[],
    lineIndex: number,
  ): Promise<void> {
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    const invOid = new mongoose.Types.ObjectId(invoiceId)
    const productOid = new mongoose.Types.ObjectId(productId)
    for (const raw of serials) {
      const serialNumber = raw.trim()
      const filter: Record<string, unknown> = {
        tenantId: tenantOid,
        productId: productOid,
        serialNumber,
        status: "available",
      }
      if (variantId && mongoose.Types.ObjectId.isValid(variantId)) {
        filter.variantId = new mongoose.Types.ObjectId(variantId)
      } else {
        filter.$or = [{ variantId: null }, { variantId: { $exists: false } }]
      }
      const res = await ProductSerialModel.updateOne(
        filter,
        {
          $set: {
            status: "sold",
            invoiceId: invOid,
            invoiceLineIndex: lineIndex,
          },
        },
      )
      if (res.modifiedCount !== 1) {
        const err = new Error(`Serial could not be sold: ${serialNumber}`)
        ;(err as Error & { statusCode?: number }).statusCode = 409
        throw err
      }
    }
  },

  async markAvailableAfterCancel(
    tenantId: string,
    invoiceId: string,
    productId: string,
    serials: string[],
  ): Promise<void> {
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    const invOid = new mongoose.Types.ObjectId(invoiceId)
    const productOid = new mongoose.Types.ObjectId(productId)
    for (const raw of serials) {
      const serialNumber = raw.trim()
      await ProductSerialModel.updateMany(
        {
          tenantId: tenantOid,
          productId: productOid,
          serialNumber,
          invoiceId: invOid,
          status: "sold",
        },
        {
          $set: { status: "available" },
          $unset: { invoiceId: 1, invoiceLineIndex: 1 },
        },
      )
    }
  },

  async listForProduct(tenantId: string, productId: string, status?: string) {
    const q: Record<string, unknown> = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      productId: new mongoose.Types.ObjectId(productId),
    }
    if (status) q.status = status
    const rows = await ProductSerialModel.find(q).sort({ createdAt: -1 }).limit(500).lean()
    return rows.map((r) => ({
      id: (r as { _id: mongoose.Types.ObjectId })._id.toString(),
      serialNumber: (r as { serialNumber: string }).serialNumber,
      status: (r as { status: string }).status,
      variantId: (r as { variantId?: mongoose.Types.ObjectId }).variantId?.toString() ?? null,
    }))
  },
}
