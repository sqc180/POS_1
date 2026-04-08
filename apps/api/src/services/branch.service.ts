import mongoose from "mongoose"
import { BranchModel, type BranchDoc } from "../models/branch.model.js"
import { auditService } from "./audit.service.js"

const branchCodeRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const toPublic = (b: BranchDoc) => ({
  id: b._id.toString(),
  tenantId: b.tenantId.toString(),
  code: b.code,
  name: b.name,
  kind: b.kind as "shop" | "warehouse" | "other",
  address: b.address ?? "",
  notes: b.notes ?? "",
  status: b.status as "active" | "inactive",
  sortOrder: b.sortOrder ?? 0,
  createdAt: b.createdAt?.toISOString?.() ?? "",
  updatedAt: b.updatedAt?.toISOString?.() ?? "",
})

export const branchService = {
  toPublic,

  async ensureDefaultForTenant(tenantId: string) {
    const tid = new mongoose.Types.ObjectId(tenantId)
    const n = await BranchModel.countDocuments({ tenantId: tid })
    if (n > 0) return
    await BranchModel.create({
      tenantId: tid,
      code: "main",
      name: "Main branch",
      kind: "shop",
      address: "",
      notes: "",
      status: "active",
      sortOrder: 0,
    })
  },

  async list(tenantId: string) {
    await branchService.ensureDefaultForTenant(tenantId)
    const rows = await BranchModel.find({ tenantId: new mongoose.Types.ObjectId(tenantId) }).sort({
      sortOrder: 1,
      name: 1,
    })
    return rows.map(toPublic)
  },

  async getById(tenantId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null
    const b = await BranchModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    return b ? toPublic(b) : null
  },

  async create(
    tenantId: string,
    actorId: string,
    input: {
      code: string
      name: string
      kind: "shop" | "warehouse" | "other"
      address?: string
      notes?: string
      sortOrder?: number
    },
  ) {
    const code = input.code.trim().toLowerCase()
    if (!branchCodeRegex.test(code)) {
      const err = new Error(
        'Branch code must be lowercase letters/numbers with single hyphens (e.g. "main", "wh-north").',
      )
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    try {
      const b = await BranchModel.create({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        code,
        name: input.name.trim(),
        kind: input.kind,
        address: input.address?.trim() ?? "",
        notes: input.notes?.trim() ?? "",
        status: "active",
        sortOrder: input.sortOrder ?? 0,
      })
      await auditService.log({
        tenantId,
        actorId,
        action: "branch.create",
        entity: "Branch",
        entityId: b._id.toString(),
        metadata: { code: b.code },
      })
      return toPublic(b)
    } catch (e: unknown) {
      const o = typeof e === "object" && e !== null ? (e as { code?: number }) : {}
      if (o.code === 11000) {
        const err = new Error("A branch with this code already exists")
        ;(err as Error & { statusCode?: number }).statusCode = 409
        throw err
      }
      throw e
    }
  },

  async update(
    tenantId: string,
    actorId: string,
    id: string,
    input: Partial<{
      name: string
      kind: "shop" | "warehouse" | "other"
      address: string
      notes: string
      status: "active" | "inactive"
      sortOrder: number
    }>,
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid id")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const b = await BranchModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!b) {
      const err = new Error("Not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    if (input.name !== undefined) b.name = input.name.trim()
    if (input.kind !== undefined) b.kind = input.kind
    if (input.address !== undefined) b.address = input.address.trim()
    if (input.notes !== undefined) b.notes = input.notes.trim()
    if (input.status !== undefined) b.status = input.status
    if (input.sortOrder !== undefined) b.sortOrder = input.sortOrder
    await b.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "branch.update",
      entity: "Branch",
      entityId: b._id.toString(),
      metadata: { fields: Object.keys(input) },
    })
    return toPublic(b)
  },
}
