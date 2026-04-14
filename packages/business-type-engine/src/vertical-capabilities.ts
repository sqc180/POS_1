import type { FutureBusinessTypeSlug } from "./future-registry"
import { FUTURE_BUSINESS_TYPE_ROADMAP } from "./future-registry"

/**
 * Cross-vertical capability flags. Tenants with no pilot vertical get an empty set.
 * Vertical-specific UIs and validators gate on these strings — not on raw pilot slug alone.
 */
export const VerticalCapability = {
  batchExpiry: "batch_expiry",
  rxScheduleH: "rx_schedule_h",
  coldChainHints: "cold_chain_hints",
  weightBreakBulk: "weight_break_bulk",
  bulkPricingTiers: "bulk_pricing_tiers",
  creditPolicyStrict: "credit_policy_strict",
  kitchenCourseModifiers: "kitchen_course_modifiers",
  vanRouteSecondaryBilling: "van_route_secondary_billing",
  styleMatrix: "style_matrix",
  imeiWarranty: "imei_warranty",
  bomLight: "bom_light",
  jobCardLabourParts: "job_card_labour_parts",
  interStoreTransfer: "inter_store_transfer",
  consolidatedReporting: "consolidated_reporting",
} as const

export type VerticalCapability = (typeof VerticalCapability)[keyof typeof VerticalCapability]

const CAPS_BY_PILOT: Record<FutureBusinessTypeSlug, readonly VerticalCapability[]> = {
  pharmacy: [VerticalCapability.batchExpiry, VerticalCapability.rxScheduleH],
  medical_store: [
    VerticalCapability.batchExpiry,
    VerticalCapability.rxScheduleH,
    VerticalCapability.coldChainHints,
  ],
  grocery: [VerticalCapability.weightBreakBulk],
  wholesale: [VerticalCapability.bulkPricingTiers, VerticalCapability.creditPolicyStrict],
  restaurant: [VerticalCapability.kitchenCourseModifiers],
  distribution: [
    VerticalCapability.vanRouteSecondaryBilling,
    VerticalCapability.interStoreTransfer,
    VerticalCapability.creditPolicyStrict,
  ],
  fashion: [VerticalCapability.styleMatrix],
  electronics: [VerticalCapability.imeiWarranty],
  hardware: [VerticalCapability.bomLight],
  service_repair: [VerticalCapability.jobCardLabourParts],
  multi_branch: [VerticalCapability.interStoreTransfer, VerticalCapability.consolidatedReporting],
}

/** Slugs allowed for `Tenant.pilotVertical` (matches roadmap entries). */
export const PILOT_VERTICAL_SLUGS = FUTURE_BUSINESS_TYPE_ROADMAP.map((r) => r.id) as readonly FutureBusinessTypeSlug[]

export function isPilotVerticalSlug(raw: string | null | undefined): raw is FutureBusinessTypeSlug {
  if (!raw || typeof raw !== "string") return false
  const t = raw.trim()
  return (PILOT_VERTICAL_SLUGS as readonly string[]).includes(t)
}

export function resolveVerticalCapabilities(pilotVertical: string | null | undefined): readonly VerticalCapability[] {
  if (!pilotVertical || !isPilotVerticalSlug(pilotVertical)) return []
  return [...(CAPS_BY_PILOT[pilotVertical] ?? [])]
}

export function hasVerticalCapability(
  capabilities: readonly string[] | null | undefined,
  capability: VerticalCapability,
): boolean {
  if (!capabilities?.length) return false
  return capabilities.includes(capability)
}

/** Credit behaviour at invoice completion (non-breaking defaults). */
export type CreditPolicyAtComplete = "none" | "audit_over_limit"

export interface CreditPolicyHint {
  atComplete: CreditPolicyAtComplete
}

/**
 * When wholesale-style capabilities are on, log receivable vs credit limit on complete (audit-only).
 * Blocking invoices is a later opt-in to avoid breaking existing tenants.
 */
export function getCreditPolicyForCapabilities(capabilities: readonly string[] | null | undefined): CreditPolicyHint {
  if (
    hasVerticalCapability(capabilities, VerticalCapability.bulkPricingTiers) ||
    hasVerticalCapability(capabilities, VerticalCapability.creditPolicyStrict)
  ) {
    return { atComplete: "audit_over_limit" }
  }
  return { atComplete: "none" }
}

/** Dev-only invariant: every roadmap row has a capability entry (may be empty). */
export function assertPilotCapabilityMapComplete(): void {
  for (const row of FUTURE_BUSINESS_TYPE_ROADMAP) {
    if (!(row.id in CAPS_BY_PILOT)) {
      throw new Error(`Missing capability map for pilot vertical: ${row.id}`)
    }
  }
}
