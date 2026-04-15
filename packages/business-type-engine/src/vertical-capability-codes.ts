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
