import mongoose, { Schema, type InferSchemaType } from "mongoose"

const inventoryLocationSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    branchId: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    kind: {
      type: String,
      enum: ["warehouse", "zone", "rack", "bin", "pos_counter", "other"],
      default: "other",
    },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true },
)

inventoryLocationSchema.index({ tenantId: 1, branchId: 1, code: 1 }, { unique: true })

export type InventoryLocationDoc = InferSchemaType<typeof inventoryLocationSchema> & { _id: mongoose.Types.ObjectId }
export const InventoryLocationModel = mongoose.model("InventoryLocation", inventoryLocationSchema)
