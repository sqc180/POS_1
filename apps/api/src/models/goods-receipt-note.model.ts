import mongoose, { Schema, type InferSchemaType } from "mongoose"

const grnLineSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    qty: { type: Number, required: true, min: 0 },
    batchCode: { type: String, trim: true, default: "" },
    expiryDate: { type: Date },
  },
  { _id: false },
)

const goodsReceiptNoteSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    branchId: { type: String, trim: true, default: "main" },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },
    lines: { type: [grnLineSchema], default: [] },
    status: {
      type: String,
      enum: ["draft", "posted", "cancelled"],
      default: "draft",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
)

goodsReceiptNoteSchema.index({ tenantId: 1, status: 1, createdAt: -1 })

export type GoodsReceiptNoteDoc = InferSchemaType<typeof goodsReceiptNoteSchema> & {
  _id: mongoose.Types.ObjectId
}
export const GoodsReceiptNoteModel = mongoose.model("GoodsReceiptNote", goodsReceiptNoteSchema)
