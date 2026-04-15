import mongoose from "mongoose"
import { InventoryLocationModel, type InventoryLocationDoc } from "../models/inventory-location.model.js"

const toPublic = (row: InventoryLocationDoc) => ({
  id: row._id.toString(),
  tenantId: row.tenantId.toString(),
  branchId: row.branchId,
  code: row.code,
  name: row.name,
  kind: row.kind,
  status: row.status,
  createdAt: row.createdAt?.toISOString?.() ?? "",
  updatedAt: row.updatedAt?.toISOString?.() ?? "",
})

export const inventoryLocationService = {
  toPublic,

  async list(tenantId: string, branchId?: string) {
    const filter: Record<string, unknown> = { tenantId: new mongoose.Types.ObjectId(tenantId) }
    if (branchId?.trim()) filter.branchId = branchId.trim()
    const rows = await InventoryLocationModel.find(filter).sort({ branchId: 1, code: 1 }).limit(500)
    return rows.map(toPublic)
  },
}
