import mongoose from "mongoose"
import { GstSlabModel, type GstSlabDoc } from "../models/gst-slab.model.js"
import { auditService } from "./audit.service.js"

const toPublic = (g: GstSlabDoc) => ({
  id: g._id.toString(),
  tenantId: g.tenantId.toString(),
  name: g.name,
  cgstRate: g.cgstRate,
  sgstRate: g.sgstRate,
  igstRate: g.igstRate,
  status: g.status,
  createdAt: g.createdAt?.toISOString?.() ?? "",
  updatedAt: g.updatedAt?.toISOString?.() ?? "",
})

export const gstSlabService = {
  toPublic,

  async list(tenantId: string) {
    const rows = await GstSlabModel.find({ tenantId: new mongoose.Types.ObjectId(tenantId) }).sort({ name: 1 })
    return rows.map(toPublic)
  },

  async create(
    tenantId: string,
    actorId: string,
    input: { name: string; cgstRate: number; sgstRate: number; igstRate: number },
  ) {
    const g = await GstSlabModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      ...input,
      status: "active",
    })
    await auditService.log({
      tenantId,
      actorId,
      action: "gst_slab.create",
      entity: "GstSlab",
      entityId: g._id.toString(),
    })
    return toPublic(g)
  },

  async update(
    tenantId: string,
    actorId: string,
    id: string,
    input: Partial<{ name: string; status: string; cgstRate: number; sgstRate: number; igstRate: number }>,
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid id")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const g = await GstSlabModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!g) {
      const err = new Error("Not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    if (input.name !== undefined) g.name = input.name
    if (input.status !== undefined) g.status = input.status as "active" | "inactive"
    if (input.cgstRate !== undefined) g.cgstRate = input.cgstRate
    if (input.sgstRate !== undefined) g.sgstRate = input.sgstRate
    if (input.igstRate !== undefined) g.igstRate = input.igstRate
    await g.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "gst_slab.update",
      entity: "GstSlab",
      entityId: g._id.toString(),
    })
    return toPublic(g)
  },
}
