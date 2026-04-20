import mongoose, { Schema, type InferSchemaType } from "mongoose"

const transferLineSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant" },
    qty: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

const stockTransferRequestSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    fromBranchId: { type: String, trim: true, required: true },
    toBranchId: { type: String, trim: true, required: true },
    lines: { type: [transferLineSchema], default: [] },
    status: {
      type: String,
      enum: ["pending", "approved", "shipped", "cancelled"],
      default: "pending",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
)

stockTransferRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 })

export type StockTransferRequestDoc = InferSchemaType<typeof stockTransferRequestSchema> & {
  _id: mongoose.Types.ObjectId
}
export const StockTransferRequestModel = mongoose.model("StockTransferRequest", stockTransferRequestSchema)
