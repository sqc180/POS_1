import mongoose, { Schema, type InferSchemaType } from "mongoose"

const invoiceItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant" },
    variantLabel: { type: String, default: "" },
    variantSku: { type: String, default: "" },
    batchId: { type: Schema.Types.ObjectId, ref: "StockBatch" },
    batchCode: { type: String, default: "" },
    expiryDate: { type: Date },
    serialNumbers: { type: [String], default: [] },
    batchAllocations: {
      type: [
        {
          _id: false,
          batchId: { type: Schema.Types.ObjectId, ref: "StockBatch", required: true },
          qty: { type: Number, required: true },
        },
      ],
      default: [],
    },
    name: { type: String, required: true },
    sku: { type: String, default: "" },
    qty: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    taxMode: { type: String, enum: ["inclusive", "exclusive"], required: true },
    gstSlabId: { type: Schema.Types.ObjectId, ref: "GstSlab" },
    cgstRate: { type: Number, default: 0 },
    sgstRate: { type: Number, default: 0 },
    igstRate: { type: Number, default: 0 },
    taxableValue: { type: Number, default: 0 },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    lineTotal: { type: Number, default: 0 },
  },
  { _id: false },
)

const invoiceSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    invoiceNumber: { type: String, trim: true },
    status: {
      type: String,
      enum: ["draft", "completed", "cancelled"],
      default: "draft",
    },
    documentType: {
      type: String,
      enum: ["tax_invoice", "quotation", "proforma", "sales_order", "delivery_challan"],
      default: "tax_invoice",
    },
    approvalState: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
    },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    cashierId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [invoiceItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    notes: { type: String, trim: true, default: "" },
    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true },
    receiptIssued: { type: Boolean, default: false },
  },
  { timestamps: true },
)

invoiceSchema.index({ tenantId: 1, status: 1, createdAt: -1 })
// Unique only when a real number exists; sparse still indexes null — use partial so many drafts are allowed
invoiceSchema.index(
  { tenantId: 1, invoiceNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { invoiceNumber: { $gt: "" } },
  },
)

export type InvoiceDoc = InferSchemaType<typeof invoiceSchema> & { _id: mongoose.Types.ObjectId }
export const InvoiceModel = mongoose.model("Invoice", invoiceSchema)
