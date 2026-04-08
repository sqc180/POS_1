import mongoose, { Schema, type InferSchemaType } from "mongoose"

const userSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      required: true,
      enum: [
        "owner",
        "admin",
        "manager",
        "cashier",
        "billing_staff",
        "inventory_staff",
        "accountant",
        "viewer",
      ],
    },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
)

userSchema.index({ tenantId: 1, email: 1 }, { unique: true })

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId }
export const UserModel = mongoose.model("User", userSchema)
