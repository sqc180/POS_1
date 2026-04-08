import mongoose, { Schema, type InferSchemaType } from "mongoose"

const businessSettingsSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, unique: true },
    defaultBranchId: { type: String, default: "main" },
    allowNegativeStock: { type: Boolean, default: false },
    invoiceNumberPrefix: { type: String, default: "INV" },
    receiptNumberPrefix: { type: String, default: "RCP" },
    refundNumberPrefix: { type: String, default: "REF" },
    invoiceSeq: { type: Number, default: 0 },
    receiptSeq: { type: Number, default: 0 },
    refundSeq: { type: Number, default: 0 },
    defaultTaxMode: { type: String, enum: ["inclusive", "exclusive"], default: "exclusive" },
    posDefaultPaymentMode: { type: String, default: "cash" },
    intraStateDefault: { type: Boolean, default: true },
    placeOfSupplyState: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
)

export type BusinessSettingsDoc = InferSchemaType<typeof businessSettingsSchema> & {
  _id: mongoose.Types.ObjectId
}
export const BusinessSettingsModel = mongoose.model("BusinessSettings", businessSettingsSchema)
