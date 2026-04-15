import type { BusinessTypeId, NavItemDTO } from "@repo/types"
import { getCapabilityPackById } from "./capability-packs"
import type { FutureBusinessTypeSlug } from "./future-registry"
import { isPilotVerticalSlug } from "./vertical-capabilities"

/** Tenant-level shell identity: pilot vertical slug, or core ERP profile. */
export type PortalExperienceId = FutureBusinessTypeSlug | "core_retail" | "core_supermart"

export interface PortalNavGroupDef {
  readonly key: string
  readonly label: string
  /** Nav item ids in display order (same contract as `groupNavForShell`). */
  readonly ids: readonly string[]
}

export interface PortalThemeDTO {
  /** Public URL path (e.g. `/portal/restaurant/bg-light.svg`). */
  readonly backgroundImageLight: string
  readonly backgroundImageDark: string
  /** Tailwind classes for the scrim above the photo (readability). */
  readonly overlayClassName: string
  /** From capability pack `uiRules.dashboardAccent` when this experience is a pack id. */
  readonly dashboardAccent?: string | null
}

export interface PortalPageCopyDTO {
  readonly posScreenTitle: string
  readonly billingScreenTitle: string
  readonly receiptsScreenTitle: string
}

export interface PortalExperienceConfig {
  readonly navGroupDefs: readonly PortalNavGroupDef[]
  readonly menuLabelOverrides: Readonly<Partial<Record<string, string>>>
  readonly theme: PortalThemeDTO
  readonly pageCopy: PortalPageCopyDTO
}

const defaultNavGroups: readonly PortalNavGroupDef[] = [
  { key: "overview", label: "Overview", ids: ["dashboard", "documents"] },
  { key: "sales", label: "Sales & payments", ids: ["pos", "billing", "payments", "receipts", "refunds"] },
  { key: "catalog", label: "Catalog & inventory", ids: ["products", "categories", "branches", "inventory", "stock"] },
  { key: "partners", label: "Customers & suppliers", ids: ["customers", "suppliers"] },
  { key: "tax", label: "Tax", ids: ["gst"] },
  { key: "team", label: "Team & access", ids: ["users", "roles"] },
  { key: "system", label: "Settings & system", ids: ["settings", "audit", "gateway", "guide"] },
]

const defaultPageCopy: PortalPageCopyDTO = {
  posScreenTitle: "Point of sale",
  billingScreenTitle: "Billing",
  receiptsScreenTitle: "Receipts",
}

const placeholderTheme = (overlay: string): PortalThemeDTO => ({
  backgroundImageLight: "/portal/placeholder.svg",
  backgroundImageDark: "/portal/placeholder.svg",
  overlayClassName: overlay,
  dashboardAccent: null,
})

const coreTheme = (slug: "retail" | "supermart"): PortalThemeDTO => ({
  backgroundImageLight: `/portal/core_${slug}/bg-light.svg`,
  backgroundImageDark: `/portal/core_${slug}/bg-dark.svg`,
  overlayClassName: "bg-background/75 dark:bg-background/80",
  dashboardAccent: null,
})

const restaurantTheme: PortalThemeDTO = {
  backgroundImageLight: "/portal/restaurant/bg-light.svg",
  backgroundImageDark: "/portal/restaurant/bg-dark.svg",
  overlayClassName: "bg-background/70 dark:bg-background/85",
}

const pharmacyNavGroups: readonly PortalNavGroupDef[] = [
  { key: "overview", label: "Overview", ids: ["dashboard", "documents"] },
  { key: "sales", label: "Dispensing & payments", ids: ["pos", "billing", "payments", "receipts", "refunds"] },
  ...defaultNavGroups.slice(2),
]

const wholesaleNavGroups: readonly PortalNavGroupDef[] = [
  { key: "overview", label: "Overview", ids: ["dashboard", "documents"] },
  { key: "sales", label: "Orders & ledger", ids: ["pos", "billing", "payments", "receipts", "refunds"] },
  { key: "catalog", label: "Catalog & stock", ids: ["products", "categories", "branches", "inventory", "stock"] },
  { key: "partners", label: "Buyers & vendors", ids: ["customers", "suppliers"] },
  { key: "tax", label: "Tax", ids: ["gst"] },
  { key: "team", label: "Team & access", ids: ["users", "roles"] },
  { key: "system", label: "Settings & system", ids: ["settings", "audit", "gateway", "guide"] },
]

const restaurantNavGroups: readonly PortalNavGroupDef[] = [
  { key: "overview", label: "Overview", ids: ["dashboard", "documents"] },
  { key: "sales", label: "Front of house", ids: ["pos", "billing", "payments", "receipts", "refunds"] },
  { key: "catalog", label: "Menu & kitchen stock", ids: ["products", "categories", "branches", "inventory", "stock"] },
  { key: "partners", label: "Guests & vendors", ids: ["customers", "suppliers"] },
  { key: "tax", label: "Tax", ids: ["gst"] },
  { key: "team", label: "Team & access", ids: ["users", "roles"] },
  { key: "system", label: "Settings & system", ids: ["settings", "audit", "gateway", "guide"] },
]

const distributionNavGroups: readonly PortalNavGroupDef[] = [
  { key: "overview", label: "Overview", ids: ["dashboard", "documents"] },
  { key: "sales", label: "Van sales & collections", ids: ["pos", "billing", "payments", "receipts", "refunds"] },
  { key: "catalog", label: "Catalog & inventory", ids: ["products", "categories", "branches", "inventory", "stock"] },
  { key: "partners", label: "Retailers & suppliers", ids: ["customers", "suppliers"] },
  { key: "tax", label: "Tax", ids: ["gst"] },
  { key: "team", label: "Team & access", ids: ["users", "roles"] },
  { key: "system", label: "Settings & system", ids: ["settings", "audit", "gateway", "guide"] },
]

const serviceRepairNavGroups: readonly PortalNavGroupDef[] = [
  { key: "overview", label: "Overview", ids: ["dashboard", "documents"] },
  { key: "sales", label: "Jobs & billing", ids: ["pos", "billing", "payments", "receipts", "refunds"] },
  ...defaultNavGroups.slice(2),
]

const CONFIGS: Record<PortalExperienceId, PortalExperienceConfig> = {
  core_retail: {
    navGroupDefs: defaultNavGroups,
    menuLabelOverrides: {},
    theme: coreTheme("retail"),
    pageCopy: defaultPageCopy,
  },
  core_supermart: {
    navGroupDefs: defaultNavGroups,
    menuLabelOverrides: {},
    theme: coreTheme("supermart"),
    pageCopy: {
      posScreenTitle: "High-volume POS",
      billingScreenTitle: "Billing",
      receiptsScreenTitle: "Receipts",
    },
  },
  pharmacy: {
    navGroupDefs: pharmacyNavGroups,
    menuLabelOverrides: { billing: "Invoices", receipts: "Payment receipts" },
    theme: placeholderTheme("bg-background/78 dark:bg-background/82"),
    pageCopy: {
      posScreenTitle: "Dispense POS",
      billingScreenTitle: "Invoices",
      receiptsScreenTitle: "Payment receipts",
    },
  },
  medical_store: {
    navGroupDefs: pharmacyNavGroups,
    menuLabelOverrides: { billing: "Sales bill", receipts: "Receipts" },
    theme: placeholderTheme("bg-background/78 dark:bg-background/82"),
    pageCopy: {
      posScreenTitle: "Counter POS",
      billingScreenTitle: "Sales billing",
      receiptsScreenTitle: "Receipts",
    },
  },
  grocery: {
    navGroupDefs: defaultNavGroups,
    menuLabelOverrides: { pos: "Checkout", products: "Articles & PLU" },
    theme: placeholderTheme("bg-background/75 dark:bg-background/80"),
    pageCopy: {
      posScreenTitle: "Checkout",
      billingScreenTitle: "Billing",
      receiptsScreenTitle: "Receipts",
    },
  },
  wholesale: {
    navGroupDefs: wholesaleNavGroups,
    menuLabelOverrides: { billing: "Sales orders", receipts: "Payment advice", customers: "Buyers" },
    theme: placeholderTheme("bg-background/76 dark:bg-background/81"),
    pageCopy: {
      posScreenTitle: "Trade desk",
      billingScreenTitle: "Sales orders",
      receiptsScreenTitle: "Payment advice",
    },
  },
  restaurant: {
    navGroupDefs: restaurantNavGroups,
    menuLabelOverrides: {
      pos: "Table POS",
      billing: "Checks & invoices",
      receipts: "Payment slips",
      customers: "Guests",
    },
    theme: restaurantTheme,
    pageCopy: {
      posScreenTitle: "Table POS",
      billingScreenTitle: "Checks & invoices",
      receiptsScreenTitle: "Payment slips",
    },
  },
  distribution: {
    navGroupDefs: distributionNavGroups,
    menuLabelOverrides: { pos: "Van POS", billing: "Delivery billing", receipts: "Collection receipts" },
    theme: placeholderTheme("bg-background/76 dark:bg-background/81"),
    pageCopy: {
      posScreenTitle: "Van POS",
      billingScreenTitle: "Delivery billing",
      receiptsScreenTitle: "Collection receipts",
    },
  },
  fashion: {
    navGroupDefs: defaultNavGroups,
    menuLabelOverrides: { products: "Styles & SKUs" },
    theme: placeholderTheme("bg-background/75 dark:bg-background/80"),
    pageCopy: {
      posScreenTitle: "Boutique POS",
      billingScreenTitle: "Billing",
      receiptsScreenTitle: "Receipts",
    },
  },
  electronics: {
    navGroupDefs: defaultNavGroups,
    menuLabelOverrides: { products: "Devices & IMEI", inventory: "Serial stock" },
    theme: placeholderTheme("bg-background/75 dark:bg-background/80"),
    pageCopy: {
      posScreenTitle: "Store POS",
      billingScreenTitle: "Invoices",
      receiptsScreenTitle: "Warranty receipts",
    },
  },
  hardware: {
    navGroupDefs: defaultNavGroups,
    menuLabelOverrides: { products: "Materials & cuts" },
    theme: placeholderTheme("bg-background/75 dark:bg-background/80"),
    pageCopy: {
      posScreenTitle: "Trade counter",
      billingScreenTitle: "Billing",
      receiptsScreenTitle: "Receipts",
    },
  },
  service_repair: {
    navGroupDefs: serviceRepairNavGroups,
    menuLabelOverrides: { billing: "Job billing", receipts: "Job receipts" },
    theme: placeholderTheme("bg-background/75 dark:bg-background/80"),
    pageCopy: {
      posScreenTitle: "Service desk",
      billingScreenTitle: "Job billing",
      receiptsScreenTitle: "Job receipts",
    },
  },
  multi_branch: {
    navGroupDefs: defaultNavGroups,
    menuLabelOverrides: { branches: "Branches & stores" },
    theme: placeholderTheme("bg-background/75 dark:bg-background/80"),
    pageCopy: defaultPageCopy,
  },
}

const FALLBACK_ID: PortalExperienceId = "core_retail"

export interface ResolvePortalExperienceInput {
  readonly businessType: BusinessTypeId
  readonly pilotVertical: string | null | undefined
  /** When `/me` is resolved for a branch, branch vertical overrides tenant pilot for shell. */
  readonly branchBusinessTypeSlug?: string | null | undefined
}

/**
 * Pilot vertical wins for shell when valid; optional branch slug overrides tenant pilot.
 * Otherwise `core_retail` / `core_supermart` from core `businessType`.
 */
export const resolvePortalExperienceId = (input: ResolvePortalExperienceInput): PortalExperienceId => {
  const branch = input.branchBusinessTypeSlug?.trim()
  if (branch && isPilotVerticalSlug(branch)) return branch
  const pilot = input.pilotVertical?.trim()
  if (pilot && isPilotVerticalSlug(pilot)) return pilot
  return input.businessType === "supermart" ? "core_supermart" : "core_retail"
}

export const getPortalExperienceConfig = (experienceId: PortalExperienceId): PortalExperienceConfig =>
  CONFIGS[experienceId] ?? CONFIGS[FALLBACK_ID]!

export const getPortalTheme = (experienceId: PortalExperienceId): PortalThemeDTO => {
  const base = getPortalExperienceConfig(experienceId).theme
  if (experienceId === "core_retail" || experienceId === "core_supermart") return base
  const pack = getCapabilityPackById(experienceId)
  const fromPack = pack?.uiRules.dashboardAccent
  if (fromPack !== undefined) return { ...base, dashboardAccent: fromPack }
  return base
}

export const getPortalPageCopy = (experienceId: PortalExperienceId): PortalPageCopyDTO =>
  getPortalExperienceConfig(experienceId).pageCopy

export const getPortalNavGroupDefs = (experienceId: PortalExperienceId): readonly PortalNavGroupDef[] =>
  getPortalExperienceConfig(experienceId).navGroupDefs

export const applyNavPresentation = (
  experienceId: PortalExperienceId,
  menu: readonly NavItemDTO[],
): { menu: NavItemDTO[]; navGroups: readonly PortalNavGroupDef[] } => {
  const { menuLabelOverrides, navGroupDefs } = getPortalExperienceConfig(experienceId)
  const nextMenu = menu.map((m) => {
    const o = menuLabelOverrides[m.id]
    return o ? { ...m, label: o } : { ...m }
  })
  return { menu: nextMenu, navGroups: navGroupDefs }
}
