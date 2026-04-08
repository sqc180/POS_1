import type { BusinessTypeId } from "@repo/types"

/**
 * Planned business verticals — not yet selectable in onboarding.
 * Core ERP modules stay stable; new types extend feature maps and validators when enabled.
 */
export const FUTURE_BUSINESS_TYPE_ROADMAP = [
  { id: "pharmacy", label: "Pharmacy", modules: "Batch, expiry, schedule H readiness" },
  { id: "medical_store", label: "Medical store", modules: "Prescription placeholders, cold chain hints" },
  { id: "grocery", label: "Grocery", modules: "Weight/break bulk, loose SKU patterns" },
  { id: "wholesale", label: "Wholesale", modules: "Credit limits, bulk pricing tiers" },
  { id: "restaurant", label: "Restaurant", modules: "Kitchen / course / modifier model" },
  { id: "distribution", label: "Distribution", modules: "Van sales, route, secondary billing" },
  { id: "fashion", label: "Fashion / apparel", modules: "Size/color matrix, style variants" },
  { id: "electronics", label: "Electronics", modules: "IMEI/serial, warranty register" },
  { id: "hardware", label: "Hardware", modules: "Length/cut stock, BOM light" },
  { id: "service_repair", label: "Service / repair", modules: "Job cards, labour + parts split" },
  { id: "multi_branch", label: "Multi-branch mixed", modules: "Inter-store transfer, consolidated reporting" },
] as const

export type FutureBusinessTypeSlug = (typeof FUTURE_BUSINESS_TYPE_ROADMAP)[number]["id"]

/**
 * Safe resolver when reading legacy or pilot tenant flags — unknown types fall back to retail engine profile.
 */
export const resolveActiveBusinessType = (raw: string): BusinessTypeId => {
  if (raw === "retail" || raw === "supermart") return raw
  return "retail"
}
