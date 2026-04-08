import mongoose from "mongoose"
import { SupplierModel, type SupplierDoc } from "../models/supplier.model.js"
import { auditService } from "./audit.service.js"

const toPublic = (s: SupplierDoc) => ({
  id: s._id.toString(),
  tenantId: s.tenantId.toString(),
  name: s.name,
  phone: s.phone ?? "",
  email: s.email ?? "",
  gstin: s.gstin ?? "",
  address: s.address ?? "",
  notes: s.notes ?? "",
  status: s.status,
  createdAt: s.createdAt?.toISOString?.() ?? "",
  updatedAt: s.updatedAt?.toISOString?.() ?? "",
})

export const supplierService = {
  toPublic,

  async list(tenantId: string, q?: string) {
    const filter: Record<string, unknown> = { tenantId: new mongoose.Types.ObjectId(tenantId) }
    if (q?.trim()) {
      filter.name = new RegExp(q.trim(), "i")
    }
    const rows = await SupplierModel.find(filter).sort({ updatedAt: -1 }).limit(200)
    return rows.map(toPublic)
  },

  async getById(tenantId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null
    const s = await SupplierModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    return s ? toPublic(s) : null
  },

  async create(
    tenantId: string,
    actorId: string,
    input: {
      name: string
      phone?: string
      email?: string
      gstin?: string
      address?: string
      notes?: string
    },
  ) {
    const s = await SupplierModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      ...input,
      status: "active",
    })
    await auditService.log({
      tenantId,
      actorId,
      action: "supplier.create",
      entity: "Supplier",
      entityId: s._id.toString(),
    })
    return toPublic(s)
  },

  async update(
    tenantId: string,
    actorId: string,
    id: string,
    input: Partial<{
      name: string
      phone: string
      email: string
      gstin: string
      address: string
      notes: string
      status: string
    }>,
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid id")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const s = await SupplierModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!s) {
      const err = new Error("Not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    Object.assign(s, input)
    if (input.status !== undefined) s.status = input.status as "active" | "inactive"
    await s.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "supplier.update",
      entity: "Supplier",
      entityId: s._id.toString(),
    })
    return toPublic(s)
  },
}
