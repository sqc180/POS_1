import mongoose, { Schema, type InferSchemaType } from "mongoose"

const customerSchema = new Schema(
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

customerSchema.index({ tenantId: 1, phone: 1 })

export type CustomerDoc = InferSchemaType<typeof customerSchema> & { _id: mongoose.Types.ObjectId }
export const CustomerModel = mongoose.model("Customer", customerSchema)
