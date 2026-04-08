import mongoose, { Schema, type InferSchemaType } from "mongoose"

const gstSlabSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    cgstRate: { type: Number, required: true, min: 0, max: 100 },
    sgstRate: { type: Number, required: true, min: 0, max: 100 },
    igstRate: { type: Number, required: true, min: 0, max: 100 },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true },
)

gstSlabSchema.index({ tenantId: 1, name: 1 })

export type GstSlabDoc = InferSchemaType<typeof gstSlabSchema> & { _id: mongoose.Types.ObjectId }
export const GstSlabModel = mongoose.model("GstSlab", gstSlabSchema)
