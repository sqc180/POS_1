import mongoose from "mongoose"
import { CategoryModel, type CategoryDoc } from "../models/category.model.js"
import { auditService } from "./audit.service.js"

const toPublic = (c: CategoryDoc) => ({
  id: c._id.toString(),
  tenantId: c.tenantId.toString(),
  name: c.name,
  parentId: c.parentId ? c.parentId.toString() : null,
  status: c.status,
  sortOrder: c.sortOrder,
  createdAt: c.createdAt?.toISOString?.() ?? "",
  updatedAt: c.updatedAt?.toISOString?.() ?? "",
})

export const categoryService = {
  toPublic,

  async list(tenantId: string) {
    const items = await CategoryModel.find({ tenantId: new mongoose.Types.ObjectId(tenantId) }).sort({
      sortOrder: 1,
      name: 1,
    })
    return items.map(toPublic)
  },

  async create(tenantId: string, actorId: string, input: { name: string; parentId?: string | null; sortOrder?: number }) {
    const parentId =
      input.parentId && mongoose.Types.ObjectId.isValid(input.parentId)
        ? new mongoose.Types.ObjectId(input.parentId)
        : null
    if (parentId) {
      const parent = await CategoryModel.findOne({
        _id: parentId,
        tenantId: new mongoose.Types.ObjectId(tenantId),
      })
      if (!parent) {
        const err = new Error("Parent category not found")
        ;(err as Error & { statusCode?: number }).statusCode = 400
        throw err
      }
    }
    const c = await CategoryModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      name: input.name,
      parentId,
      sortOrder: input.sortOrder ?? 0,
      status: "active",
    })
    await auditService.log({
      tenantId,
      actorId,
      action: "category.create",
      entity: "Category",
      entityId: c._id.toString(),
    })
    return toPublic(c)
  },

  async update(
    tenantId: string,
    actorId: string,
    id: string,
    input: Partial<{ name: string; parentId: string | null; status: string; sortOrder: number }>,
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid id")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const c = await CategoryModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!c) {
      const err = new Error("Not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    if (input.name !== undefined) c.name = input.name
    if (input.sortOrder !== undefined) c.sortOrder = input.sortOrder
    if (input.status !== undefined) c.status = input.status as "active" | "inactive"
    if (input.parentId !== undefined) {
      if (input.parentId === null) c.parentId = null
      else if (mongoose.Types.ObjectId.isValid(input.parentId)) {
        const pid = new mongoose.Types.ObjectId(input.parentId)
        if (pid.equals(c._id)) {
          const err = new Error("Category cannot be its own parent")
          ;(err as Error & { statusCode?: number }).statusCode = 400
          throw err
        }
        c.parentId = pid
      }
    }
    await c.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "category.update",
      entity: "Category",
      entityId: c._id.toString(),
    })
    return toPublic(c)
  },
}
