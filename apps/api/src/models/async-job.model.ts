import mongoose, { Schema, type InferSchemaType } from "mongoose"

const asyncJobSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    payload: { type: Schema.Types.Mixed, default: {} },
    result: { type: Schema.Types.Mixed },
    errorMessage: { type: String, trim: true },
  },
  { timestamps: true },
)

asyncJobSchema.index({ tenantId: 1, status: 1, createdAt: -1 })

export type AsyncJobDoc = InferSchemaType<typeof asyncJobSchema> & { _id: mongoose.Types.ObjectId }
export const AsyncJobModel = mongoose.model("AsyncJob", asyncJobSchema)
