import mongoose, { Schema, type InferSchemaType } from "mongoose"

const qrPaymentSessionSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true },
    amount: { type: Number, required: true, min: 0 },
    channel: { type: String, enum: ["qr", "checkout"], default: "qr" },
    /** Publishable Razorpay key_id used for Checkout (safe to return to client). */
    razorpayKeyIdPublic: { type: String, trim: true, default: "" },
    state: {
      type: String,
      enum: ["pending", "generated", "paid", "failed", "expired"],
      default: "pending",
    },
    payload: { type: String, default: "" },
    providerOrderId: { type: String, trim: true, default: "" },
    dataUrl: { type: String, default: "" },
    expiresAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
)

qrPaymentSessionSchema.index({ tenantId: 1, createdAt: -1 })
qrPaymentSessionSchema.index({ tenantId: 1, invoiceId: 1 })
qrPaymentSessionSchema.index({ providerOrderId: 1 }, { sparse: true })

export type QrPaymentSessionDoc = InferSchemaType<typeof qrPaymentSessionSchema> & {
  _id: mongoose.Types.ObjectId
}
export const QrPaymentSessionModel = mongoose.model("QrPaymentSession", qrPaymentSessionSchema)
