import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { resolveBusinessRules, VerticalCapability, resolveVerticalCapabilities } from "@repo/business-type-engine"
import { authBearer, injectJson, parseJson } from "../helpers/http.js"
import { openTestApp } from "../helpers/context.js"
import { onboardRetailTenant } from "../factories/tenant.js"

describe("capability pack scenarios", () => {
  it("resolveVerticalCapabilities matches golden pharmacy flags", () => {
    expect(resolveVerticalCapabilities("pharmacy")).toEqual([VerticalCapability.batchExpiry, VerticalCapability.rxScheduleH])
  })

  it("resolveVerticalCapabilities matches golden multi_branch flags", () => {
    expect(resolveVerticalCapabilities("multi_branch")).toEqual([
      VerticalCapability.interStoreTransfer,
      VerticalCapability.consolidatedReporting,
    ])
  })

  it("resolveBusinessRules merges tenant pilot with extra pack ids", () => {
    const r = resolveBusinessRules({
      coreBusinessType: "retail",
      tenantPilotVertical: "grocery",
      tenantEnabledPackIds: ["wholesale"],
    })
    expect(r.capabilities).toContain(VerticalCapability.weightBreakBulk)
    expect(r.capabilities).toContain(VerticalCapability.bulkPricingTiers)
    expect(r.capabilities).toContain(VerticalCapability.creditPolicyStrict)
  })

  describe("branch overrides and /me branchCode", () => {
    let ctx: Awaited<ReturnType<typeof openTestApp>>
    let ownerToken: string
    let branchId: string

    beforeAll(async () => {
      ctx = await openTestApp()
      const o = await onboardRetailTenant(ctx.app, {
        ownerEmail: "pack-branch@qa.test",
        ownerPassword: "packpass12345",
      })
      ownerToken = o.token

      await injectJson(ctx.app, "PATCH", "/settings/pilot-vertical", {
        headers: authBearer(ownerToken),
        payload: { pilotVertical: "grocery" },
      })

      const br = await injectJson(ctx.app, "POST", "/branches", {
        headers: authBearer(ownerToken),
        payload: { code: "rx-wing", name: "Rx wing", kind: "shop" },
      })
      branchId = parseJson<{ success: true; data: { id: string } }>(br.body).data.id

      const patchBr = await injectJson(ctx.app, "PATCH", `/branches/${branchId}`, {
        headers: authBearer(ownerToken),
        payload: { businessTypeSlug: "pharmacy", posMode: "standard" },
      })
      expect(patchBr.statusCode).toBe(200)
    })

    afterAll(async () => {
      await ctx.close()
    })

    it("GET /me?branchCode= returns branchCapabilities for branch slug override", async () => {
      const me = await injectJson(ctx.app, "GET", "/me?branchCode=rx-wing", { headers: authBearer(ownerToken) })
      expect(me.statusCode).toBe(200)
      const body = parseJson<{
        success: true
        data: {
          tenant: { capabilities: string[] }
          branchCapabilities?: string[]
          contextBranchCode?: string | null
        }
      }>(me.body)
      expect(body.data.tenant.capabilities).toContain(VerticalCapability.weightBreakBulk)
      expect(body.data.branchCapabilities).toEqual(
        expect.arrayContaining([VerticalCapability.batchExpiry, VerticalCapability.rxScheduleH]),
      )
      expect(body.data.contextBranchCode).toBe("rx-wing")
    })
  })

  describe("pharmacy batch receive requires expiry", () => {
    let ctx: Awaited<ReturnType<typeof openTestApp>>
    let token: string
    let slabId: string
    let productId: string

    beforeAll(async () => {
      ctx = await openTestApp()
      const o = await onboardRetailTenant(ctx.app, {
        ownerEmail: "pack-pharm@qa.test",
        ownerPassword: "packpass12345",
      })
      token = o.token

      await injectJson(ctx.app, "PATCH", "/settings/pilot-vertical", {
        headers: authBearer(token),
        payload: { pilotVertical: "pharmacy" },
      })

      const slabs = await injectJson(ctx.app, "GET", "/gst-slabs", { headers: authBearer(token) })
      slabId = parseJson<{ success: true; data: { id: string }[] }>(slabs.body).data[0]!.id

      const prod = await injectJson(ctx.app, "POST", "/products", {
        headers: authBearer(token),
        payload: {
          name: "Pharm test med",
          sku: "PHARM-PACK-1",
          sellingPrice: 20,
          gstSlabId: slabId,
          taxMode: "exclusive",
          trackStock: true,
          batchTracking: true,
        },
      })
      productId = parseJson<{ success: true; data: { id: string } }>(prod.body).data.id
    })

    afterAll(async () => {
      await ctx.close()
    })

    it("rejects batch receive without expiry when pharmacy pack active", async () => {
      const res = await injectJson(ctx.app, "POST", "/stock/batches/receive", {
        headers: authBearer(token),
        payload: {
          productId,
          branchId: "main",
          batchCode: "NO-EXP",
          qty: 3,
        },
      })
      expect(res.statusCode).toBe(400)
      const body = parseJson<{ success: false; error: { message: string } }>(res.body)
      expect(body.success).toBe(false)
      expect(body.error.message).toMatch(/Expiry date is required/i)
    })

    it("allows batch receive with expiry", async () => {
      const res = await injectJson(ctx.app, "POST", "/stock/batches/receive", {
        headers: authBearer(token),
        payload: {
          productId,
          branchId: "main",
          batchCode: "WITH-EXP",
          qty: 2,
          expiryDate: new Date("2099-12-01").toISOString(),
        },
      })
      expect(res.statusCode).toBe(201)
    })
  })

  describe("grocery loose fields require capability", () => {
    let ctx: Awaited<ReturnType<typeof openTestApp>>
    let token: string
    let slabId: string

    beforeAll(async () => {
      ctx = await openTestApp()
      const o = await onboardRetailTenant(ctx.app, {
        ownerEmail: "pack-groc@qa.test",
        ownerPassword: "packpass12345",
      })
      token = o.token

      const slabs = await injectJson(ctx.app, "GET", "/gst-slabs", { headers: authBearer(token) })
      slabId = parseJson<{ success: true; data: { id: string }[] }>(slabs.body).data[0]!.id
    })

    afterAll(async () => {
      await ctx.close()
    })

    it("rejects isLoose without weight_break_bulk on tenant or augment", async () => {
      const res = await injectJson(ctx.app, "POST", "/products", {
        headers: authBearer(token),
        payload: {
          name: "Loose rice",
          sku: "GROC-DENY-1",
          sellingPrice: 1,
          gstSlabId: slabId,
          taxMode: "exclusive",
          trackStock: true,
          isLoose: true,
        },
      })
      expect(res.statusCode).toBe(400)
    })

    it("allows isLoose with behavior augment weight_break_bulk", async () => {
      const res = await injectJson(ctx.app, "POST", "/products", {
        headers: authBearer(token),
        payload: {
          name: "Loose dal",
          sku: "GROC-AUG-1",
          sellingPrice: 2,
          gstSlabId: slabId,
          taxMode: "exclusive",
          trackStock: true,
          isLoose: true,
          behaviorAugmentFlags: [VerticalCapability.weightBreakBulk],
        },
      })
      expect(res.statusCode).toBe(201)
    })
  })
})
