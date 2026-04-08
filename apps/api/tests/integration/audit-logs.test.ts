import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { authBearer, injectJson, parseJson } from "../helpers/http.js"
import { openTestApp } from "../helpers/context.js"
import { onboardRetailTenant } from "../factories/tenant.js"

describe("audit logs API", () => {
  let ctx: Awaited<ReturnType<typeof openTestApp>>
  let ownerToken: string

  beforeAll(async () => {
    ctx = await openTestApp()
    const o = await onboardRetailTenant(ctx.app, {
      ownerEmail: "audit-owner@qa.test",
      ownerPassword: "pass123456",
    })
    ownerToken = o.token
  })

  afterAll(async () => {
    await ctx.close()
  })

  it("GET /audit-logs returns list for owner", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/audit-logs?limit=20",
      headers: authBearer(ownerToken),
    })
    expect(res.statusCode).toBe(200)
    const b = parseJson<{ success: true; data: { action: string }[] }>(res.body)
    expect(b.success).toBe(true)
    expect(Array.isArray(b.data)).toBe(true)
    expect(b.data.some((e) => e.action === "tenant.onboarding")).toBe(true)
  })

  it("GET /audit-logs forbidden for cashier", async () => {
    await injectJson(ctx.app, "POST", "/users", {
      headers: authBearer(ownerToken),
      payload: {
        email: "audit-cashier@qa.test",
        password: "pass123456",
        name: "C",
        role: "cashier",
      },
    })
    const login = await injectJson(ctx.app, "POST", "/auth/login", {
      payload: { email: "audit-cashier@qa.test", password: "pass123456" },
    })
    const tok = parseJson<{ success: true; data: { token: string } }>(login.body).data.token
    const res = await ctx.app.inject({
      method: "GET",
      url: "/audit-logs",
      headers: authBearer(tok),
    })
    expect(res.statusCode).toBe(403)
  })
})
