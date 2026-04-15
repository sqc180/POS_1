import mongoose, { Schema, type InferSchemaType } from "mongoose"

const inventoryItemSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant", default: null },
    branchId: { type: String, default: "main" },
    openingStock: { type: Number, default: 0, min: 0 },
    currentStock: { type: Number, default: 0 },
    reservedStock: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
)

/** One stock row per tenant+product+branch+variant (null variantId = base product). */
inventoryItemSchema.index({ tenantId: 1, productId: 1, branchId: 1, variantId: 1 }, { unique: true })

export type InventoryItemDoc = InferSchemaType<typeof inventoryItemSchema> & { _id: mongoose.Types.ObjectId }
export const InventoryItemModel = mongoose.model("InventoryItem", inventoryItemSchema)
