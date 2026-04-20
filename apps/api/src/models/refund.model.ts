import mongoose, { Schema, type InferSchemaType } from "mongoose"

const refundSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    refundNumber: { type: String, trim: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    reason: { type: String, trim: true, default: "" },
    providerRefundId: { type: String, trim: true, default: "" },
    /** When set, refund is validated against invoice line items and restores stock on complete. */
    returnLines: {
      type: [
        {
          _id: false,
          lineIndex: { type: Number, required: true, min: 0 },
          qty: { type: Number, required: true, min: 0 },
        },
      ],
      default: undefined,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
)

refundSchema.index({ tenantId: 1, status: 1, createdAt: -1 })
refundSchema.index({ tenantId: 1, refundNumber: 1 }, { unique: true, sparse: true })

export type RefundDoc = InferSchemaType<typeof refundSchema> & { _id: mongoose.Types.ObjectId }
export const RefundModel = mongoose.model("Refund", refundSchema)
