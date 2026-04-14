import mongoose from "mongoose"
import type { ApiEnv } from "@repo/config"
import { InvoiceModel } from "../models/invoice.model.js"
import { InventoryItemModel } from "../models/inventory-item.model.js"
import "../models/product-variant.model.js"
import "../models/stock-batch.model.js"
import "../models/product-serial.model.js"
import "../models/user-branch-access.model.js"
import "../models/async-job.model.js"
import "../models/inventory-location.model.js"

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export const connectDb = async (env: ApiEnv): Promise<void> => {
  mongoose.set("strictQuery", true)
  let lastError: unknown
  for (let attempt = 1; attempt <= env.MONGODB_CONNECT_RETRIES; attempt++) {
    try {
      await mongoose.connect(env.MONGODB_URI)
      lastError = undefined
      break
    } catch (e) {
      lastError = e
      if (attempt < env.MONGODB_CONNECT_RETRIES) {
        await sleep(env.MONGODB_CONNECT_RETRY_MS)
      }
    }
  }
  if (lastError !== undefined) {
    throw lastError
  }
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB connection not ready after retries")
  }
  if (env.NODE_ENV !== "test") {
    await Promise.all([InvoiceModel.syncIndexes(), InventoryItemModel.syncIndexes()])
  }
}
