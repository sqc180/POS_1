import type { FastifyInstance } from "fastify"
import { expect } from "vitest"
import { injectJson, parseJson } from "../helpers/http.js"

export type OnboardResult = {
  token: string
  tenantId: string
  userId: string
}

export const onboardRetailTenant = async (
  app: FastifyInstance,
  opts: { ownerEmail: string; ownerPassword: string; businessName?: string },
): Promise<OnboardResult> => {
  const res = await injectJson(app, "POST", "/auth/onboarding", {
    payload: {
      businessName: opts.businessName ?? "QA Test Retail",
      businessType: "retail",
      ownerEmail: opts.ownerEmail,
      ownerPassword: opts.ownerPassword,
      ownerName: "QA Owner",
    },
  })
  expect(res.statusCode).toBe(200)
  const body = parseJson<{ success: true; data: OnboardResult }>(res.body)
  expect(body.success).toBe(true)
  expect(body.data.token).toBeTruthy()
  return body.data
}

export const loginAs = async (
  app: FastifyInstance,
  email: string,
  password: string,
  tenantId?: string,
): Promise<{ statusCode: number; token?: string }> => {
  const res = await injectJson(app, "POST", "/auth/login", {
    payload: tenantId ? { email, password, tenantId } : { email, password },
  })
  const body = parseJson<{ success: true; data: { token: string } } | { success: false }>(res.body)
  if (body.success) return { statusCode: res.statusCode, token: body.data.token }
  return { statusCode: res.statusCode }
}
