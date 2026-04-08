import type { FastifyInstance } from "fastify"
import { expect } from "vitest"

export const authBearer = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
})

export const jsonHeaders = {
  "content-type": "application/json",
} as const

export const parseJson = <T>(raw: string): T => JSON.parse(raw) as T

export const injectJson = async (
  app: FastifyInstance,
  method: "GET" | "POST" | "PATCH",
  url: string,
  options: {
    payload?: unknown
    headers?: Record<string, string>
  } = {},
) => {
  const res = await app.inject({
    method,
    url,
    headers: { ...jsonHeaders, ...options.headers },
    payload: options.payload !== undefined ? JSON.stringify(options.payload) : undefined,
  })
  return res
}

export const expectApiError = (body: unknown, code: string): void => {
  expect(body).toMatchObject({ success: false, error: { code } })
}

export const expectApiSuccess = <T>(body: unknown): asserts body is { success: true; data: T } => {
  expect(body).toMatchObject({ success: true })
}
