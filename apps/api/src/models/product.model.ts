import mongoose, { Schema, type InferSchemaType } from "mongoose"

const productSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    barcode: { type: String, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category" },
    gstSlabId: { type: Schema.Types.ObjectId, ref: "GstSlab" },
    taxMode: { type: String, enum: ["inclusive", "exclusive"], default: "exclusive" },
    sellingPrice: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, min: 0, default: 0 },
    mrp: { type: Number, min: 0 },
    trackStock: { type: Boolean, default: true },
    brand: { type: String, trim: true },
    unit: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true },
)

productSchema.index({ tenantId: 1, sku: 1 }, { unique: true })
productSchema.index({ tenantId: 1, barcode: 1 }, { sparse: true })

export type ProductDoc = InferSchemaType<typeof productSchema> & { _id: mongoose.Types.ObjectId }
export const ProductModel = mongoose.model("Product", productSchema)
