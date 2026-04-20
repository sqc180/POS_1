import mongoose, { Schema, type InferSchemaType } from "mongoose"

const unavailableMedicineRequestSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    branchId: { type: String, trim: true, default: "main" },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    /** Free-text name when product is unknown or not in catalog */
    requestedName: { type: String, trim: true },
    note: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["open", "fulfilled", "cancelled"],
      default: "open",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
)

unavailableMedicineRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 })

export type UnavailableMedicineRequestDoc = InferSchemaType<typeof unavailableMedicineRequestSchema> & {
  _id: mongoose.Types.ObjectId
}
export const UnavailableMedicineRequestModel = mongoose.model("UnavailableMedicineRequest", unavailableMedicineRequestSchema)
