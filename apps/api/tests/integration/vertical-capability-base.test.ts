import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { assertPilotCapabilityMapComplete, VerticalCapability } from "@repo/business-type-engine"
import { authBearer, injectJson, parseJson } from "../helpers/http.js"
import { openTestApp } from "../helpers/context.js"
import { onboardRetailTenant } from "../factories/tenant.js"

describe("vertical capability base", () => {
  it("pilot capability map covers every roadmap slug", () => {
    expect(() => assertPilotCapabilityMapComplete()).not.toThrow()
  })

  let ctx: Awaited<ReturnType<typeof openTestApp>>
  let ownerToken: string
  let productId: string
  let invMainId: string

  beforeAll(async () => {
    ctx = await openTestApp()
    const o = await onboardRetailTenant(ctx.app, {
      ownerEmail: "vert-cap@qa.test",
      ownerPassword: "vertpass12345",
    })
    ownerToken = o.token

    const slabs = await injectJson(ctx.app, "GET", "/gst-slabs", { headers: authBearer(ownerToken) })
    const slabId = parseJson<{ success: true; data: { id: string }[] }>(slabs.body).data[0]!.id

    const prod = await injectJson(ctx.app, "POST", "/products", {
      headers: authBearer(ownerToken),
      payload: {
        name: "Transfer widget",
        sku: "VERT-TR-1",
        sellingPrice: 10,
        gstSlabId: slabId,
        taxMode: "exclusive",
        trackStock: true,
        saleUom: "piece",
        isLoose: false,
      },
    })
    productId = parseJson<{ success: true; data: { id: string } }>(prod.body).data.id

    const inv = await injectJson(ctx.app, "GET", "/inventory", { headers: authBearer(ownerToken) })
    const row = parseJson<{ success: true; data: { id: string; productId: string }[] }>(inv.body).data.find(
      (r) => r.productId === productId,
    )
    invMainId = row!.id

    await injectJson(ctx.app, "POST", "/stock/movements", {
      headers: authBearer(ownerToken),
      payload: { inventoryItemId: invMainId, type: "in", quantity: 5, reason: "seed" },
    })

    await injectJson(ctx.app, "POST", "/branches", {
      headers: authBearer(ownerToken),
      payload: { code: "wh-east", name: "Warehouse East", kind: "warehouse" },
    })
  })

  afterAll(async () => {
    await ctx.close()
  })

  it("GET /me includes capabilities empty before pilot is set", async () => {
    const res = await injectJson(ctx.app, "GET", "/me", { headers: authBearer(ownerToken) })
    expect(res.statusCode).toBe(200)
    const b = parseJson<{
      success: true
      data: { tenant: { pilotVertical?: string | null; capabilities: string[] } }
    }>(res.body)
    expect(Array.isArray(b.data.tenant.capabilities)).toBe(true)
    expect(b.data.tenant.capabilities).toEqual([])
  })

  it("PATCH /settings/pilot-vertical sets grocery and GET /me exposes weight_break_bulk", async () => {
    const patch = await injectJson(ctx.app, "PATCH", "/settings/pilot-vertical", {
      headers: authBearer(ownerToken),
      payload: { pilotVertical: "grocery" },
    })
    expect(patch.statusCode).toBe(200)

    const me = await injectJson(ctx.app, "GET", "/me", { headers: authBearer(ownerToken) })
    const body = parseJson<{
      success: true
      data: { tenant: { pilotVertical: string | null; capabilities: string[] } }
    }>(me.body)
    expect(body.data.tenant.pilotVertical).toBe("grocery")
    expect(body.data.tenant.capabilities).toContain(VerticalCapability.weightBreakBulk)
  })

  it("PATCH /settings/pilot-vertical rejects unknown slug", async () => {
    const res = await injectJson(ctx.app, "PATCH", "/settings/pilot-vertical", {
      headers: authBearer(ownerToken),
      payload: { pilotVertical: "not_a_real_vertical" },
    })
    expect(res.statusCode).toBe(400)
  })

  it("POST /stock/inter-branch-transfer moves qty to another branch row", async () => {
    const tr = await injectJson(ctx.app, "POST", "/stock/inter-branch-transfer", {
      headers: authBearer(ownerToken),
      payload: {
        fromInventoryItemId: invMainId,
        toBranchId: "wh-east",
        quantity: 2,
        reason: "qa transfer",
      },
    })
    expect(tr.statusCode).toBe(201)
    const inv = await injectJson(ctx.app, "GET", "/inventory", { headers: authBearer(ownerToken) })
    const rows = parseJson<{ success: true; data: { id: string; branchId: string; currentStock: number }[] }>(inv.body).data
    const main = rows.find((r) => r.id === invMainId)
    const east = rows.find((r) => r.productId === productId && r.branchId === "wh-east")
    expect(main?.currentStock).toBe(3)
    expect(east?.currentStock).toBe(2)
  })
})
