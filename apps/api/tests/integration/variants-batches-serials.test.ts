import { afterAll, beforeAll, describe, expect, it } from "vitest"
import mongoose from "mongoose"
import { authBearer, injectJson, parseJson } from "../helpers/http.js"
import { openTestApp } from "../helpers/context.js"
import { onboardRetailTenant } from "../factories/tenant.js"
import { StockBatchModel } from "../../src/models/stock-batch.model.js"

describe("variants, batch FEFO, and serials", () => {
  describe("product variants + POS preview + invoice stock", () => {
    let ctx: Awaited<ReturnType<typeof openTestApp>>
    let token: string
    let slabId: string
    let productId: string
    let variantId: string
    let variantInvId: string

    beforeAll(async () => {
      ctx = await openTestApp()
      const o = await onboardRetailTenant(ctx.app, {
        ownerEmail: "var@qa.test",
        ownerPassword: "pass123456",
      })
      token = o.token

      const slabs = await ctx.app.inject({
        method: "GET",
        url: "/gst-slabs",
        headers: authBearer(token),
      })
      slabId = parseJson<{ success: true; data: { id: string }[] }>(slabs.body).data[0].id

      const prod = await injectJson(ctx.app, "POST", "/products", {
        headers: authBearer(token),
        payload: {
          name: "Variant SKU parent",
          sku: "VAR-PARENT-1",
          sellingPrice: 120,
          gstSlabId: slabId,
          taxMode: "exclusive",
          trackStock: true,
          variantMode: "optional",
        },
      })
      expect(prod.statusCode).toBe(201)
      productId = parseJson<{ success: true; data: { id: string } }>(prod.body).data.id

      const v = await injectJson(ctx.app, "POST", `/products/${productId}/variants`, {
        headers: authBearer(token),
        payload: { label: "Size M", sku: "VAR-PARENT-1-M" },
      })
      expect(v.statusCode).toBe(201)
      variantId = parseJson<{ success: true; data: { id: string } }>(v.body).data.id

      const inv = await ctx.app.inject({
        method: "GET",
        url: "/inventory",
        headers: authBearer(token),
      })
      const rows = parseJson<{
        success: true
        data: { id: string; productId: string; variantId: string | null; variantLabel?: string }[]
      }>(inv.body).data
      const vRow = rows.find((r) => r.productId === productId && r.variantId === variantId)
      expect(vRow).toBeTruthy()
      expect(vRow!.variantLabel).toBe("Size M")
      variantInvId = vRow!.id

      const stockIn = await injectJson(ctx.app, "POST", "/stock/movements", {
        headers: authBearer(token),
        payload: {
          inventoryItemId: variantInvId,
          type: "in",
          quantity: 20,
          reason: "qa variant stock",
        },
      })
      expect(stockIn.statusCode).toBe(201)

      const patch = await injectJson(ctx.app, "PATCH", `/products/${productId}`, {
        headers: authBearer(token),
        payload: { variantMode: "required" },
      })
      expect(patch.statusCode).toBe(200)
    })

    afterAll(async () => {
      await ctx.close()
    })

    it("rejects POS preview when variant is required but omitted", async () => {
      const res = await injectJson(ctx.app, "POST", "/pos/preview", {
        headers: authBearer(token),
        payload: { lines: [{ productId, qty: 1 }] },
      })
      expect(res.statusCode).toBe(400)
      const body = parseJson<{ success: false; error: { message: string } }>(res.body)
      expect(body.success).toBe(false)
      expect(body.error.message).toContain("Variant is required")
    })

    it("POS preview with variantId reports sufficient stock", async () => {
      const res = await injectJson(ctx.app, "POST", "/pos/preview", {
        headers: authBearer(token),
        payload: { lines: [{ productId, qty: 3, variantId }] },
      })
      expect(res.statusCode).toBe(200)
      const body = parseJson<{
        success: true
        data: { lines: { stock: { tracked: boolean; sufficient?: boolean; requiresVariant?: boolean } }[] }
      }>(res.body)
      expect(body.data.lines[0]!.stock.tracked).toBe(true)
      expect(body.data.lines[0]!.stock.sufficient).toBe(true)
      expect(body.data.lines[0]!.stock.requiresVariant).toBe(false)
    })

    it("invoice complete decrements variant inventory row", async () => {
      const invBefore = await ctx.app.inject({
        method: "GET",
        url: "/inventory",
        headers: authBearer(token),
      })
      const rowsBefore = parseJson<{ success: true; data: { id: string; currentStock: number }[] }>(invBefore.body).data
      const stockBefore = rowsBefore.find((r) => r.id === variantInvId)!.currentStock

      const draft = await injectJson(ctx.app, "POST", "/invoices", {
        headers: authBearer(token),
        payload: { lines: [{ productId, qty: 4, variantId }] },
      })
      expect(draft.statusCode).toBe(201)
      const invoiceId = parseJson<{ success: true; data: { id: string } }>(draft.body).data.id

      const comp = await injectJson(ctx.app, "POST", `/invoices/${invoiceId}/complete`, {
        headers: authBearer(token),
        payload: {},
      })
      expect(comp.statusCode).toBe(200)

      const invAfter = await ctx.app.inject({
        method: "GET",
        url: "/inventory",
        headers: authBearer(token),
      })
      const rowsAfter = parseJson<{ success: true; data: { id: string; currentStock: number }[] }>(invAfter.body).data
      const stockAfter = rowsAfter.find((r) => r.id === variantInvId)!.currentStock
      expect(stockAfter).toBe(stockBefore - 4)
    })
  })

  describe("batch tracking FEFO", () => {
    let ctx: Awaited<ReturnType<typeof openTestApp>>
    let token: string
    let tenantId: string
    let slabId: string
    let productId: string

    beforeAll(async () => {
      ctx = await openTestApp()
      const o = await onboardRetailTenant(ctx.app, {
        ownerEmail: "batch@qa.test",
        ownerPassword: "pass123456",
      })
      token = o.token
      tenantId = o.tenantId

      const slabs = await ctx.app.inject({
        method: "GET",
        url: "/gst-slabs",
        headers: authBearer(token),
      })
      slabId = parseJson<{ success: true; data: { id: string }[] }>(slabs.body).data[0].id

      const prod = await injectJson(ctx.app, "POST", "/products", {
        headers: authBearer(token),
        payload: {
          name: "Batch cola",
          sku: "BATCH-COLA-1",
          sellingPrice: 40,
          gstSlabId: slabId,
          taxMode: "exclusive",
          trackStock: true,
          batchTracking: true,
        },
      })
      expect(prod.statusCode).toBe(201)
      productId = parseJson<{ success: true; data: { id: string } }>(prod.body).data.id

      const later = await injectJson(ctx.app, "POST", "/stock/batches/receive", {
        headers: authBearer(token),
        payload: {
          productId,
          branchId: "main",
          batchCode: "LOT-LATE",
          qty: 10,
          expiryDate: new Date("2099-06-01").toISOString(),
        },
      })
      expect(later.statusCode).toBe(201)

      const sooner = await injectJson(ctx.app, "POST", "/stock/batches/receive", {
        headers: authBearer(token),
        payload: {
          productId,
          branchId: "main",
          batchCode: "LOT-SOON",
          qty: 10,
          expiryDate: new Date("2026-01-15").toISOString(),
        },
      })
      expect(sooner.statusCode).toBe(201)
    })

    afterAll(async () => {
      await ctx.close()
    })

    it("consumes earlier-expiring batch first on invoice complete", async () => {
      const tenantOid = new mongoose.Types.ObjectId(tenantId)
      const productOid = new mongoose.Types.ObjectId(productId)
      const batchesBefore = await StockBatchModel.find({
        tenantId: tenantOid,
        productId: productOid,
        branchId: "main",
      })
        .sort({ expiryDate: 1 })
        .lean()
      expect(batchesBefore.length).toBeGreaterThanOrEqual(2)
      const soonerBatch = batchesBefore.find((b) => b.batchCode === "LOT-SOON")
      const laterBatch = batchesBefore.find((b) => b.batchCode === "LOT-LATE")
      expect(soonerBatch?.qtyOnHand).toBe(10)
      expect(laterBatch?.qtyOnHand).toBe(10)

      const draft = await injectJson(ctx.app, "POST", "/invoices", {
        headers: authBearer(token),
        payload: { lines: [{ productId, qty: 4 }] },
      })
      expect(draft.statusCode).toBe(201)
      const invoiceId = parseJson<{ success: true; data: { id: string } }>(draft.body).data.id

      const comp = await injectJson(ctx.app, "POST", `/invoices/${invoiceId}/complete`, {
        headers: authBearer(token),
        payload: {},
      })
      expect(comp.statusCode).toBe(200)

      const batchesAfter = await StockBatchModel.find({
        tenantId: tenantOid,
        productId: productOid,
        branchId: "main",
      }).lean()
      const soonAfter = batchesAfter.find((b) => b.batchCode === "LOT-SOON")
      const lateAfter = batchesAfter.find((b) => b.batchCode === "LOT-LATE")
      expect(soonAfter?.qtyOnHand).toBe(6)
      expect(lateAfter?.qtyOnHand).toBe(10)
    })
  })

  describe("serial tracking", () => {
    let ctx: Awaited<ReturnType<typeof openTestApp>>
    let token: string
    let slabId: string
    let productId: string
    let inventoryId: string

    beforeAll(async () => {
      ctx = await openTestApp()
      const o = await onboardRetailTenant(ctx.app, {
        ownerEmail: "serial@qa.test",
        ownerPassword: "pass123456",
      })
      token = o.token

      const slabs = await ctx.app.inject({
        method: "GET",
        url: "/gst-slabs",
        headers: authBearer(token),
      })
      slabId = parseJson<{ success: true; data: { id: string }[] }>(slabs.body).data[0].id

      const prod = await injectJson(ctx.app, "POST", "/products", {
        headers: authBearer(token),
        payload: {
          name: "Serial modem",
          sku: "SER-MODEM-1",
          sellingPrice: 999,
          gstSlabId: slabId,
          taxMode: "exclusive",
          trackStock: true,
          serialTracking: true,
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

      await injectJson(ctx.app, "POST", "/stock/movements", {
        headers: authBearer(token),
        payload: {
          inventoryItemId: inventoryId,
          type: "in",
          quantity: 2,
          reason: "qa serial stock",
        },
      })

      for (const sn of ["SN-QA-001", "SN-QA-002"]) {
        const reg = await injectJson(ctx.app, "POST", `/products/${productId}/serials`, {
          headers: authBearer(token),
          payload: { serialNumber: sn },
        })
        expect(reg.statusCode).toBe(201)
      }
    })

    afterAll(async () => {
      await ctx.close()
    })

    it("completes invoice when serial count matches quantity", async () => {
      const draft = await injectJson(ctx.app, "POST", "/invoices", {
        headers: authBearer(token),
        payload: {
          lines: [{ productId, qty: 2, serialNumbers: ["SN-QA-001", "SN-QA-002"] }],
        },
      })
      expect(draft.statusCode).toBe(201)
      const invoiceId = parseJson<{ success: true; data: { id: string } }>(draft.body).data.id

      const comp = await injectJson(ctx.app, "POST", `/invoices/${invoiceId}/complete`, {
        headers: authBearer(token),
        payload: {},
      })
      expect(comp.statusCode).toBe(200)
    })

    it("rejects duplicate serial registration for tenant", async () => {
      const first = await injectJson(ctx.app, "POST", `/products/${productId}/serials`, {
        headers: authBearer(token),
        payload: { serialNumber: "SN-UNIQUE-TENANT" },
      })
      expect(first.statusCode).toBe(201)

      const dup = await injectJson(ctx.app, "POST", `/products/${productId}/serials`, {
        headers: authBearer(token),
        payload: { serialNumber: "SN-UNIQUE-TENANT" },
      })
      expect(dup.statusCode).toBe(409)
    })
  })
})
