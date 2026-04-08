import mongoose, { Schema, type InferSchemaType } from "mongoose"

const documentTypeEnum = [
  "invoice_pdf",
  "receipt_pdf",
  "refund_note_pdf",
  "business_logo",
  "product_image",
  "generic_document",
] as const

const moduleEnum = ["documents", "branding", "products", "temp"] as const

const statusEnum = ["active", "deleted", "archived"] as const

const fileAssetSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    module: { type: String, required: true, enum: moduleEnum },
    documentType: { type: String, required: true, enum: documentTypeEnum },
    relatedEntityType: { type: String, required: true, trim: true },
    relatedEntityId: { type: Schema.Types.ObjectId, required: true },
    originalFileName: { type: String, required: true, trim: true },
    storedFileName: { type: String, required: true, trim: true },
    relativePath: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    extension: { type: String, required: true, trim: true },
    fileSize: { type: Number, required: true, min: 0 },
    checksumSha256: { type: String, default: "", trim: true },
    storageProvider: { type: String, required: true, trim: true, default: "local" },
    status: { type: String, required: true, enum: statusEnum, default: "active" },
    version: { type: Number, required: true, default: 1, min: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
)

fileAssetSchema.index(
  { tenantId: 1, relatedEntityType: 1, relatedEntityId: 1, documentType: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
)

export type FileAssetDoc = InferSchemaType<typeof fileAssetSchema> & { _id: mongoose.Types.ObjectId }

export const FileAssetModel = mongoose.model("FileAsset", fileAssetSchema)
