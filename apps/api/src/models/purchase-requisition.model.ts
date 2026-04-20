import mongoose, { Schema, type InferSchemaType } from "mongoose"

const lineSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    qty: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true, default: "" },
  },
  { _id: false },
)

const purchaseRequisitionSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    branchId: { type: String, trim: true, default: "main" },
    title: { type: String, trim: true, default: "Purchase requisition" },
    lines: { type: [lineSchema], default: [] },
    status: {
      type: String,
      enum: ["draft", "submitted", "cancelled"],
      default: "draft",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
)

purchaseRequisitionSchema.index({ tenantId: 1, status: 1, createdAt: -1 })

export type PurchaseRequisitionDoc = InferSchemaType<typeof purchaseRequisitionSchema> & {
  _id: mongoose.Types.ObjectId
}
export const PurchaseRequisitionModel = mongoose.model("PurchaseRequisition", purchaseRequisitionSchema)
