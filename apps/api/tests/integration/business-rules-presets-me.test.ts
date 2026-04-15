import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { buildProductFieldHintsFromCaps, VerticalCapability } from "@repo/business-type-engine"
import { resolveRulesForTenantDoc } from "../../src/lib/ruleResolver.js"
import { authBearer, injectJson, parseJson } from "../helpers/http.js"
import { openTestApp } from "../helpers/context.js"
import { onboardRetailTenant } from "../factories/tenant.js"

describe("business rules: presets, /me parity, API validation", () => {
  let ctx: Awaited<ReturnType<typeof openTestApp>>
  let token: string
  let slabId: string

  beforeAll(async () => {
    ctx = await openTestApp()
    const o = await onboardRetailTenant(ctx.app, {
      ownerEmail: "br-presets@qa.test",
      ownerPassword: "pass123456",
    })
    token = o.token
    const slabs = await injectJson(ctx.app, "GET", "/gst-slabs", { headers: authBearer(token) })
    slabId = parseJson<{ success: true; data: { id: string }[] }>(slabs.body).data[0]!.id
  })

  afterAll(async () => {
    await ctx.close()
  })

  it("GET /me productFieldHints match engine buildProductFieldHintsFromCaps (retail, no pilot)", async () => {
    const me = await injectJson(ctx.app, "GET", "/me", { headers: authBearer(token) })
    expect(me.statusCode).toBe(200)
    const body = parseJson<{
      success: true
      data: {
        tenant: { capabilities: string[]; pilotVertical?: string | null; enabledPackIds?: string[]; businessType: string }
        productFieldHints?: { key: string; visible: boolean; section: string }[]
      }
    }>(me.body)
    const expected = buildProductFieldHintsFromCaps(body.data.tenant.capabilities)
    expect(body.data.productFieldHints?.length).toBe(expected.length)
    for (const row of expected) {
      const found = body.data.productFieldHints?.find((h) => h.key === row.key)
      expect(found?.visible).toBe(row.visible)
      expect(found?.section).toBe(row.section)
    }
    const sale = body.data.productFieldHints?.find((h) => h.key === "saleUom")
    expect(sale?.visible).toBe(false)
  })

  it("GET /tenant/product-field-presets matches GET /me hints for tenant caps", async () => {
    const me = await injectJson(ctx.app, "GET", "/me", { headers: authBearer(token) })
    const presets = await injectJson(ctx.app, "GET", "/tenant/product-field-presets", { headers: authBearer(token) })
    expect(presets.statusCode).toBe(200)
    const hints = parseJson<{ success: true; data: { hints: { key: string; visible: boolean; section: string }[] } }>(
      presets.body,
    ).data.hints
    const meHints = parseJson<{ success: true; data: { productFieldHints?: typeof hints } }>(me.body).data
      .productFieldHints
    expect(hints).toEqual(meHints)
  })

  it("resolveRulesForTenantDoc capabilities match GET /me tenant.capabilities", async () => {
    const me = await injectJson(ctx.app, "GET", "/me", { headers: authBearer(token) })
    const body = parseJson<{
      success: true
      data: { tenant: { capabilities: string[]; pilotVertical?: string | null; enabledPackIds?: string[]; businessType: string } }
    }>(me.body)
    const rules = resolveRulesForTenantDoc({
      businessType: body.data.tenant.businessType,
      pilotVertical: body.data.tenant.pilotVertical,
      enabledPackIds: body.data.tenant.enabledPackIds ?? [],
    })
    expect([...rules.capabilities].sort()).toEqual([...body.data.tenant.capabilities].sort())
  })

  it("POST /products rejects isLoose without weight_break_bulk capability", async () => {
    const res = await injectJson(ctx.app, "POST", "/products", {
      headers: authBearer(token),
      payload: {
        name: "Loose bad",
        sku: "BR-LOOSE-1",
        sellingPrice: 1,
        gstSlabId: slabId,
        taxMode: "exclusive",
        trackStock: false,
        isLoose: true,
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it("POST /products rejects saleUom in body without weight_break_bulk (schemaFactory path)", async () => {
    const res = await injectJson(ctx.app, "POST", "/products", {
      headers: authBearer(token),
      payload: {
        name: "Uom bad",
        sku: "BR-UOM-ZOD-1",
        sellingPrice: 1,
        gstSlabId: slabId,
        taxMode: "exclusive",
        trackStock: false,
        saleUom: "kg",
      },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe("business rules: presets after grocery pilot", () => {
  let ctx: Awaited<ReturnType<typeof openTestApp>>
  let token: string
  let slabId: string

  beforeAll(async () => {
    ctx = await openTestApp()
    const o = await onboardRetailTenant(ctx.app, {
      ownerEmail: "br-grocery@qa.test",
      ownerPassword: "pass123456",
    })
    token = o.token
    const slabs = await injectJson(ctx.app, "GET", "/gst-slabs", { headers: authBearer(token) })
    slabId = parseJson<{ success: true; data: { id: string }[] }>(slabs.body).data[0]!.id
    const patch = await injectJson(ctx.app, "PATCH", "/settings/pilot-vertical", {
      headers: authBearer(token),
      payload: { pilotVertical: "grocery" },
    })
    expect(patch.statusCode).toBe(200)
  })

  afterAll(async () => {
    await ctx.close()
  })

  it("GET /me shows saleUom in productFieldHints as visible", async () => {
    const me = await injectJson(ctx.app, "GET", "/me", { headers: authBearer(token) })
    const body = parseJson<{
      success: true
      data: {
        productFieldHints?: { key: string; visible: boolean }[]
        tenant: { capabilities: string[] }
      }
    }>(me.body)
    const sale = body.data.productFieldHints?.find((h) => h.key === "saleUom")
    expect(sale?.visible).toBe(true)
    expect(body.data.tenant.capabilities).toContain(VerticalCapability.weightBreakBulk)
  })

  it("resolveRulesForTenantDoc still matches /me capabilities after pilot", async () => {
    const me = await injectJson(ctx.app, "GET", "/me", { headers: authBearer(token) })
    const body = parseJson<{
      success: true
      data: { tenant: { capabilities: string[]; pilotVertical?: string | null; enabledPackIds?: string[]; businessType: string } }
    }>(me.body)
    const rules = resolveRulesForTenantDoc({
      businessType: body.data.tenant.businessType,
      pilotVertical: body.data.tenant.pilotVertical,
      enabledPackIds: body.data.tenant.enabledPackIds ?? [],
    })
    expect([...rules.capabilities].sort()).toEqual([...body.data.tenant.capabilities].sort())
  })

  it("POST /products allows isLoose when grocery capability active", async () => {
    const res = await injectJson(ctx.app, "POST", "/products", {
      headers: authBearer(token),
      payload: {
        name: "Loose ok",
        sku: "BR-LOOSE-OK-1",
        sellingPrice: 2,
        gstSlabId: slabId,
        taxMode: "exclusive",
        trackStock: false,
        isLoose: true,
        saleUom: "kg",
      },
    })
    expect(res.statusCode).toBe(201)
  })
})

describe("portal experience: /me after restaurant pilot", () => {
  let ctx: Awaited<ReturnType<typeof openTestApp>>
  let token: string

  beforeAll(async () => {
    ctx = await openTestApp()
    const o = await onboardRetailTenant(ctx.app, {
      ownerEmail: "portal-restaurant@qa.test",
      ownerPassword: "pass123456",
    })
    token = o.token
    const patch = await injectJson(ctx.app, "PATCH", "/settings/pilot-vertical", {
      headers: authBearer(token),
      payload: { pilotVertical: "restaurant" },
    })
    expect(patch.statusCode).toBe(200)
  })

  afterAll(async () => {
    await ctx.close()
  })

  it("GET /me includes portal fields, nav groups, themed menu labels, and page copy", async () => {
    const me = await injectJson(ctx.app, "GET", "/me", { headers: authBearer(token) })
    expect(me.statusCode).toBe(200)
    const body = parseJson<{
      success: true
      data: {
        tenant: {
          portalExperienceId: string
          portalTheme: {
            backgroundImageLight: string
            backgroundImageDark: string
            overlayClassName: string
            dashboardAccent?: string | null
          }
        }
        navGroups: { key: string; label: string; ids: string[] }[]
        menu: { id: string; label: string }[]
        portalPageCopy: { posScreenTitle: string; billingScreenTitle: string; receiptsScreenTitle: string }
      }
    }>(me.body)
    expect(body.data.tenant.portalExperienceId).toBe("restaurant")
    expect(body.data.tenant.portalTheme.backgroundImageLight).toContain("/portal/restaurant/")
    expect(body.data.tenant.portalTheme.overlayClassName.length).toBeGreaterThan(0)
    expect(body.data.tenant.portalTheme.dashboardAccent).toBe("restaurant")
    const pos = body.data.menu.find((m) => m.id === "pos")
    expect(pos?.label).toBe("Table POS")
    const billing = body.data.menu.find((m) => m.id === "billing")
    expect(billing?.label).toBe("Checks & invoices")
    const sales = body.data.navGroups.find((g) => g.key === "sales")
    expect(sales?.label).toBe("Front of house")
    expect(body.data.portalPageCopy.billingScreenTitle).toBe("Checks & invoices")
    expect(body.data.portalPageCopy.receiptsScreenTitle).toBe("Payment slips")
    expect(body.data.portalPageCopy.posScreenTitle).toBe("Table POS")
  })
})
