import type { FutureBusinessTypeSlug } from "./future-registry"
import { FUTURE_BUSINESS_TYPE_ROADMAP } from "./future-registry"
import type { VerticalCapability } from "./vertical-capability-codes"

/** POS / counter mode hint for UI shells (not enforced server-side yet). */
export type PackPosMode = "standard" | "high_volume" | "table_service" | "field"

/** Inventory engine mode hint for validators and UI. */
export type PackInventoryMode = "standard" | "batch_serial" | "weight_loose" | "van_location"

/** GST profile hint — aligns with existing getTaxBehavior keys until full GST pack profiles exist. */
export type PackGstProfileHint = "retail_default" | "b2b_forward" | "composition_ready"

export interface CapabilityPack {
  /** Same as roadmap slug for now (1:1 pilot pack). */
  id: FutureBusinessTypeSlug
  name: string
  /** Roadmap slug this pack maps from (identity for v1). */
  businessModes: readonly FutureBusinessTypeSlug[]
  defaultPosMode: PackPosMode
  defaultInventoryMode: PackInventoryMode
  defaultGstProfile: PackGstProfileHint
  /** Cross-vertical capability flags enabled when this pack is active. */
  enabledFlags: readonly VerticalCapability[]
  /** Domain modules this pack expects (documentation / future enforcement). */
  requiredModules: readonly string[]
  /** UI route keys for pack-specific shells (under /pos or /desk). */
  uiRules: {
    posShellRoute?: string
    dashboardAccent?: "pharmacy" | "grocery" | "wholesale" | "restaurant" | "neutral"
  }
}

const pack = (p: CapabilityPack): CapabilityPack => p

/**
 * Canonical capability packs — one per future roadmap vertical.
 * `enabledFlags` must match legacy `CAPS_BY_PILOT` for identical `resolveVerticalCapabilities` output.
 */
export const CAPABILITY_PACKS: readonly CapabilityPack[] = [
  pack({
    id: "pharmacy",
    name: "Pharmacy",
    businessModes: ["pharmacy"],
    defaultPosMode: "standard",
    defaultInventoryMode: "batch_serial",
    defaultGstProfile: "retail_default",
    enabledFlags: ["batch_expiry", "rx_schedule_h"] as const satisfies readonly VerticalCapability[],
    requiredModules: ["catalog", "inventory", "billing", "gst"],
    uiRules: { posShellRoute: "/pos/pharmacy", dashboardAccent: "pharmacy" },
  }),
  pack({
    id: "medical_store",
    name: "Medical store",
    businessModes: ["medical_store"],
    defaultPosMode: "high_volume",
    defaultInventoryMode: "batch_serial",
    defaultGstProfile: "retail_default",
    enabledFlags: ["batch_expiry", "rx_schedule_h", "cold_chain_hints"] as const satisfies readonly VerticalCapability[],
    requiredModules: ["catalog", "inventory", "billing"],
    uiRules: { posShellRoute: "/pos/medical", dashboardAccent: "pharmacy" },
  }),
  pack({
    id: "grocery",
    name: "Grocery / kirana",
    businessModes: ["grocery"],
    defaultPosMode: "high_volume",
    defaultInventoryMode: "weight_loose",
    defaultGstProfile: "retail_default",
    enabledFlags: ["weight_break_bulk"] as const satisfies readonly VerticalCapability[],
    requiredModules: ["catalog", "inventory", "billing"],
    uiRules: { posShellRoute: "/pos/grocery", dashboardAccent: "grocery" },
  }),
  pack({
    id: "wholesale",
    name: "Wholesale",
    businessModes: ["wholesale"],
    defaultPosMode: "standard",
    defaultInventoryMode: "standard",
    defaultGstProfile: "b2b_forward",
    enabledFlags: ["bulk_pricing_tiers", "credit_policy_strict"] as const satisfies readonly VerticalCapability[],
    requiredModules: ["catalog", "billing", "ledger"],
    uiRules: { posShellRoute: "/pos/wholesale", dashboardAccent: "wholesale" },
  }),
  pack({
    id: "restaurant",
    name: "Restaurant / QSR",
    businessModes: ["restaurant"],
    defaultPosMode: "table_service",
    defaultInventoryMode: "standard",
    defaultGstProfile: "retail_default",
    enabledFlags: ["kitchen_course_modifiers"] as const satisfies readonly VerticalCapability[],
    requiredModules: ["catalog", "billing", "inventory"],
    uiRules: { posShellRoute: "/pos/restaurant", dashboardAccent: "restaurant" },
  }),
  pack({
    id: "distribution",
    name: "Distribution / van sales",
    businessModes: ["distribution"],
    defaultPosMode: "field",
    defaultInventoryMode: "van_location",
    defaultGstProfile: "b2b_forward",
    enabledFlags: [
      "van_route_secondary_billing",
      "inter_store_transfer",
      "credit_policy_strict",
    ] as const satisfies readonly VerticalCapability[],
    requiredModules: ["catalog", "inventory", "billing"],
    uiRules: { posShellRoute: "/pos/van", dashboardAccent: "wholesale" },
  }),
  pack({
    id: "fashion",
    name: "Fashion / apparel",
    businessModes: ["fashion"],
    defaultPosMode: "high_volume",
    defaultInventoryMode: "standard",
    defaultGstProfile: "retail_default",
    enabledFlags: ["style_matrix"] as const satisfies readonly VerticalCapability[],
    requiredModules: ["catalog", "inventory", "billing"],
    uiRules: { posShellRoute: "/pos/fashion", dashboardAccent: "neutral" },
  }),
  pack({
    id: "electronics",
    name: "Electronics / mobile",
    businessModes: ["electronics"],
    defaultPosMode: "standard",
    defaultInventoryMode: "batch_serial",
    defaultGstProfile: "retail_default",
    enabledFlags: ["imei_warranty"] as const satisfies readonly VerticalCapability[],
    requiredModules: ["catalog", "inventory", "billing"],
    uiRules: { posShellRoute: "/pos/electronics", dashboardAccent: "neutral" },
  }),
  pack({
    id: "hardware",
    name: "Hardware / building materials",
    businessModes: ["hardware"],
    defaultPosMode: "standard",
    defaultInventoryMode: "standard",
    defaultGstProfile: "retail_default",
    enabledFlags: ["bom_light"] as const satisfies readonly VerticalCapability[],
    requiredModules: ["catalog", "inventory", "billing"],
    uiRules: { posShellRoute: "/pos/hardware", dashboardAccent: "neutral" },
  }),
  pack({
    id: "service_repair",
    name: "Service / repair",
    businessModes: ["service_repair"],
    defaultPosMode: "standard",
    defaultInventoryMode: "standard",
    defaultGstProfile: "retail_default",
    enabledFlags: ["job_card_labour_parts"] as const satisfies readonly VerticalCapability[],
    requiredModules: ["catalog", "inventory", "billing"],
    uiRules: { posShellRoute: "/pos/job-card", dashboardAccent: "neutral" },
  }),
  pack({
    id: "multi_branch",
    name: "Multi-branch mixed",
    businessModes: ["multi_branch"],
    defaultPosMode: "standard",
    defaultInventoryMode: "standard",
    defaultGstProfile: "retail_default",
    enabledFlags: ["inter_store_transfer", "consolidated_reporting"] as const satisfies readonly VerticalCapability[],
    requiredModules: ["branches", "inventory", "reports"],
    uiRules: { dashboardAccent: "neutral" },
  }),
] as const

export type CapabilityPackId = (typeof CAPABILITY_PACKS)[number]["id"]

const byId: ReadonlyMap<string, CapabilityPack> = new Map(CAPABILITY_PACKS.map((p) => [p.id, p]))

export const getCapabilityPackById = (id: string): CapabilityPack | undefined => byId.get(id)

/** Flags from a single pilot / pack slug (tenant or branch primary mode). */
export const getFlagsForPilotSlug = (slug: FutureBusinessTypeSlug): readonly VerticalCapability[] => {
  const p = byId.get(slug)
  return p ? [...p.enabledFlags] : []
}

export const listCapabilityPacks = (): readonly CapabilityPack[] => [...CAPABILITY_PACKS]

/** Union of flags from multiple pack ids (invalid ids skipped). */
export const unionFlagsForPackIds = (ids: readonly string[]): VerticalCapability[] => {
  const out = new Set<VerticalCapability>()
  for (const id of ids) {
    const p = byId.get(id)
    if (!p) continue
    for (const f of p.enabledFlags) out.add(f)
  }
  return [...out]
}

/** Every roadmap row must have a pack with the same id. */
export const assertCapabilityPackRegistryComplete = (): void => {
  for (const row of FUTURE_BUSINESS_TYPE_ROADMAP) {
    if (!byId.has(row.id)) {
      throw new Error(`Missing capability pack for roadmap slug: ${row.id}`)
    }
  }
}
