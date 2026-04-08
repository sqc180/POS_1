import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { authBearer, injectJson, parseJson } from "../helpers/http.js"
import { openTestApp } from "../helpers/context.js"
import { onboardRetailTenant } from "../factories/tenant.js"

describe("webhooks + validation edges", () => {
  let ctx: Awaited<ReturnType<typeof openTestApp>>

  beforeAll(async () => {
    ctx = await openTestApp()
  })

  afterAll(async () => {
    await ctx.close()
  })

  it("POST /webhooks/razorpay returns 503 when webhook secret not configured", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/webhooks/razorpay",
      headers: { "content-type": "application/json" },
      payload: "{}",
    })
    expect(res.statusCode).toBe(503)
    expect(parseJson(res.body)).toMatchObject({ success: false })
  })

  it("POST /webhooks/razorpay returns 400 on invalid signature when secret is set", async () => {
    const env = ctx.env
    if (!env.RAZORPAY_WEBHOOK_SECRET) {
      env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_webhook_secret_value_here"
    }
    const res = await ctx.app.inject({
      method: "POST",
      url: "/webhooks/razorpay",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "invalid",
      },
      payload: '{"event":"payment.captured"}',
    })
    expect(res.statusCode).toBe(400)
  })

  it("GET /documents/ensure rejects without permission query", async () => {
    const o = await onboardRetailTenant(ctx.app, {
      ownerEmail: "doc@qa.test",
      ownerPassword: "pass123456",
    })
    const res = await ctx.app.inject({
      method: "GET",
      url: "/documents/ensure",
      headers: authBearer(o.token),
    })
    expect(res.statusCode).toBe(400)
  })

  it("POST /auth/login rejects empty password", async () => {
    const res = await injectJson(ctx.app, "POST", "/auth/login", {
      payload: { email: "x@y.com", password: "" },
    })
    expect(res.statusCode).toBe(400)
  })
})
