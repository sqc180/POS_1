import type { FastifyReply, FastifyRequest } from "fastify"
import type { ApiEnv } from "@repo/config"
import { verifyAccessToken } from "../lib/jwt.js"
import { sendError } from "../lib/reply.js"

export const createRequireAuth = (env: ApiEnv) => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const header = request.headers.authorization
    if (!header?.startsWith("Bearer ")) {
      return sendError(reply, 401, "unauthorized", "Missing bearer token")
    }
    const token = header.slice("Bearer ".length).trim()
    try {
      const payload = verifyAccessToken(env, token)
      request.auth = {
        userId: payload.sub,
        tenantId: payload.tid,
        role: payload.role,
      }
    } catch {
      return sendError(reply, 401, "unauthorized", "Invalid or expired token")
    }
  }
}
