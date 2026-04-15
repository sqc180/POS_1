import { describe, expect, it } from "vitest"
import {
  applyNavPresentation,
  getPortalNavGroupDefs,
  getPortalPageCopy,
  getPortalTheme,
  resolvePortalExperienceId,
} from "./portal-experience"

describe("resolvePortalExperienceId", () => {
  it("returns core_retail when no pilot", () => {
    expect(
      resolvePortalExperienceId({ businessType: "retail", pilotVertical: null }),
    ).toBe("core_retail")
  })

  it("returns core_supermart for supermart without pilot", () => {
    expect(
      resolvePortalExperienceId({ businessType: "supermart", pilotVertical: null }),
    ).toBe("core_supermart")
  })

  it("returns restaurant when pilot is restaurant", () => {
    expect(
      resolvePortalExperienceId({ businessType: "retail", pilotVertical: "restaurant" }),
    ).toBe("restaurant")
  })

  it("ignores invalid pilot and falls back to core", () => {
    expect(
      resolvePortalExperienceId({ businessType: "retail", pilotVertical: "not_a_real_pack" }),
    ).toBe("core_retail")
  })

  it("branch slug overrides tenant pilot when valid", () => {
    expect(
      resolvePortalExperienceId({
        businessType: "retail",
        pilotVertical: "grocery",
        branchBusinessTypeSlug: "restaurant",
      }),
    ).toBe("restaurant")
  })
})

describe("applyNavPresentation", () => {
  const baseMenu = [
    { id: "pos", label: "POS", href: "/pos" },
    { id: "billing", label: "Billing", href: "/invoices" },
    { id: "receipts", label: "Receipts", href: "/receipts" },
  ]

  it("overrides labels for restaurant", () => {
    const { menu, navGroups } = applyNavPresentation("restaurant", baseMenu)
    expect(menu.find((m) => m.id === "pos")?.label).toBe("Table POS")
    expect(menu.find((m) => m.id === "billing")?.label).toBe("Checks & invoices")
    expect(menu.find((m) => m.id === "receipts")?.label).toBe("Payment slips")
    const sales = navGroups.find((g) => g.key === "sales")
    expect(sales?.label).toBe("Front of house")
  })

  it("leaves labels for core retail", () => {
    const { menu } = applyNavPresentation("core_retail", baseMenu)
    expect(menu.find((m) => m.id === "pos")?.label).toBe("POS")
  })
})

describe("getPortalTheme", () => {
  it("restaurant uses dedicated asset paths", () => {
    const t = getPortalTheme("restaurant")
    expect(t.backgroundImageLight).toContain("/portal/restaurant/")
    expect(t.overlayClassName.length).toBeGreaterThan(0)
  })

  it("pharmacy uses placeholder paths", () => {
    const t = getPortalTheme("pharmacy")
    expect(t.backgroundImageLight).toBe("/portal/placeholder.svg")
    expect(t.dashboardAccent).toBe("pharmacy")
  })

  it("core retail has no dashboard accent from packs", () => {
    const t = getPortalTheme("core_retail")
    expect(t.dashboardAccent ?? null).toBeNull()
  })
})

describe("getPortalPageCopy", () => {
  it("restaurant copy matches billing terminology", () => {
    const c = getPortalPageCopy("restaurant")
    expect(c.billingScreenTitle).toBe("Checks & invoices")
    expect(c.receiptsScreenTitle).toBe("Payment slips")
  })
})

describe("getPortalNavGroupDefs", () => {
  it("wholesale sales group label differs from default", () => {
    const g = getPortalNavGroupDefs("wholesale")
    expect(g.find((x) => x.key === "sales")?.label).toBe("Orders & ledger")
  })
})
