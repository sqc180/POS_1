import { MongoMemoryServer } from "mongodb-memory-server"
import mongoose from "mongoose"
import { afterAll, beforeAll } from "vitest"

declare global {
  // eslint-disable-next-line no-var
  var __POS_API_MONGO__: MongoMemoryServer | undefined
}

beforeAll(async () => {
  if (!globalThis.__POS_API_MONGO__) {
    globalThis.__POS_API_MONGO__ = await MongoMemoryServer.create()
  }
  process.env.MONGODB_URI = globalThis.__POS_API_MONGO__.getUri()
}, 180_000)

afterAll(async () => {
  await mongoose.disconnect().catch(() => {})
  if (globalThis.__POS_API_MONGO__) {
    await globalThis.__POS_API_MONGO__.stop()
    globalThis.__POS_API_MONGO__ = undefined
  }
})
