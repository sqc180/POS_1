import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { authBearer, injectJson, parseJson } from "../helpers/http.js"
import { openTestApp } from "../helpers/context.js"
import { onboardRetailTenant } from "../factories/tenant.js"

describe("pharmacy PMS slice: generic product search, unavailable request, in-stock ids", () => {
  let ctx: Awaited<ReturnType<typeof openTestApp>>
  let token: string

  beforeAll(async () => {
    ctx = await openTestApp()
    const o = await onboardRetailTenant(ctx.app, {
      ownerEmail: "pharm-pms@qa.test",
      ownerPassword: "pass123456",
    })
    token = o.token
  })

  afterAll(async () => {
    await ctx.close()
  })

  it("PATCH product accepts genericName and GET /products?q finds it", async () => {
    const slabs = await ctx.app.inject({
      method: "GET",
      url: "/gst-slabs",
      headers: authBearer(token),
    })
    const slabId = parseJson<{ success: true; data: { id: string }[] }>(slabs.body).data[0]!.id

    const prod = await injectJson(ctx.app, "POST", "/products", {
      headers: authBearer(token),
      payload: {
        name: "Pharma Test Tab",
        sku: "PH-TST-1",
        sellingPrice: 10,
        gstSlabId: slabId,
        taxMode: "exclusive",
        trackStock: true,
      },
    })
    expect(prod.statusCode).toBe(201)
    const prodId = parseJson<{ success: true; data: { id: string } }>(prod.body).data.id

    const patch = await injectJson(ctx.app, "PATCH", `/products/${prodId}`, {
      headers: authBearer(token),
      payload: { genericName: "Paracetamol" },
    })
    expect(patch.statusCode).toBe(200)

    const q = await ctx.app.inject({
      method: "GET",
      url: "/products?q=Paracetamol",
      headers: authBearer(token),
    })
    expect(q.statusCode).toBe(200)
    const body = parseJson<{ success: true; data: { id: string; genericName?: string }[] }>(q.body)
    expect(body.data.some((p) => p.id === prodId)).toBe(true)
  })

  it("POST /pharmacy/unavailable-medicines creates row", async () => {
    const res = await injectJson(ctx.app, "POST", "/pharmacy/unavailable-medicines", {
      headers: authBearer(token),
      payload: { requestedName: "TestBrandX 500mg", note: "Customer asked" },
    })
    expect(res.statusCode).toBe(201)
    const row = parseJson<{ success: true; data: { id: string; status: string } }>(res.body).data
    expect(row.status).toBe("open")
  })

  it("GET /pos/in-stock-product-ids returns productIds array", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/pos/in-stock-product-ids",
      headers: authBearer(token),
    })
    expect(res.statusCode).toBe(200)
    const body = parseJson<{ success: true; data: { productIds: string[] } }>(res.body)
    expect(Array.isArray(body.data.productIds)).toBe(true)
  })
})
