import mongoose, { Schema, type InferSchemaType } from "mongoose"

const supplierSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    gstin: { type: String, trim: true },
    address: { type: String, trim: true },
    notes: { type: String, trim: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true },
)

supplierSchema.index({ tenantId: 1, name: 1 })

export type SupplierDoc = InferSchemaType<typeof supplierSchema> & { _id: mongoose.Types.ObjectId }
export const SupplierModel = mongoose.model("Supplier", supplierSchema)
