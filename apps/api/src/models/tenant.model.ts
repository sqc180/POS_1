import mongoose, { Schema, type InferSchemaType } from "mongoose"

const tenantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    businessType: { type: String, required: true, enum: ["retail", "supermart"] },
    /** Optional roadmap vertical for capability flags; not a replacement for businessType. */
    pilotVertical: { type: String, trim: true, default: null },
    status: { type: String, required: true, enum: ["active", "suspended"], default: "active" },
  },
  { timestamps: true },
)

tenantSchema.index({ name: 1 })

export type TenantDoc = InferSchemaType<typeof tenantSchema> & { _id: mongoose.Types.ObjectId }
export const TenantModel = mongoose.model("Tenant", tenantSchema)
