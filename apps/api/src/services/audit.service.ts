import mongoose from "mongoose"
import type { AuditLogEntryDTO } from "@repo/types"
import { AuditLogModel } from "../models/audit-log.model.js"

export const auditService = {
  async log(input: {
    tenantId: string
    actorId: string
    action: string
    entity: string
    entityId?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    await AuditLogModel.create({
      tenantId: new mongoose.Types.ObjectId(input.tenantId),
      actorId: new mongoose.Types.ObjectId(input.actorId),
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      metadata: input.metadata,
    })
  },

  async list(tenantId: string, opts?: { limit?: number }): Promise<AuditLogEntryDTO[]> {
    const limit = Math.min(200, Math.max(1, opts?.limit ?? 50))
    const rows = await AuditLogModel.find({ tenantId: new mongoose.Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec()

    return rows.map((r) => {
      const meta = r.metadata
      return {
        id: r._id.toString(),
        actorId: String(r.actorId),
        action: r.action,
        entity: r.entity,
        entityId: r.entityId ?? null,
        metadata: meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : null,
        createdAt:
          r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date(String(r.createdAt)).toISOString(),
      }
    })
  },
}
