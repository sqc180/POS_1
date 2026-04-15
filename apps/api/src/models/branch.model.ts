import mongoose, { Schema, type InferSchemaType } from "mongoose"

const branchSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    code: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["shop", "warehouse", "other"], default: "shop" },
    address: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    sortOrder: { type: Number, default: 0 },
    /** Optional pilot vertical for this branch — overrides tenant `pilotVertical` for capability resolution. */
    businessTypeSlug: { type: String, trim: true, default: "" },
    /** Extra capability pack ids (roadmap slugs) whose flags are unioned onto the branch base. */
    enabledPackIds: { type: [String], default: [] },
    /** Counter / POS mode hint for this branch (UI + future server rules). */
    posMode: {
      type: String,
      enum: ["standard", "high_volume", "table_service", "field"],
      default: "standard",
    },
  },
  { timestamps: true },
)

branchSchema.index({ tenantId: 1, code: 1 }, { unique: true })
branchSchema.index({ tenantId: 1, status: 1, sortOrder: 1 })

export type BranchDoc = InferSchemaType<typeof branchSchema> & { _id: mongoose.Types.ObjectId }
export const BranchModel = mongoose.model("Branch", branchSchema)
