import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { authBearer, injectJson, parseJson } from "../helpers/http.js"
import { openTestApp } from "../helpers/context.js"
import { onboardRetailTenant } from "../factories/tenant.js"

describe("billing: invoice → complete → payment → receipt", () => {
  let ctx: Awaited<ReturnType<typeof openTestApp>>
  let token: string
  let productId: string
  let invoiceId: string

  beforeAll(async () => {
    ctx = await openTestApp()
    const o = await onboardRetailTenant(ctx.app, {
      ownerEmail: "bill@qa.test",
      ownerPassword: "pass123456",
    })
    token = o.token

    const slabs = await ctx.app.inject({
      method: "GET",
      url: "/gst-slabs",
      headers: authBearer(token),
    })
    const slabId = parseJson<{ success: true; data: { id: string }[] }>(slabs.body).data[0].id

    const prod = await injectJson(ctx.app, "POST", "/products", {
      headers: authBearer(token),
      payload: {
        name: "Billable",
        sku: "BILL-1",
        sellingPrice: 50,
        gstSlabId: slabId,
        taxMode: "exclusive",
        trackStock: true,
      },
    })
    productId = parseJson<{ success: true; data: { id: string } }>(prod.body).data.id

    const inv = await ctx.app.inject({
      method: "GET",
      url: "/inventory",
      headers: authBearer(token),
    })
    const invRow = parseJson<{ success: true; data: { id: string; productId: string }[] }>(inv.body).data.find(
      (r) => r.productId === productId,
    )
    await injectJson(ctx.app, "POST", "/stock/movements", {
      headers: authBearer(token),
      payload: {
        inventoryItemId: invRow!.id,
        type: "in",
        quantity: 10,
        reason: "qa",
      },
    })

    const draft = await injectJson(ctx.app, "POST", "/invoices", {
      headers: authBearer(token),
      payload: {
        lines: [{ productId, qty: 2 }],
      },
    })
    expect(draft.statusCode).toBe(201)
    invoiceId = parseJson<{ success: true; data: { id: string; status: string } }>(draft.body).data.id
  })

  afterAll(async () => {
    await ctx.close()
  })

  it("POST /payments rejected while invoice is draft", async () => {
    const inv = await ctx.app.inject({
      method: "GET",
      url: `/invoices/${invoiceId}`,
      headers: authBearer(token),
    })
    const row = parseJson<{ success: true; data: { grandTotal: number } }>(inv.body).data
    const pay = await injectJson(ctx.app, "POST", "/payments", {
      headers: authBearer(token),
      payload: {
        invoiceId,
        amount: row.grandTotal,
        method: "cash",
      },
    })
    expect(pay.statusCode).toBe(409)
  })

  it("POST /invoices/:id/complete then POST /payments succeeds", async () => {
    const comp = await injectJson(ctx.app, "POST", `/invoices/${invoiceId}/complete`, {
      headers: authBearer(token),
      payload: {},
    })
    expect(comp.statusCode).toBe(200)
    const completed = parseJson<{ success: true; data: { status: string; grandTotal: number } }>(comp.body).data
    expect(completed.status).toBe("completed")

    const pay = await injectJson(ctx.app, "POST", "/payments", {
      headers: authBearer(token),
      payload: {
        invoiceId,
        amount: completed.grandTotal,
        method: "cash",
      },
    })
    expect(pay.statusCode).toBe(201)
    const p = parseJson<{ success: true; data: { status: string } }>(pay.body).data
    expect(p.status).toBe("completed")
  })

  it("POST /receipts issues for paid invoice", async () => {
    const res = await injectJson(ctx.app, "POST", "/receipts", {
      headers: authBearer(token),
      payload: { invoiceId },
    })
    expect(res.statusCode).toBe(201)
    const rec = parseJson<{ success: true; data: { id: string } }>(res.body).data
    expect(rec.id).toMatch(/^[a-f0-9]{24}$/)
  })

  it("GET /invoices/:id/pdf returns PDF bytes", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/invoices/${invoiceId}/pdf`,
      headers: authBearer(token),
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers["content-type"]).toContain("application/pdf")
    expect(res.rawPayload.length).toBeGreaterThan(100)
  })
})
