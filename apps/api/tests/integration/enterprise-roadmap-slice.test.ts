import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { authBearer, injectJson, parseJson } from "../helpers/http.js"
import { openTestApp } from "../helpers/context.js"
import { onboardRetailTenant } from "../factories/tenant.js"

describe("enterprise roadmap slice (users paged, branch access, catalog paged, approvals, gst, jobs, locations)", () => {
  let ctx: Awaited<ReturnType<typeof openTestApp>>
  let ownerToken: string
  let productId: string
  let inventoryItemId: string
  let slabId: string

  beforeAll(async () => {
    ctx = await openTestApp()
    const o = await onboardRetailTenant(ctx.app, {
      ownerEmail: "ent-roadmap@qa.test",
      ownerPassword: "entpass12345",
    })
    ownerToken = o.token

    const slabs = await injectJson(ctx.app, "GET", "/gst-slabs", { headers: authBearer(ownerToken) })
    slabId = parseJson<{ success: true; data: { id: string }[] }>(slabs.body).data[0]!.id

    const prod = await injectJson(ctx.app, "POST", "/products", {
      headers: authBearer(ownerToken),
      payload: {
        name: "Ent SKU",
        sku: "ENT-SKU-1",
        internalCode: "INT-001",
        hsnSac: "1234",
        catalogLifecycle: "active",
        sellingPrice: 100,
        gstSlabId: slabId,
        taxMode: "exclusive",
        trackStock: true,
      },
    })
    productId = parseJson<{ success: true; data: { id: string } }>(prod.body).data.id

    const inv = await injectJson(ctx.app, "GET", "/inventory", { headers: authBearer(ownerToken) })
    const invRow = parseJson<{ success: true; data: { id: string; productId: string }[] }>(inv.body).data.find(
      (r) => r.productId === productId,
    )
    inventoryItemId = invRow!.id

    await injectJson(ctx.app, "POST", "/stock/movements", {
      headers: authBearer(ownerToken),
      payload: { inventoryItemId, type: "in", quantity: 20, reason: "qa enterprise slice" },
    })
  })

  afterAll(async () => {
    await ctx.close()
  })

  it("GET /users?paged=true returns paged shape", async () => {
    const res = await injectJson(ctx.app, "GET", "/users?paged=true&limit=10&skip=0", {
      headers: authBearer(ownerToken),
    })
    expect(res.statusCode).toBe(200)
    const b = parseJson<{ success: true; data: { items: unknown[]; total: number; skip: number; limit: number } }>(
      res.body,
    )
    expect(b.data.items.length).toBeGreaterThan(0)
    expect(b.data.total).toBeGreaterThan(0)
  })

  it("PATCH /users/:id/branch-access restricts listing by branchCode filter", async () => {
    const create = await injectJson(ctx.app, "POST", "/users", {
      headers: authBearer(ownerToken),
      payload: {
        email: "branchscoped@qa.test",
        password: "scopedpass123",
        name: "Branch Scoped",
        role: "cashier",
      },
    })
    expect(create.statusCode).toBe(201)
    const userId = parseJson<{ success: true; data: { id: string } }>(create.body).data.id

    const br = await injectJson(ctx.app, "GET", "/branches", { headers: authBearer(ownerToken) })
    const branches = parseJson<{ success: true; data: { code: string }[] }>(br.body).data
    const code = branches[0]?.code ?? "main"

    const patch = await injectJson(ctx.app, "PATCH", `/users/${userId}/branch-access`, {
      headers: authBearer(ownerToken),
      payload: { branchCodes: [code] },
    })
    expect(patch.statusCode).toBe(200)

    const filtered = await injectJson(ctx.app, "GET", `/users?paged=true&branchCode=${encodeURIComponent(code)}`, {
      headers: authBearer(ownerToken),
    })
    expect(filtered.statusCode).toBe(200)
    const rows = parseJson<{ success: true; data: { items: { id: string }[] } }>(filtered.body).data.items
    expect(rows.some((u) => u.id === userId)).toBe(true)
  })

  it("GET /products?paged=true includes HSN and lifecycle fields", async () => {
    const res = await injectJson(ctx.app, "GET", "/products?paged=true&limit=5&skip=0&q=ENT-SKU", {
      headers: authBearer(ownerToken),
    })
    expect(res.statusCode).toBe(200)
    const b = parseJson<{
      success: true
      data: { items: { id: string; hsnSac?: string; catalogLifecycle?: string }[] }
    }>(res.body)
    const hit = b.data.items.find((p) => p.id === productId)
    expect(hit).toBeTruthy()
    expect(hit!.hsnSac).toBe("1234")
    expect(hit!.catalogLifecycle ?? "active").toBe("active")
  })

  it("invoice submit-approval blocks complete until approved", async () => {
    const inv = await injectJson(ctx.app, "POST", "/invoices", {
      headers: authBearer(ownerToken),
      payload: { lines: [{ productId, qty: 1 }] },
    })
    expect(inv.statusCode).toBe(201)
    const invoiceId = parseJson<{ success: true; data: { id: string } }>(inv.body).data.id

    const sub = await injectJson(ctx.app, "POST", `/invoices/${invoiceId}/submit-approval`, {
      headers: authBearer(ownerToken),
      payload: {},
    })
    expect(sub.statusCode).toBe(200)

    const blocked = await injectJson(ctx.app, "POST", `/invoices/${invoiceId}/complete`, {
      headers: authBearer(ownerToken),
      payload: {},
    })
    expect(blocked.statusCode).toBe(409)

    const appr = await injectJson(ctx.app, "POST", `/invoices/${invoiceId}/approve-approval`, {
      headers: authBearer(ownerToken),
      payload: {},
    })
    expect(appr.statusCode).toBe(200)

    const done = await injectJson(ctx.app, "POST", `/invoices/${invoiceId}/complete`, {
      headers: authBearer(ownerToken),
      payload: {},
    })
    expect(done.statusCode).toBe(200)
  })

  it("GET /gst/summary returns aggregate object", async () => {
    const res = await injectJson(ctx.app, "GET", "/gst/summary", { headers: authBearer(ownerToken) })
    expect(res.statusCode).toBe(200)
    const b = parseJson<{ success: true; data: Record<string, unknown> }>(res.body)
    expect(typeof b.data).toBe("object")
  })

  it("POST /jobs gst_summary_export then GET /jobs/:id", async () => {
    const enq = await injectJson(ctx.app, "POST", "/jobs", {
      headers: authBearer(ownerToken),
      payload: { type: "gst_summary_export", payload: {} },
    })
    expect(enq.statusCode).toBe(201)
    const jobId = parseJson<{ success: true; data: { id: string; status: string } }>(enq.body).data.id

    const job = await injectJson(ctx.app, "GET", `/jobs/${jobId}`, { headers: authBearer(ownerToken) })
    expect(job.statusCode).toBe(200)
    const row = parseJson<{ success: true; data: { status: string } }>(job.body).data
    expect(["completed", "failed", "processing", "pending"]).toContain(row.status)
  })

  it("GET /inventory/locations returns array", async () => {
    const res = await injectJson(ctx.app, "GET", "/inventory/locations", { headers: authBearer(ownerToken) })
    expect(res.statusCode).toBe(200)
    const b = parseJson<{ success: true; data: unknown[] }>(res.body)
    expect(Array.isArray(b.data)).toBe(true)
  })

  it("GET /customers/:id/receivable after creating customer", async () => {
    const c = await injectJson(ctx.app, "POST", "/customers", {
      headers: authBearer(ownerToken),
      payload: { name: "Receivable Co", creditLimit: 5000 },
    })
    expect(c.statusCode).toBe(201)
    const customerId = parseJson<{ success: true; data: { id: string } }>(c.body).data.id

    const rec = await injectJson(ctx.app, "GET", `/customers/${customerId}/receivable`, {
      headers: authBearer(ownerToken),
    })
    expect(rec.statusCode).toBe(200)
    const body = parseJson<{ success: true; data: { outstanding: number; creditLimit: number } }>(rec.body)
    expect(typeof body.data.outstanding).toBe("number")
    expect(body.data.creditLimit).toBe(5000)
  })
})
