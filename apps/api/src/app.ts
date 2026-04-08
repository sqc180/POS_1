import cors from "@fastify/cors"
import Fastify, { type FastifyInstance } from "fastify"
import type { ApiEnv } from "@repo/config"
import { apiError } from "@repo/utils"
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
  const logger =
    opts.logger === false
      ? false
      : {
          level: env.LOG_LEVEL,
        }

  const app = Fastify({
    logger,
    trustProxy: env.TRUST_PROXY,
    bodyLimit: env.REQUEST_BODY_LIMIT,
  })

  const allowedOrigins = parseWebOrigins(env.WEB_ORIGIN)

  app.setErrorHandler((error, request, reply) => {
    const err = error instanceof Error ? error : new Error(String(error))
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500
    const isProd = env.NODE_ENV === "production" || env.APP_ENV === "production"
    request.log.error(err)
    if (reply.raw.headersSent) {
      return
    }
    const message =
      isProd && statusCode >= 500 ? "Internal server error" : (err.message || "Request failed")
    return reply.status(statusCode).send(apiError("error", message))
  })

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
