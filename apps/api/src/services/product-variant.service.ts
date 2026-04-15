import mongoose from "mongoose"
import { InventoryItemModel } from "../models/inventory-item.model.js"
import { ProductModel } from "../models/product.model.js"
import { ProductVariantModel, type ProductVariantDoc } from "../models/product-variant.model.js"
import { auditService } from "./audit.service.js"

const toPublic = (v: ProductVariantDoc) => ({
  id: v._id.toString(),
  tenantId: v.tenantId.toString(),
  productId: v.productId.toString(),
  label: v.label,
  sku: v.sku,
  barcode: v.barcode ?? "",
  sellingPrice: v.sellingPrice,
  gstSlabId: v.gstSlabId?.toString() ?? null,
  taxMode: v.taxMode ?? null,
  status: v.status,
  createdAt: v.createdAt?.toISOString?.() ?? "",
  updatedAt: v.updatedAt?.toISOString?.() ?? "",
})

export const productVariantService = {
  toPublic,

  async listByProduct(tenantId: string, productId: string) {
    if (!mongoose.Types.ObjectId.isValid(productId)) return []
    const rows = await ProductVariantModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      productId: new mongoose.Types.ObjectId(productId),
    }).sort({ createdAt: 1 })
    return rows.map(toPublic)
  },

  async create(
    tenantId: string,
    actorId: string,
    productId: string,
    input: {
      label: string
      sku: string
      barcode?: string
      sellingPrice?: number
      gstSlabId?: string
      taxMode?: "inclusive" | "exclusive"
    },
  ) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      const err = new Error("Invalid product")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const product = await ProductModel.findOne({
      _id: new mongoose.Types.ObjectId(productId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!product) {
      const err = new Error("Product not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    if (product.variantMode === "none") {
      const err = new Error("Enable variant mode on the product before adding variants")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const v = await ProductVariantModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      productId: new mongoose.Types.ObjectId(productId),
      label: input.label.trim(),
      sku: input.sku.trim(),
      barcode: input.barcode?.trim(),
      sellingPrice: input.sellingPrice,
      gstSlabId:
        input.gstSlabId && mongoose.Types.ObjectId.isValid(input.gstSlabId)
          ? new mongoose.Types.ObjectId(input.gstSlabId)
          : undefined,
      taxMode: input.taxMode,
      status: "active",
    })
    if (product.trackStock) {
      const branchId = "main"
      const exists = await InventoryItemModel.findOne({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        productId: new mongoose.Types.ObjectId(productId),
        branchId,
        variantId: v._id,
      })
      if (!exists) {
        await InventoryItemModel.create({
          tenantId: new mongoose.Types.ObjectId(tenantId),
          productId: new mongoose.Types.ObjectId(productId),
          variantId: v._id,
          branchId,
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
      action: "product_variant.create",
      entity: "ProductVariant",
      entityId: v._id.toString(),
      metadata: { productId },
    })
    return toPublic(v)
  },

  async update(
    tenantId: string,
    actorId: string,
    productId: string,
    variantId: string,
    input: Partial<{
      label: string
      sku: string
      barcode: string
      sellingPrice: number | null
      gstSlabId: string | null
      taxMode: "inclusive" | "exclusive" | null
      status: "active" | "inactive"
    }>,
  ) {
    if (!mongoose.Types.ObjectId.isValid(variantId) || !mongoose.Types.ObjectId.isValid(productId)) {
      const err = new Error("Invalid id")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const v = await ProductVariantModel.findOne({
      _id: new mongoose.Types.ObjectId(variantId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      productId: new mongoose.Types.ObjectId(productId),
    })
    if (!v) {
      const err = new Error("Variant not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    if (input.label !== undefined) v.label = input.label.trim()
    if (input.sku !== undefined) v.sku = input.sku.trim()
    if (input.barcode !== undefined) v.barcode = input.barcode.trim()
    if (input.sellingPrice !== undefined) v.sellingPrice = input.sellingPrice === null ? undefined : input.sellingPrice
    if (input.gstSlabId !== undefined) {
      v.gstSlabId =
        input.gstSlabId && mongoose.Types.ObjectId.isValid(input.gstSlabId)
          ? new mongoose.Types.ObjectId(input.gstSlabId)
          : undefined
    }
    if (input.taxMode !== undefined) v.taxMode = input.taxMode === null ? undefined : input.taxMode
    if (input.status !== undefined) v.status = input.status
    await v.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "product_variant.update",
      entity: "ProductVariant",
      entityId: v._id.toString(),
      metadata: { productId },
    })
    return toPublic(v)
  },

  async deactivateIfNoStock(tenantId: string, actorId: string, productId: string, variantId: string) {
    if (!mongoose.Types.ObjectId.isValid(variantId)) {
      const err = new Error("Invalid id")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const v = await ProductVariantModel.findOne({
      _id: new mongoose.Types.ObjectId(variantId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      productId: new mongoose.Types.ObjectId(productId),
    })
    if (!v) {
      const err = new Error("Variant not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    const inv = await InventoryItemModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      productId: new mongoose.Types.ObjectId(productId),
      variantId: v._id,
    })
    if (inv && inv.currentStock > 0) {
      const err = new Error("Cannot deactivate variant with remaining stock")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    v.status = "inactive"
    await v.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "product_variant.deactivate",
      entity: "ProductVariant",
      entityId: v._id.toString(),
    })
    return toPublic(v)
  },
}
