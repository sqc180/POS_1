import type { PermissionId } from "@repo/permissions"
import { hasPermission } from "@repo/permissions"
import type { FastifyReply, FastifyRequest } from "fastify"
import { sendError } from "../lib/reply.js"

export const requirePermission =
  (...perms: PermissionId[]) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const auth = request.auth
    if (!auth) {
      return sendError(reply, 401, "unauthorized", "Not authenticated")
    }
    const ok = perms.some((p) => hasPermission(auth.role, p))
    if (!ok) {
      return sendError(reply, 403, "forbidden", "Insufficient permissions")
    }
  }
