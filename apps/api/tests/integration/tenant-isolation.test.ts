import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { authBearer, injectJson, parseJson } from "../helpers/http.js"
import { openTestApp } from "../helpers/context.js"
import { onboardRetailTenant } from "../factories/tenant.js"

describe("tenant isolation", () => {
  let ctx: Awaited<ReturnType<typeof openTestApp>>
  let tokenA: string
  let tenantA: string
  let productBId: string

  beforeAll(async () => {
    ctx = await openTestApp()
    const a = await onboardRetailTenant(ctx.app, {
      ownerEmail: "iso-a@qa.test",
      ownerPassword: "pass123456",
      businessName: "Tenant A",
    })
    tokenA = a.token
    tenantA = a.tenantId

    const b = await onboardRetailTenant(ctx.app, {
      ownerEmail: "iso-b@qa.test",
      ownerPassword: "pass123456",
      businessName: "Tenant B",
    })

    const slabRes = await ctx.app.inject({
      method: "GET",
      url: "/gst-slabs",
      headers: authBearer(b.token),
    })
    const slabs = parseJson<{ success: true; data: { id: string }[] }>(slabRes.body).data
    const slabId = slabs[0]?.id
    expect(slabId).toBeTruthy()

    const prod = await injectJson(ctx.app, "POST", "/products", {
      headers: authBearer(b.token),
      payload: {
        name: "B-Only Product",
        sku: "B-SKU-1",
        sellingPrice: 100,
        gstSlabId: slabId,
        taxMode: "exclusive",
        trackStock: true,
      },
    })
    expect(prod.statusCode).toBe(201)
    productBId = parseJson<{ success: true; data: { id: string } }>(prod.body).data.id
    expect(tenantA).not.toBe(b.tenantId)
  })

  afterAll(async () => {
    await ctx.close()
  })

  it("tenant A cannot GET tenant B product by id", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/products/${productBId}`,
      headers: authBearer(tokenA),
    })
    expect(res.statusCode).toBe(404)
    expect(parseJson(res.body)).toMatchObject({ success: false })
  })

  it("tenant A token cannot mutate tenant B category", async () => {
    const loginB = await injectJson(ctx.app, "POST", "/auth/login", {
      payload: { email: "iso-b@qa.test", password: "pass123456" },
    })
    const tokB = parseJson<{ success: true; data: { token: string } }>(loginB.body).data.token
    const createCat = await injectJson(ctx.app, "POST", "/categories", {
      headers: authBearer(tokB),
      payload: { name: "Cat-B-Only" },
    })
    expect(createCat.statusCode).toBe(201)
    const catId = parseJson<{ success: true; data: { id: string } }>(createCat.body).data.id

    const patch = await injectJson(ctx.app, "PATCH", `/categories/${catId}`, {
      headers: authBearer(tokenA),
      payload: { name: "Hacked" },
    })
    expect(patch.statusCode).toBe(404)
  })
})
