import mongoose from "mongoose"
import { ProductModel } from "../models/product.model.js"
import { UnavailableMedicineRequestModel } from "../models/unavailable-medicine-request.model.js"

const toPublic = (r: {
  _id: mongoose.Types.ObjectId
  tenantId: mongoose.Types.ObjectId
  branchId?: string
  productId?: mongoose.Types.ObjectId | null
  requestedName?: string | null
  note?: string
  status?: string
  createdBy: mongoose.Types.ObjectId
  createdAt?: Date
}) => ({
  id: r._id.toString(),
  tenantId: r.tenantId.toString(),
  branchId: r.branchId ?? "main",
  productId: r.productId?.toString() ?? null,
  requestedName: r.requestedName != null && r.requestedName !== "" ? String(r.requestedName) : "",
  note: r.note ?? "",
  status: r.status ?? "open",
  createdBy: r.createdBy.toString(),
  createdAt: r.createdAt?.toISOString?.() ?? "",
})

export const unavailableMedicineService = {
  toPublic,

  async list(tenantId: string, status?: string) {
    const q: Record<string, unknown> = { tenantId: new mongoose.Types.ObjectId(tenantId) }
    if (status) q.status = status
    const rows = await UnavailableMedicineRequestModel.find(q).sort({ createdAt: -1 }).limit(500).lean()
    return rows.map((x) => toPublic(x as Parameters<typeof toPublic>[0]))
  },

  async create(
    tenantId: string,
    actorId: string,
    input: { branchId?: string; productId?: string; requestedName?: string; note?: string },
  ) {
    const branchId = input.branchId?.trim() || "main"
    let requestedName = input.requestedName?.trim() ?? ""
    let productOid: mongoose.Types.ObjectId | undefined
    if (input.productId && mongoose.Types.ObjectId.isValid(input.productId)) {
      const p = await ProductModel.findOne({
        _id: new mongoose.Types.ObjectId(input.productId),
        tenantId: new mongoose.Types.ObjectId(tenantId),
      })
      if (!p) {
        const err = new Error("Product not found")
        ;(err as Error & { statusCode?: number }).statusCode = 400
        throw err
      }
      productOid = p._id
      if (!requestedName) requestedName = p.name
    }
    if (!requestedName) {
      const err = new Error("requestedName or productId is required")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const doc = await UnavailableMedicineRequestModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      branchId,
      productId: productOid,
      requestedName,
      note: input.note?.trim() ?? "",
      status: "open",
      createdBy: new mongoose.Types.ObjectId(actorId),
    })
    return toPublic(doc)
  },
}
