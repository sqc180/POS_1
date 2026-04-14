import mongoose from "mongoose"
import { isProductBehaviorProfileId, validateProductFieldsAgainstTenantCaps } from "@repo/business-type-engine"
import type { TaxMode } from "@repo/types"
import { InventoryItemModel } from "../models/inventory-item.model.js"
import { ProductModel, type ProductDoc } from "../models/product.model.js"
import { ProductVariantModel } from "../models/product-variant.model.js"
import { loadResolvedTenantRules } from "../lib/ruleResolver.js"
import { auditService } from "./audit.service.js"

export type VariantMode = "none" | "optional" | "required"

const toPublic = (p: ProductDoc) => ({
  id: p._id.toString(),
  tenantId: p.tenantId.toString(),
  name: p.name,
  sku: p.sku,
  internalCode: p.internalCode ?? "",
  hsnSac: p.hsnSac ?? "",
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
  catalogLifecycle: (p.catalogLifecycle as "active" | "discontinued" | "archived" | undefined) ?? "active",
  variantMode: (p.variantMode as VariantMode | undefined) ?? "none",
  batchTracking: p.batchTracking === true,
  serialTracking: p.serialTracking === true,
  saleUom: (p as { saleUom?: string }).saleUom?.trim() ? String((p as { saleUom?: string }).saleUom).trim() : "",
  isLoose: (p as { isLoose?: boolean }).isLoose === true,
  behaviorProfileId: (p as { behaviorProfileId?: string }).behaviorProfileId?.trim()
    ? String((p as { behaviorProfileId?: string }).behaviorProfileId).trim()
    : null,
  behaviorProfile: {
    augmentFlags: [
      ...(((p as { behaviorProfile?: { augmentFlags?: string[] } }).behaviorProfile?.augmentFlags ?? []) as string[]),
    ].filter(Boolean),
  },
  createdAt: p.createdAt?.toISOString?.() ?? "",
  updatedAt: p.updatedAt?.toISOString?.() ?? "",
})

const tenantPilotCaps = async (tenantId: string): Promise<string[]> => {
  const r = await loadResolvedTenantRules(tenantId)
  return [...r.capabilities]
}

const assertGroceryFieldsAllowed = async (
  tenantId: string,
  augmentFlags: readonly string[] | undefined,
  saleUom: string | undefined,
  isLoose: boolean | undefined,
): Promise<void> => {
  const caps = await tenantPilotCaps(tenantId)
  const msg = validateProductFieldsAgainstTenantCaps(caps, { saleUom, isLoose, behaviorAugmentFlags: augmentFlags })
  if (msg) {
    const err = new Error(msg)
    ;(err as Error & { statusCode?: number }).statusCode = 400
    throw err
  }
}

const baseInventoryFilter = (tenantId: mongoose.Types.ObjectId, productId: mongoose.Types.ObjectId) => ({
  tenantId,
  productId,
  branchId: "main",
  $or: [{ variantId: null }, { variantId: { $exists: false } }],
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

  async listPaged(
    tenantId: string,
    opts: {
      q?: string
      categoryId?: string
      sort?: "updatedAt" | "name" | "sku" | "sellingPrice"
      order?: "asc" | "desc"
      catalogLifecycle?: "active" | "discontinued" | "archived" | "all"
      limit?: number
      skip?: number
    },
  ): Promise<{ items: ReturnType<typeof toPublic>[]; total: number; skip: number; limit: number }> {
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    const rawLimit = opts.limit ?? 25
    const rawSkip = opts.skip ?? 0
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 25, 1), 100)
    const skip = Math.max(Number.isFinite(rawSkip) ? rawSkip : 0, 0)
    const filter: Record<string, unknown> = { tenantId: tenantOid }
    if (opts.q?.trim()) {
      const esc = opts.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const rx = new RegExp(esc, "i")
      filter.$or = [{ name: rx }, { sku: rx }, { barcode: rx }, { internalCode: rx }, { hsnSac: rx }]
    }
    if (opts.categoryId && mongoose.Types.ObjectId.isValid(opts.categoryId)) {
      filter.categoryId = new mongoose.Types.ObjectId(opts.categoryId)
    }
    if (opts.catalogLifecycle && opts.catalogLifecycle !== "all") {
      filter.catalogLifecycle = opts.catalogLifecycle
    }
    const sortField = opts.sort ?? "updatedAt"
    const order = opts.order === "asc" ? 1 : -1
    const sort: Record<string, 1 | -1> = { [sortField]: order, _id: -1 }
    const [items, total] = await Promise.all([
      ProductModel.find(filter).sort(sort).skip(skip).limit(limit),
      ProductModel.countDocuments(filter),
    ])
    return { items: items.map(toPublic), total, skip, limit }
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
      variantMode?: VariantMode
      batchTracking?: boolean
      serialTracking?: boolean
      internalCode?: string
      hsnSac?: string
      catalogLifecycle?: "active" | "discontinued" | "archived"
      saleUom?: string
      isLoose?: boolean
      behaviorAugmentFlags?: string[]
      behaviorProfileId?: string | null
    },
  ) {
    const variantMode = input.variantMode ?? "none"
    if (input.serialTracking && input.batchTracking) {
      const err = new Error("Cannot enable both batch and serial tracking on the same product")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    await assertGroceryFieldsAllowed(tenantId, input.behaviorAugmentFlags, input.saleUom, input.isLoose)
    const profileId =
      input.behaviorProfileId !== undefined && input.behaviorProfileId !== null && String(input.behaviorProfileId).trim() !== ""
        ? String(input.behaviorProfileId).trim()
        : undefined
    if (profileId !== undefined && !isProductBehaviorProfileId(profileId)) {
      const err = new Error("Invalid behavior profile id")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const p = await ProductModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      name: input.name,
      sku: input.sku,
      internalCode: input.internalCode?.trim(),
      hsnSac: input.hsnSac?.trim(),
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
      catalogLifecycle: input.catalogLifecycle ?? "active",
      variantMode,
      batchTracking: input.batchTracking ?? false,
      serialTracking: input.serialTracking ?? false,
      saleUom: input.saleUom?.trim(),
      isLoose: input.isLoose ?? false,
      ...(profileId !== undefined ? { behaviorProfileId: profileId } : {}),
      behaviorProfile: {
        augmentFlags: [...(input.behaviorAugmentFlags ?? [])].map((s) => String(s).trim()).filter(Boolean),
      },
    })
    const shouldCreateBaseInventory =
      p.trackStock && (variantMode === "none" || variantMode === "optional")
    if (shouldCreateBaseInventory) {
      await InventoryItemModel.create({
        tenantId: p.tenantId,
        productId: p._id,
        variantId: null,
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
      variantMode: VariantMode
      batchTracking: boolean
      serialTracking: boolean
      internalCode: string
      hsnSac: string
      catalogLifecycle: "active" | "discontinued" | "archived"
      saleUom: string
      isLoose: boolean
      behaviorAugmentFlags: string[]
      behaviorProfileId: string | null
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
    const nextAugment =
      input.behaviorAugmentFlags !== undefined
        ? [...input.behaviorAugmentFlags].map((s) => String(s).trim()).filter(Boolean)
        : (((p as { behaviorProfile?: { augmentFlags?: string[] } }).behaviorProfile?.augmentFlags ?? []) as string[])
    const nextSaleUom = input.saleUom !== undefined ? input.saleUom.trim() : String((p as { saleUom?: string }).saleUom ?? "").trim()
    const nextIsLoose = input.isLoose !== undefined ? input.isLoose : (p as { isLoose?: boolean }).isLoose === true
    await assertGroceryFieldsAllowed(tenantId, nextAugment, nextSaleUom || undefined, nextIsLoose)
    const wasTrack = p.trackStock
    if (input.name !== undefined) p.name = input.name
    if (input.sku !== undefined) p.sku = input.sku
    if (input.internalCode !== undefined) p.internalCode = input.internalCode.trim() === "" ? undefined : input.internalCode.trim()
    if (input.hsnSac !== undefined) p.hsnSac = input.hsnSac.trim() === "" ? undefined : input.hsnSac.trim()
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
    if (input.catalogLifecycle !== undefined) {
      p.catalogLifecycle = input.catalogLifecycle
    }
    if (input.saleUom !== undefined) {
      ;(p as { saleUom?: string }).saleUom = input.saleUom.trim() === "" ? undefined : input.saleUom.trim()
    }
    if (input.isLoose !== undefined) {
      ;(p as { isLoose?: boolean }).isLoose = input.isLoose
    }
    if (input.behaviorAugmentFlags !== undefined) {
      ;(p as { behaviorProfile?: { augmentFlags: string[] } }).behaviorProfile = {
        ...((p as { behaviorProfile?: { augmentFlags?: string[] } }).behaviorProfile ?? {}),
        augmentFlags: [...input.behaviorAugmentFlags].map((s) => String(s).trim()).filter(Boolean),
      }
    }
    if (input.behaviorProfileId !== undefined) {
      const raw = input.behaviorProfileId === null ? "" : String(input.behaviorProfileId).trim()
      if (raw === "") {
        ;(p as { behaviorProfileId?: string }).behaviorProfileId = undefined
      } else if (!isProductBehaviorProfileId(raw)) {
        const err = new Error("Invalid behavior profile id")
        ;(err as Error & { statusCode?: number }).statusCode = 400
        throw err
      } else {
        ;(p as { behaviorProfileId?: string }).behaviorProfileId = raw
      }
    }
    if (input.variantMode !== undefined) {
      if (input.variantMode === "required") {
        const n = await ProductVariantModel.countDocuments({
          tenantId: p.tenantId,
          productId: p._id,
          status: "active",
        })
        if (n < 1) {
          const err = new Error("Add at least one active variant before setting variant mode to required")
          ;(err as Error & { statusCode?: number }).statusCode = 400
          throw err
        }
      }
      p.variantMode = input.variantMode
    }
    if (input.batchTracking !== undefined || input.serialTracking !== undefined) {
      const nextBatch = input.batchTracking !== undefined ? input.batchTracking : p.batchTracking
      const nextSerial = input.serialTracking !== undefined ? input.serialTracking : p.serialTracking
      if (nextBatch && nextSerial) {
        const err = new Error("Cannot enable both batch and serial tracking on the same product")
        ;(err as Error & { statusCode?: number }).statusCode = 400
        throw err
      }
      if (input.batchTracking !== undefined) p.batchTracking = input.batchTracking
      if (input.serialTracking !== undefined) p.serialTracking = input.serialTracking
    }
    await p.save()
    if (!wasTrack && p.trackStock) {
      const mode = ((p.variantMode as VariantMode | undefined) ?? "none") as VariantMode
      if (mode === "none" || mode === "optional") {
        const existing = await InventoryItemModel.findOne(baseInventoryFilter(p.tenantId, p._id))
        if (!existing) {
          await InventoryItemModel.create({
            tenantId: p.tenantId,
            productId: p._id,
            variantId: null,
            branchId: "main",
            openingStock: 0,
            currentStock: 0,
            reservedStock: 0,
            reorderLevel: 0,
            lowStockThreshold: 0,
          })
        }
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
