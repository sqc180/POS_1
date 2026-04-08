import mongoose from "mongoose"
import { createApp } from "./app.js"
import { env } from "./config/env.js"
import { connectDb } from "./db/connect.js"
import { logSafePublicConfig } from "./lib/startup-log.js"

const SHUTDOWN_MS = 15_000

const start = async () => {
  logSafePublicConfig(env)
  await connectDb(env)
  const app = await createApp(env, { logger: true })
  await app.listen({ port: env.PORT, host: env.HOST })

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutdown_started")
    const killTimer = setTimeout(() => {
      app.log.error("shutdown_timeout, exiting")
      process.exit(1)
    }, SHUTDOWN_MS)
    killTimer.unref?.()

    try {
      await app.close()
    } catch (e) {
      app.log.error(e)
    }
    try {
      await mongoose.disconnect()
    } catch {
      /* ignore */
    }
    clearTimeout(killTimer)
    process.exit(0)
  }

  process.once("SIGINT", () => {
    void shutdown("SIGINT")
  })
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM")
  })
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
