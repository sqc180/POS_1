import mongoose from "mongoose"
import { CustomerModel, type CustomerDoc } from "../models/customer.model.js"
import { auditService } from "./audit.service.js"

const toPublic = (c: CustomerDoc) => ({
  id: c._id.toString(),
  tenantId: c.tenantId.toString(),
  name: c.name,
  phone: c.phone ?? "",
  email: c.email ?? "",
  gstin: c.gstin ?? "",
  address: c.address ?? "",
  notes: c.notes ?? "",
  status: c.status,
  createdAt: c.createdAt?.toISOString?.() ?? "",
  updatedAt: c.updatedAt?.toISOString?.() ?? "",
})

export const customerService = {
  toPublic,

  async list(tenantId: string, q?: string) {
    const filter: Record<string, unknown> = { tenantId: new mongoose.Types.ObjectId(tenantId) }
    if (q?.trim()) {
      filter.$or = [{ name: new RegExp(q.trim(), "i") }, { phone: new RegExp(q.trim(), "i") }]
    }
    const rows = await CustomerModel.find(filter).sort({ updatedAt: -1 }).limit(200)
    return rows.map(toPublic)
  },

  async getById(tenantId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null
    const c = await CustomerModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    return c ? toPublic(c) : null
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
    const c = await CustomerModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      ...input,
      status: "active",
    })
    await auditService.log({
      tenantId,
      actorId,
      action: "customer.create",
      entity: "Customer",
      entityId: c._id.toString(),
    })
    return toPublic(c)
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
    const c = await CustomerModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!c) {
      const err = new Error("Not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    Object.assign(c, input)
    if (input.status !== undefined) c.status = input.status as "active" | "inactive"
    await c.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "customer.update",
      entity: "Customer",
      entityId: c._id.toString(),
    })
    return toPublic(c)
  },
}
