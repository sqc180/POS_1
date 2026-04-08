import mongoose, { Schema, type InferSchemaType } from "mongoose"

const categorySchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
)

categorySchema.index({ tenantId: 1, name: 1, parentId: 1 })

export type CategoryDoc = InferSchemaType<typeof categorySchema> & { _id: mongoose.Types.ObjectId }
export const CategoryModel = mongoose.model("Category", categorySchema)
