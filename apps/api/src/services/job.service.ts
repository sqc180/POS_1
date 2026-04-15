import mongoose from "mongoose"
import { AsyncJobModel, type AsyncJobDoc } from "../models/async-job.model.js"
import { auditService } from "./audit.service.js"
import { gstSummaryService } from "./gst-summary.service.js"

const toPublic = (j: AsyncJobDoc) => ({
  id: j._id.toString(),
  tenantId: j.tenantId.toString(),
  createdBy: j.createdBy.toString(),
  type: j.type,
  status: j.status,
  payload: j.payload ?? {},
  result: j.result ?? null,
  errorMessage: j.errorMessage ?? "",
  createdAt: j.createdAt?.toISOString?.() ?? "",
  updatedAt: j.updatedAt?.toISOString?.() ?? "",
})

export const jobService = {
  toPublic,

  async getById(tenantId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null
    const j = await AsyncJobModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    return j ? toPublic(j) : null
  },

  /**
   * Enqueues a job; for supported light-weight types runs synchronously and marks completed (queue worker is a future phase).
   */
  async enqueue(
    tenantId: string,
    actorId: string,
    input: { type: string; payload?: Record<string, unknown> },
  ): Promise<ReturnType<typeof toPublic>> {
    const doc = await AsyncJobModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      createdBy: new mongoose.Types.ObjectId(actorId),
      type: input.type,
      status: "pending",
      payload: input.payload ?? {},
    })
    if (input.type === "gst_summary_export") {
      doc.status = "processing"
      await doc.save()
      try {
        const from = typeof input.payload?.from === "string" ? input.payload.from : undefined
        const to = typeof input.payload?.to === "string" ? input.payload.to : undefined
        const summary = await gstSummaryService.summarizeCompleted(tenantId, { from, to })
        doc.status = "completed"
        doc.result = { summary }
        await doc.save()
      } catch (e: unknown) {
        doc.status = "failed"
        doc.errorMessage = e instanceof Error ? e.message : "Job failed"
        await doc.save()
      }
    }
    await auditService.log({
      tenantId,
      actorId,
      action: "job.enqueue",
      entity: "AsyncJob",
      entityId: doc._id.toString(),
      metadata: { type: input.type, status: doc.status },
    })
    return toPublic(doc)
  },
}
