import mongoose, { Schema, type InferSchemaType } from "mongoose"

const receiptSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    receiptNumber: { type: String, required: true, trim: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true },
    paymentIds: [{ type: Schema.Types.ObjectId, ref: "Payment" }],
    grandTotal: { type: Number, required: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
)

receiptSchema.index({ tenantId: 1, receiptNumber: 1 }, { unique: true })
receiptSchema.index({ tenantId: 1, invoiceId: 1 }, { unique: true })

export type ReceiptDoc = InferSchemaType<typeof receiptSchema> & { _id: mongoose.Types.ObjectId }
export const ReceiptModel = mongoose.model("Receipt", receiptSchema)
