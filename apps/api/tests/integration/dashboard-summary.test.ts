import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { authBearer, parseJson } from "../helpers/http.js"
import { openTestApp } from "../helpers/context.js"
import { onboardRetailTenant } from "../factories/tenant.js"

describe("dashboard summary", () => {
  let ctx: Awaited<ReturnType<typeof openTestApp>>
  let ownerToken: string

  beforeAll(async () => {
    ctx = await openTestApp()
    const o = await onboardRetailTenant(ctx.app, {
      ownerEmail: "dash-sum@qa.test",
      ownerPassword: "pass123456",
    })
    ownerToken = o.token
  })

  afterAll(async () => {
    await ctx.close()
  })

  it("GET /dashboard/summary returns numeric fields", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/dashboard/summary",
      headers: authBearer(ownerToken),
    })
    expect(res.statusCode).toBe(200)
    const b = parseJson<{
      success: true
      data: {
        productsActive: number
        branchesActive: number
        draftInvoices: number
        completedInvoices: number
        pendingRefunds: number
      }
    }>(res.body)
    expect(b.success).toBe(true)
    expect(typeof b.data.productsActive).toBe("number")
    expect(typeof b.data.branchesActive).toBe("number")
    expect(typeof b.data.draftInvoices).toBe("number")
    expect(b.data.productsActive).toBeGreaterThanOrEqual(0)
    expect(b.data.branchesActive).toBeGreaterThanOrEqual(1)
  })

  it("GET /dashboard/summary forbidden without dashboard permission", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/dashboard/summary",
    })
    expect(res.statusCode).toBe(401)
  })
})
