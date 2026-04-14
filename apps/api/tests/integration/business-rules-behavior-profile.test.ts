import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { authBearer, injectJson, parseJson } from "../helpers/http.js"
import { openTestApp } from "../helpers/context.js"
import { onboardRetailTenant } from "../factories/tenant.js"

describe("business rules: behaviorProfileId merge on stock receive", () => {
  let ctx: Awaited<ReturnType<typeof openTestApp>>
  let token: string
  let productId: string
  let slabId: string

  beforeAll(async () => {
    ctx = await openTestApp()
    const o = await onboardRetailTenant(ctx.app, {
      ownerEmail: "br-profile@qa.test",
      ownerPassword: "pass123456",
    })
    token = o.token
    const slabs = await injectJson(ctx.app, "GET", "/gst-slabs", { headers: authBearer(token) })
    slabId = parseJson<{ success: true; data: { id: string }[] }>(slabs.body).data[0]!.id

    const prod = await injectJson(ctx.app, "POST", "/products", {
      headers: authBearer(token),
      payload: {
        name: "Batch profile",
        sku: "BR-BATCH-PROF-1",
        sellingPrice: 10,
        gstSlabId: slabId,
        taxMode: "exclusive",
        trackStock: true,
        batchTracking: true,
        behaviorProfileId: "pharmacy_batches",
      },
    })
    expect(prod.statusCode).toBe(201)
    productId = parseJson<{ success: true; data: { id: string } }>(prod.body).data.id
  })

  afterAll(async () => {
    await ctx.close()
  })

  it("POST /stock/batches/receive rejects missing expiry when profile adds batch_expiry", async () => {
    const res = await injectJson(ctx.app, "POST", "/stock/batches/receive", {
      headers: authBearer(token),
      payload: {
        productId,
        branchId: "main",
        batchCode: "B-no-exp",
        qty: 1,
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it("POST /stock/batches/receive succeeds with expiry when profile adds batch_expiry", async () => {
    const res = await injectJson(ctx.app, "POST", "/stock/batches/receive", {
      headers: authBearer(token),
      payload: {
        productId,
        branchId: "main",
        batchCode: "B-with-exp",
        qty: 1,
        expiryDate: "2030-12-31",
      },
    })
    expect(res.statusCode).toBe(201)
    const data = parseJson<{ success: true; data: { id: string } }>(res.body).data
    expect(data.id).toMatch(/^[a-f0-9]{24}$/)
  })
})
