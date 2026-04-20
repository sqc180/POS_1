import mongoose from "mongoose"
import { GoodsReceiptNoteModel } from "../models/goods-receipt-note.model.js"
import { PurchaseRequisitionModel } from "../models/purchase-requisition.model.js"
import { StockTransferRequestModel } from "../models/stock-transfer-request.model.js"

const toPublicPr = (r: {
  _id: mongoose.Types.ObjectId
  tenantId: mongoose.Types.ObjectId
  branchId?: string
  title?: string
  lines?: { productId: mongoose.Types.ObjectId; qty: number; note?: string }[]
  status?: string
  createdBy: mongoose.Types.ObjectId
  createdAt?: Date
}) => ({
  id: r._id.toString(),
  tenantId: r.tenantId.toString(),
  branchId: r.branchId ?? "main",
  title: r.title ?? "",
  lines: (r.lines ?? []).map((l) => ({
    productId: l.productId.toString(),
    qty: l.qty,
    note: l.note ?? "",
  })),
  status: r.status ?? "draft",
  createdBy: r.createdBy.toString(),
  createdAt: r.createdAt?.toISOString?.() ?? "",
})

const toPublicGrn = (r: {
  _id: mongoose.Types.ObjectId
  tenantId: mongoose.Types.ObjectId
  branchId?: string
  supplierId?: mongoose.Types.ObjectId | null
  lines?: {
    productId: mongoose.Types.ObjectId
    qty: number
    batchCode?: string
    expiryDate?: Date | null
  }[]
  status?: string
  createdBy: mongoose.Types.ObjectId
  createdAt?: Date
}) => ({
  id: r._id.toString(),
  tenantId: r.tenantId.toString(),
  branchId: r.branchId ?? "main",
  supplierId: r.supplierId?.toString() ?? null,
  lines: (r.lines ?? []).map((l) => ({
    productId: l.productId.toString(),
    qty: l.qty,
    batchCode: l.batchCode ?? "",
    expiryDate: l.expiryDate?.toISOString?.() ?? null,
  })),
  status: r.status ?? "draft",
  createdBy: r.createdBy.toString(),
  createdAt: r.createdAt?.toISOString?.() ?? "",
})

const toPublicStr = (r: {
  _id: mongoose.Types.ObjectId
  tenantId: mongoose.Types.ObjectId
  fromBranchId: string
  toBranchId: string
  lines?: { productId: mongoose.Types.ObjectId; variantId?: mongoose.Types.ObjectId | null; qty: number }[]
  status?: string
  createdBy: mongoose.Types.ObjectId
  createdAt?: Date
}) => ({
  id: r._id.toString(),
  tenantId: r.tenantId.toString(),
  fromBranchId: r.fromBranchId,
  toBranchId: r.toBranchId,
  lines: (r.lines ?? []).map((l) => ({
    productId: l.productId.toString(),
    variantId: l.variantId?.toString() ?? null,
    qty: l.qty,
  })),
  status: r.status ?? "pending",
  createdBy: r.createdBy.toString(),
  createdAt: r.createdAt?.toISOString?.() ?? "",
})

export const procurementService = {
  async listRequisitions(tenantId: string) {
    const rows = await PurchaseRequisitionModel.find({ tenantId: new mongoose.Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean()
    return rows.map((x) => toPublicPr(x as Parameters<typeof toPublicPr>[0]))
  },

  async createRequisition(
    tenantId: string,
    actorId: string,
    input: { branchId?: string; title?: string; lines: { productId: string; qty: number; note?: string }[] },
  ) {
    const lines = input.lines
      .filter((l) => mongoose.Types.ObjectId.isValid(l.productId) && l.qty > 0)
      .map((l) => ({
        productId: new mongoose.Types.ObjectId(l.productId),
        qty: l.qty,
        note: l.note?.trim() ?? "",
      }))
    const doc = await PurchaseRequisitionModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      branchId: input.branchId?.trim() || "main",
      title: input.title?.trim() || "Purchase requisition",
      lines,
      status: "draft",
      createdBy: new mongoose.Types.ObjectId(actorId),
    })
    return toPublicPr(doc)
  },

  async listGrnDrafts(tenantId: string) {
    const rows = await GoodsReceiptNoteModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: "draft",
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean()
    return rows.map((x) => toPublicGrn(x as Parameters<typeof toPublicGrn>[0]))
  },

  async createGrnDraft(
    tenantId: string,
    actorId: string,
    input: {
      branchId?: string
      supplierId?: string
      lines: { productId: string; qty: number; batchCode?: string; expiryDate?: string | null }[]
    },
  ) {
    const lines = input.lines
      .filter((l) => mongoose.Types.ObjectId.isValid(l.productId) && l.qty > 0)
      .map((l) => ({
        productId: new mongoose.Types.ObjectId(l.productId),
        qty: l.qty,
        batchCode: l.batchCode?.trim() ?? "",
        expiryDate: l.expiryDate ? new Date(l.expiryDate) : undefined,
      }))
    const doc = await GoodsReceiptNoteModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      branchId: input.branchId?.trim() || "main",
      supplierId:
        input.supplierId && mongoose.Types.ObjectId.isValid(input.supplierId)
          ? new mongoose.Types.ObjectId(input.supplierId)
          : undefined,
      lines,
      status: "draft",
      createdBy: new mongoose.Types.ObjectId(actorId),
    })
    return toPublicGrn(doc)
  },

  async listStockTransfers(tenantId: string) {
    const rows = await StockTransferRequestModel.find({ tenantId: new mongoose.Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean()
    return rows.map((x) => toPublicStr(x as Parameters<typeof toPublicStr>[0]))
  },

  async createStockTransfer(
    tenantId: string,
    actorId: string,
    input: {
      fromBranchId: string
      toBranchId: string
      lines: { productId: string; variantId?: string; qty: number }[]
    },
  ) {
    const fromBranchId = input.fromBranchId.trim()
    const toBranchId = input.toBranchId.trim()
    if (!fromBranchId || !toBranchId || fromBranchId === toBranchId) {
      const err = new Error("Invalid branch pair")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const lines = input.lines
      .filter((l) => mongoose.Types.ObjectId.isValid(l.productId) && l.qty > 0)
      .map((l) => ({
        productId: new mongoose.Types.ObjectId(l.productId),
        variantId:
          l.variantId && mongoose.Types.ObjectId.isValid(l.variantId)
            ? new mongoose.Types.ObjectId(l.variantId)
            : undefined,
        qty: l.qty,
      }))
    const doc = await StockTransferRequestModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      fromBranchId,
      toBranchId,
      lines,
      status: "pending",
      createdBy: new mongoose.Types.ObjectId(actorId),
    })
    return toPublicStr(doc)
  },
}
