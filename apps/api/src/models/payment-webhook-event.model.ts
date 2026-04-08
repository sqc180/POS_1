import mongoose, { Schema, type InferSchemaType } from "mongoose"

const paymentWebhookEventSchema = new Schema(
  {
    dedupeKey: { type: String, required: true, trim: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant" },
    provider: { type: String, enum: ["razorpay"], required: true },
    eventType: { type: String, trim: true, default: "" },
    payloadSnapshot: { type: String, default: "" },
    signatureValid: { type: Boolean, default: false },
    status: { type: String, enum: ["received", "processed", "ignored", "error"], default: "received" },
    failureReason: { type: String, trim: true, default: "" },
    processedAt: { type: Date },
  },
  { timestamps: true },
)

paymentWebhookEventSchema.index({ dedupeKey: 1 }, { unique: true })
paymentWebhookEventSchema.index({ tenantId: 1, createdAt: -1 })

export type PaymentWebhookEventDoc = InferSchemaType<typeof paymentWebhookEventSchema> & {
  _id: mongoose.Types.ObjectId
}
export const PaymentWebhookEventModel = mongoose.model("PaymentWebhookEvent", paymentWebhookEventSchema)
