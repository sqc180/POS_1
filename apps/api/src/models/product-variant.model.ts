import mongoose, { Schema, type InferSchemaType } from "mongoose"

const productVariantSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    label: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    barcode: { type: String, trim: true },
    sellingPrice: { type: Number, min: 0 },
    gstSlabId: { type: Schema.Types.ObjectId, ref: "GstSlab" },
    taxMode: { type: String, enum: ["inclusive", "exclusive"] },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true },
)

productVariantSchema.index({ tenantId: 1, productId: 1, sku: 1 }, { unique: true })
productVariantSchema.index({ tenantId: 1, productId: 1, status: 1 })

export type ProductVariantDoc = InferSchemaType<typeof productVariantSchema> & { _id: mongoose.Types.ObjectId }
export const ProductVariantModel = mongoose.model("ProductVariant", productVariantSchema)
