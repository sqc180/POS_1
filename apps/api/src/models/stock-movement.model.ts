import mongoose, { Schema, type InferSchemaType } from "mongoose"

const stockMovementSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    inventoryItemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    type: {
      type: String,
      required: true,
      enum: ["in", "out", "adjustment", "correction", "transfer"],
    },
    quantity: { type: Number, required: true },
    reason: { type: String, trim: true },
    referenceType: { type: String, trim: true },
    referenceId: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

stockMovementSchema.index({ tenantId: 1, createdAt: -1 })
stockMovementSchema.index({ inventoryItemId: 1, createdAt: -1 })

export type StockMovementDoc = InferSchemaType<typeof stockMovementSchema> & { _id: mongoose.Types.ObjectId }
export const StockMovementModel = mongoose.model("StockMovement", stockMovementSchema)
