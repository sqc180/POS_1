import mongoose, { Schema, type InferSchemaType } from "mongoose"

const productSerialSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant", default: null },
    serialNumber: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["available", "sold", "returned", "defective"],
      default: "available",
    },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },
    invoiceLineIndex: { type: Number },
  },
  { timestamps: true },
)

productSerialSchema.index({ tenantId: 1, serialNumber: 1 }, { unique: true })
productSerialSchema.index({ tenantId: 1, productId: 1, status: 1 })

export type ProductSerialDoc = InferSchemaType<typeof productSerialSchema> & { _id: mongoose.Types.ObjectId }
export const ProductSerialModel = mongoose.model("ProductSerial", productSerialSchema)
