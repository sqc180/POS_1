import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { authBearer, injectJson, parseJson } from "../helpers/http.js"
import { openTestApp } from "../helpers/context.js"
import { onboardRetailTenant } from "../factories/tenant.js"

describe("users + RBAC", () => {
  let ctx: Awaited<ReturnType<typeof openTestApp>>
  let ownerToken: string

  beforeAll(async () => {
    ctx = await openTestApp()
    const o = await onboardRetailTenant(ctx.app, {
      ownerEmail: "rbac-owner@qa.test",
      ownerPassword: "ownerpass123",
    })
    ownerToken = o.token
  })

  afterAll(async () => {
    await ctx.close()
  })

  it("owner can POST /users (staff) and rejects duplicate email in same tenant", async () => {
    const res = await injectJson(ctx.app, "POST", "/users", {
      headers: authBearer(ownerToken),
      payload: {
        email: "cashier1@qa.test",
        password: "staffpass123",
        name: "Cashier One",
        role: "cashier",
      },
    })
    expect(res.statusCode).toBe(201)
    const b = parseJson<{ success: true; data: { id: string; role: string } }>(res.body)
    expect(b.success).toBe(true)
    expect(b.data.role).toBe("cashier")

    const dup = await injectJson(ctx.app, "POST", "/users", {
      headers: authBearer(ownerToken),
      payload: {
        email: "cashier1@qa.test",
        password: "otherpass123",
        name: "Dup",
        role: "viewer",
      },
    })
    expect(dup.statusCode).toBe(409)
    expect(parseJson(dup.body)).toMatchObject({ success: false })
  })

  it("cashier cannot POST /users", async () => {
    const login = await injectJson(ctx.app, "POST", "/auth/login", {
      payload: { email: "cashier1@qa.test", password: "staffpass123" },
    })
    const tok = parseJson<{ success: true; data: { token: string } }>(login.body).data.token
    const res = await injectJson(ctx.app, "POST", "/users", {
      headers: authBearer(tok),
      payload: {
        email: "nope@qa.test",
        password: "staffpass123",
        name: "N",
        role: "viewer",
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it("viewer cannot POST /users (route permission)", async () => {
    await injectJson(ctx.app, "POST", "/users", {
      headers: authBearer(ownerToken),
      payload: {
        email: "viewer1@qa.test",
        password: "viewerpass12",
        name: "V",
        role: "viewer",
      },
    })
    const login = await injectJson(ctx.app, "POST", "/auth/login", {
      payload: { email: "viewer1@qa.test", password: "viewerpass12" },
    })
    const tok = parseJson<{ success: true; data: { token: string } }>(login.body).data.token
    const res = await injectJson(ctx.app, "POST", "/users", {
      headers: authBearer(tok),
      payload: {
        email: "nope2@qa.test",
        password: "viewerpass12",
        name: "N2",
        role: "cashier",
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it("manager cannot create users (service enforces owner/admin only)", async () => {
    await injectJson(ctx.app, "POST", "/users", {
      headers: authBearer(ownerToken),
      payload: {
        email: "mgr@qa.test",
        password: "mgrpass12345",
        name: "Manager",
        role: "manager",
      },
    })
    const login = await injectJson(ctx.app, "POST", "/auth/login", {
      payload: { email: "mgr@qa.test", password: "mgrpass12345" },
    })
    const tok = parseJson<{ success: true; data: { token: string } }>(login.body).data.token
    const res = await injectJson(ctx.app, "POST", "/users", {
      headers: authBearer(tok),
      payload: {
        email: "under@qa.test",
        password: "underpass123",
        name: "U",
        role: "cashier",
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it("PATCH /users/:id rejects invalid payload", async () => {
    const list = await ctx.app.inject({
      method: "GET",
      url: "/users",
      headers: authBearer(ownerToken),
    })
    const u = parseJson<{ success: true; data: { id: string }[] }>(list.body).data[0]
    const res = await injectJson(ctx.app, "PATCH", `/users/${u.id}`, {
      headers: authBearer(ownerToken),
      payload: { status: "not-a-status" },
    })
    expect(res.statusCode).toBe(400)
  })
})
