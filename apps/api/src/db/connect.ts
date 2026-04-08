import mongoose from "mongoose"
import type { ApiEnv } from "@repo/config"
import { InvoiceModel } from "../models/invoice.model.js"

export const connectDb = async (env: ApiEnv): Promise<void> => {
  mongoose.set("strictQuery", true)
  await mongoose.connect(env.MONGODB_URI)
  if (env.NODE_ENV !== "test") {
    await InvoiceModel.syncIndexes()
  }
}
