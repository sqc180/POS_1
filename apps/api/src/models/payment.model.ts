import mongoose, { Schema, type InferSchemaType } from "mongoose"

const paymentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true },
    amount: { type: Number, required: true, min: 0 },
    method: {
      type: String,
      enum: ["cash", "card_offline", "qr", "razorpay"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    providerRef: { type: String, trim: true, default: "" },
    idempotencyKey: { type: String, trim: true, default: "" },
    meta: { type: Schema.Types.Mixed },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
)

paymentSchema.index({ tenantId: 1, invoiceId: 1, createdAt: -1 })
paymentSchema.index({ tenantId: 1, idempotencyKey: 1 }, { sparse: true })

export type PaymentDoc = InferSchemaType<typeof paymentSchema> & { _id: mongoose.Types.ObjectId }
export const PaymentModel = mongoose.model("Payment", paymentSchema)
