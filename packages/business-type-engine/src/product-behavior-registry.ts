import { VerticalCapability } from "./vertical-capability-codes"

/**
 * Optional product-level behavior profile (additive with `behaviorProfile.augmentFlags`).
 * Merge order: effective tenant/branch caps → profile defaults → product augmentFlags.
 */
export const PRODUCT_BEHAVIOR_PROFILE_IDS = ["standard_retail", "pharmacy_batches"] as const

export type ProductBehaviorProfileId = (typeof PRODUCT_BEHAVIOR_PROFILE_IDS)[number]

export interface ProductBehaviorProfileDef {
  readonly id: ProductBehaviorProfileId
  /** Capability augments applied when this profile is selected (before product-specific augments). */
  readonly defaultAugmentFlags: readonly VerticalCapability[]
}

export const PRODUCT_BEHAVIOR_PROFILES = {
  standard_retail: {
    id: "standard_retail",
    defaultAugmentFlags: [],
  },
  pharmacy_batches: {
    id: "pharmacy_batches",
    defaultAugmentFlags: [VerticalCapability.batchExpiry],
  },
} as const satisfies Record<ProductBehaviorProfileId, ProductBehaviorProfileDef>

export const isProductBehaviorProfileId = (raw: string | null | undefined): raw is ProductBehaviorProfileId => {
  if (!raw || typeof raw !== "string") return false
  return (PRODUCT_BEHAVIOR_PROFILE_IDS as readonly string[]).includes(raw.trim())
}

export const getProductBehaviorProfileDef = (
  id: string | null | undefined,
): ProductBehaviorProfileDef | null => {
  if (!isProductBehaviorProfileId(id)) return null
  return PRODUCT_BEHAVIOR_PROFILES[id]
}
