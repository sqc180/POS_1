import mongoose, { Schema, type InferSchemaType } from "mongoose"

const stockBatchSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant", default: null },
    branchId: { type: String, required: true, default: "main" },
    batchCode: { type: String, required: true, trim: true },
    mfgDate: { type: Date },
    expiryDate: { type: Date },
    qtyOnHand: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ["active", "depleted", "void"], default: "active" },
  },
  { timestamps: true },
)

stockBatchSchema.index({ tenantId: 1, productId: 1, branchId: 1, batchCode: 1 }, { unique: true })
stockBatchSchema.index({ tenantId: 1, expiryDate: 1, status: 1 })

export type StockBatchDoc = InferSchemaType<typeof stockBatchSchema> & { _id: mongoose.Types.ObjectId }
export const StockBatchModel = mongoose.model("StockBatch", stockBatchSchema)
