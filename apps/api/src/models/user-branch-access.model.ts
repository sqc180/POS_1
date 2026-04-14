import mongoose, { Schema, type InferSchemaType } from "mongoose"

/** When absent for a user, they are not branch-restricted (all branches). When present, only listed branch codes apply. */
const userBranchAccessSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    branchCodes: { type: [String], default: [] },
  },
  { timestamps: true },
)

userBranchAccessSchema.index({ tenantId: 1, userId: 1 }, { unique: true })

export type UserBranchAccessDoc = InferSchemaType<typeof userBranchAccessSchema> & { _id: mongoose.Types.ObjectId }
export const UserBranchAccessModel = mongoose.model("UserBranchAccess", userBranchAccessSchema)
