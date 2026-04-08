import type { ApiErrorShape } from "@repo/utils"
import { apiError } from "@repo/utils"
import type { FastifyReply } from "fastify"

export const sendError = (reply: FastifyReply, status: number, code: string, message: string): FastifyReply => {
  const body: ApiErrorShape = apiError(code, message)
  return reply.status(status).send(body)
}
