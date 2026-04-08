import cors from "@fastify/cors"
import Fastify, { type FastifyInstance } from "fastify"
import type { ApiEnv } from "@repo/config"
import { registerRoutes } from "./routes/register.js"

const parseWebOrigins = (raw: string): string[] =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

export type CreateAppOptions = {
  /** Disable request logging (integration tests). */
  logger?: boolean
}

export const createApp = async (env: ApiEnv, opts: CreateAppOptions = {}): Promise<FastifyInstance> => {
  const app = Fastify({ logger: opts.logger ?? true })
  const allowedOrigins = parseWebOrigins(env.WEB_ORIGIN)
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true)
        return
      }
      if (allowedOrigins.includes(origin)) {
        cb(null, true)
        return
      }
      cb(new Error("CORS: origin not allowed"), false)
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
  await registerRoutes(app, env)
  return app
}
