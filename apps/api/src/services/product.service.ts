import mongoose from "mongoose"
import type { TaxMode } from "@repo/types"
import { InventoryItemModel } from "../models/inventory-item.model.js"
import { ProductModel, type ProductDoc } from "../models/product.model.js"
import { auditService } from "./audit.service.js"

const toPublic = (p: ProductDoc) => ({
  id: p._id.toString(),
  tenantId: p.tenantId.toString(),
  name: p.name,
  sku: p.sku,
  barcode: p.barcode ?? "",
  categoryId: p.categoryId?.toString() ?? null,
  gstSlabId: p.gstSlabId?.toString() ?? null,
  taxMode: p.taxMode as TaxMode,
  sellingPrice: p.sellingPrice,
  costPrice: p.costPrice ?? 0,
  mrp: p.mrp,
  trackStock: p.trackStock,
  brand: p.brand ?? "",
  unit: p.unit ?? "",
  imageUrl: p.imageUrl ?? "",
  status: p.status,
  createdAt: p.createdAt?.toISOString?.() ?? "",
  updatedAt: p.updatedAt?.toISOString?.() ?? "",
})

export const productService = {
  toPublic,

  async list(tenantId: string, q?: string) {
    const filter: Record<string, unknown> = { tenantId: new mongoose.Types.ObjectId(tenantId) }
    if (q?.trim()) {
      filter.$or = [
        { name: new RegExp(q.trim(), "i") },
        { sku: new RegExp(q.trim(), "i") },
        { barcode: new RegExp(q.trim(), "i") },
      ]
    }
    const items = await ProductModel.find(filter).sort({ updatedAt: -1 }).limit(200)
    return items.map(toPublic)
  },

  async getById(tenantId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null
    const p = await ProductModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    return p ? toPublic(p) : null
  },

  async create(
    tenantId: string,
    actorId: string,
    input: {
      name: string
      sku: string
      barcode?: string
      categoryId?: string
      gstSlabId?: string
      taxMode?: TaxMode
      sellingPrice: number
      costPrice?: number
      mrp?: number
      trackStock?: boolean
      brand?: string
      unit?: string
      imageUrl?: string
    },
  ) {
    const p = await ProductModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      name: input.name,
      sku: input.sku,
      barcode: input.barcode,
      categoryId: input.categoryId && mongoose.Types.ObjectId.isValid(input.categoryId)
        ? new mongoose.Types.ObjectId(input.categoryId)
        : undefined,
      gstSlabId: input.gstSlabId && mongoose.Types.ObjectId.isValid(input.gstSlabId)
        ? new mongoose.Types.ObjectId(input.gstSlabId)
        : undefined,
      taxMode: input.taxMode ?? "exclusive",
      sellingPrice: input.sellingPrice,
      costPrice: input.costPrice ?? 0,
      mrp: input.mrp,
      trackStock: input.trackStock ?? true,
      brand: input.brand,
      unit: input.unit,
      imageUrl: input.imageUrl,
      status: "active",
    })
    if (p.trackStock) {
      await InventoryItemModel.create({
        tenantId: p.tenantId,
        productId: p._id,
        branchId: "main",
        openingStock: 0,
        currentStock: 0,
        reservedStock: 0,
        reorderLevel: 0,
        lowStockThreshold: 0,
      })
    }
    await auditService.log({
      tenantId,
      actorId,
      action: "product.create",
      entity: "Product",
      entityId: p._id.toString(),
    })
    return toPublic(p)
  },

  async update(
    tenantId: string,
    actorId: string,
    id: string,
    input: Partial<{
      name: string
      sku: string
      barcode: string
      categoryId: string | null
      gstSlabId: string | null
      taxMode: TaxMode
      sellingPrice: number
      costPrice: number
      mrp: number
      trackStock: boolean
      brand: string
      unit: string
      imageUrl: string
      status: string
    }>,
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid id")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const p = await ProductModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!p) {
      const err = new Error("Not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    const wasTrack = p.trackStock
    if (input.name !== undefined) p.name = input.name
    if (input.sku !== undefined) p.sku = input.sku
    if (input.barcode !== undefined) p.barcode = input.barcode
    if (input.categoryId !== undefined) {
      p.categoryId =
        input.categoryId && mongoose.Types.ObjectId.isValid(input.categoryId)
          ? new mongoose.Types.ObjectId(input.categoryId)
          : undefined
    }
    if (input.gstSlabId !== undefined) {
      p.gstSlabId =
        input.gstSlabId && mongoose.Types.ObjectId.isValid(input.gstSlabId)
          ? new mongoose.Types.ObjectId(input.gstSlabId)
          : undefined
    }
    if (input.taxMode !== undefined) p.taxMode = input.taxMode
    if (input.sellingPrice !== undefined) p.sellingPrice = input.sellingPrice
    if (input.costPrice !== undefined) p.costPrice = input.costPrice
    if (input.mrp !== undefined) p.mrp = input.mrp
    if (input.trackStock !== undefined) p.trackStock = input.trackStock
    if (input.brand !== undefined) p.brand = input.brand
    if (input.unit !== undefined) p.unit = input.unit
    if (input.imageUrl !== undefined) p.imageUrl = input.imageUrl
    if (input.status !== undefined) p.status = input.status as "active" | "inactive"
    await p.save()
    if (!wasTrack && p.trackStock) {
      const existing = await InventoryItemModel.findOne({
        tenantId: p.tenantId,
        productId: p._id,
        branchId: "main",
      })
      if (!existing) {
        await InventoryItemModel.create({
          tenantId: p.tenantId,
          productId: p._id,
          branchId: "main",
          openingStock: 0,
          currentStock: 0,
          reservedStock: 0,
          reorderLevel: 0,
          lowStockThreshold: 0,
        })
      }
    }
    await auditService.log({
      tenantId,
      actorId,
      action: "product.update",
      entity: "Product",
      entityId: p._id.toString(),
    })
    return toPublic(p)
  },
}
