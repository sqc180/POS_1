import { rmSync } from "node:fs"
import type { FastifyInstance } from "fastify"
import mongoose from "mongoose"
import type { ApiEnv } from "@repo/config"
import { createApp } from "../../src/app.js"
import { connectDb } from "../../src/db/connect.js"
import { makeTestEnv } from "./env.js"

export type TestAppContext = {
  env: ApiEnv
  app: FastifyInstance
  storageRoot: string
}

/**
 * New in-memory DB + temp storage + Fastify app. Call `close()` after tests to drop DB and disconnect.
 */
export const openTestApp = async (): Promise<TestAppContext & { close: () => Promise<void> }> => {
  const env = makeTestEnv()
  await connectDb(env)
  const app = await createApp(env, { logger: false })
  const storageRoot = env.STORAGE_ROOT ?? ""

  const close = async () => {
    await app.close()
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
    try {
      if (storageRoot) rmSync(storageRoot, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }

  return { env, app, storageRoot, close }
}
