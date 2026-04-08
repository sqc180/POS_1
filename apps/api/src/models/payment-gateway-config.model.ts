import mongoose, { Schema, type InferSchemaType } from "mongoose"

const paymentGatewayConfigSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true },
    provider: { type: String, enum: ["noop", "razorpay"], default: "noop" },
    razorpayKeyId: { type: String, trim: true, default: "" },
    upiVpa: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
)

export type PaymentGatewayConfigDoc = InferSchemaType<typeof paymentGatewayConfigSchema> & {
  _id: mongoose.Types.ObjectId
}
export const PaymentGatewayConfigModel = mongoose.model("PaymentGatewayConfig", paymentGatewayConfigSchema)
