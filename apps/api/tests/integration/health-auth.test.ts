import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { signAccessToken } from "../../src/lib/jwt.js"
import { authBearer, injectJson, parseJson } from "../helpers/http.js"
import { openTestApp } from "../helpers/context.js"
import { loginAs, onboardRetailTenant } from "../factories/tenant.js"

describe("health + auth", () => {
  let ctx: Awaited<ReturnType<typeof openTestApp>>

  beforeAll(async () => {
    ctx = await openTestApp()
  })

  afterAll(async () => {
    await ctx.close()
  })

  it("GET /health returns ok", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/health" })
    expect(res.statusCode).toBe(200)
    expect(parseJson(res.body)).toEqual({ ok: true, liveness: "up" })
  })

  it("GET /ready returns ok when db and storage are reachable", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/ready" })
    expect(res.statusCode).toBe(200)
    const body = parseJson(res.body) as { ok: boolean; checks?: Record<string, string> }
    expect(body.ok).toBe(true)
    expect(body.checks?.mongodb).toBe("ok")
    expect(body.checks?.storage).toBe("writable")
  })

  it("POST /auth/onboarding creates tenant and returns token", async () => {
    const data = await onboardRetailTenant(ctx.app, {
      ownerEmail: "owner1@qa.test",
      ownerPassword: "password123",
    })
    expect(data.tenantId).toMatch(/^[a-f0-9]{24}$/)
    expect(data.userId).toMatch(/^[a-f0-9]{24}$/)
  })

  it("POST /auth/onboarding rejects invalid email", async () => {
    const res = await injectJson(ctx.app, "POST", "/auth/onboarding", {
      payload: {
        businessName: "X",
        businessType: "retail",
        ownerEmail: "not-an-email",
        ownerPassword: "password123",
        ownerName: "N",
      },
    })
    expect(res.statusCode).toBe(400)
    const b = parseJson(res.body)
    expect(b).toMatchObject({ success: false })
  })

  it("POST /auth/login succeeds with correct password", async () => {
    await onboardRetailTenant(ctx.app, {
      ownerEmail: "loginok@qa.test",
      ownerPassword: "secretpass99",
    })
    const { statusCode, token } = await loginAs(ctx.app, "loginok@qa.test", "secretpass99")
    expect(statusCode).toBe(200)
    expect(token).toBeTruthy()
  })

  it("POST /auth/login rejects wrong password", async () => {
    await onboardRetailTenant(ctx.app, {
      ownerEmail: "badpwd@qa.test",
      ownerPassword: "rightpassword1",
    })
    const res = await injectJson(ctx.app, "POST", "/auth/login", {
      payload: { email: "badpwd@qa.test", password: "wrong" },
    })
    expect(res.statusCode).toBe(401)
    expect(parseJson(res.body)).toMatchObject({
      success: false,
      error: { code: "invalid_credentials" },
    })
  })

  it("POST /auth/login accepts tenantId hint (payload shape)", async () => {
    const o = await onboardRetailTenant(ctx.app, {
      ownerEmail: "tid@qa.test",
      ownerPassword: "pw12345678",
    })
    const { statusCode, token } = await loginAs(ctx.app, "tid@qa.test", "pw12345678", o.tenantId)
    expect(statusCode).toBe(200)
    expect(token).toBeTruthy()
  })

  it("GET /me requires Authorization", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/me" })
    expect(res.statusCode).toBe(401)
  })

  it("GET /me rejects invalid JWT", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/me",
      headers: authBearer("not.a.valid.jwt"),
    })
    expect(res.statusCode).toBe(401)
  })

  it("GET /me returns user+tenant for valid token", async () => {
    const o = await onboardRetailTenant(ctx.app, {
      ownerEmail: "me@qa.test",
      ownerPassword: "password123",
    })
    const res = await ctx.app.inject({
      method: "GET",
      url: "/me",
      headers: authBearer(o.token),
    })
    expect(res.statusCode).toBe(200)
    const b = parseJson<{ success: true; data: { user: { email: string }; tenant: { id: string } } }>(res.body)
    expect(b.success).toBe(true)
    expect(b.data.user.email).toBe("me@qa.test")
    expect(b.data.tenant.id).toBe(o.tenantId)
  })

  it("GET /me returns 404 for forged token user id", async () => {
    const o = await onboardRetailTenant(ctx.app, {
      ownerEmail: "forge@qa.test",
      ownerPassword: "password123",
    })
    const bad = signAccessToken(ctx.env, {
      sub: "507f1f77bcf86cd799439011",
      tid: o.tenantId,
      role: "owner",
    })
    const res = await ctx.app.inject({
      method: "GET",
      url: "/me",
      headers: authBearer(bad),
    })
    expect(res.statusCode).toBe(404)
  })
})
