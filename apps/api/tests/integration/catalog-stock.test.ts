import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { authBearer, injectJson, parseJson } from "../helpers/http.js"
import { openTestApp } from "../helpers/context.js"
import { onboardRetailTenant } from "../factories/tenant.js"

describe("categories, products, gst, inventory, stock", () => {
  let ctx: Awaited<ReturnType<typeof openTestApp>>
  let token: string
  let slabId: string
  let productId: string
  let inventoryId: string

  beforeAll(async () => {
    ctx = await openTestApp()
    const o = await onboardRetailTenant(ctx.app, {
      ownerEmail: "cat@qa.test",
      ownerPassword: "pass123456",
    })
    token = o.token

    const slabs = await ctx.app.inject({
      method: "GET",
      url: "/gst-slabs",
      headers: authBearer(token),
    })
    slabId = parseJson<{ success: true; data: { id: string }[] }>(slabs.body).data[0].id

    const cat = await injectJson(ctx.app, "POST", "/categories", {
      headers: authBearer(token),
      payload: { name: "Electronics" },
    })
    expect(cat.statusCode).toBe(201)
    const catId = parseJson<{ success: true; data: { id: string } }>(cat.body).data.id

    const prod = await injectJson(ctx.app, "POST", "/products", {
      headers: authBearer(token),
      payload: {
        name: "Test SKU",
        sku: "TSKU-1",
        sellingPrice: 199,
        gstSlabId: slabId,
        taxMode: "exclusive",
        categoryId: catId,
        trackStock: true,
      },
    })
    expect(prod.statusCode).toBe(201)
    productId = parseJson<{ success: true; data: { id: string } }>(prod.body).data.id

    const inv = await ctx.app.inject({
      method: "GET",
      url: "/inventory",
      headers: authBearer(token),
    })
    const rows = parseJson<{ success: true; data: { id: string; productId: string }[] }>(inv.body).data
    const row = rows.find((r) => r.productId === productId)
    expect(row).toBeTruthy()
    inventoryId = row!.id
  })

  afterAll(async () => {
    await ctx.close()
  })

  it("GET /products lists created product", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/products",
      headers: authBearer(token),
    })
    expect(res.statusCode).toBe(200)
    const b = parseJson<{ success: true; data: { id: string }[] }>(res.body)
    expect(b.data.some((p) => p.id === productId)).toBe(true)
  })

  it("POST /stock/movements stock-in updates inventory", async () => {
    const res = await injectJson(ctx.app, "POST", "/stock/movements", {
      headers: authBearer(token),
      payload: {
        inventoryItemId: inventoryId,
        type: "in",
        quantity: 5,
        reason: "qa opening",
      },
    })
    expect(res.statusCode).toBe(201)
  })

  it("POST /gst-slabs validates rates", async () => {
    const res = await injectJson(ctx.app, "POST", "/gst-slabs", {
      headers: authBearer(token),
      payload: { name: "Bad", cgstRate: -1, sgstRate: 0, igstRate: 0 },
    })
    expect(res.statusCode).toBe(400)
  })

  it("PATCH /products/:id rejects invalid status enum", async () => {
    const res = await injectJson(ctx.app, "PATCH", `/products/${productId}`, {
      headers: authBearer(token),
      payload: { status: "unknown" },
    })
    expect(res.statusCode).toBe(400)
  })
})
