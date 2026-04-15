/**
 * Thin re-export so API code can import a single "registry" module without duplicating pack arrays.
 */
export {
  buildProductFieldHintsFromCaps,
  CAPABILITY_PACKS,
  assertCapabilityPackRegistryComplete,
  getCapabilityPackById,
  getProductBehaviorProfileDef,
  getProductFieldVisibility,
  isProductBehaviorProfileId,
  listCapabilityPacks,
  PRODUCT_BEHAVIOR_PROFILE_IDS,
  PRODUCT_BEHAVIOR_PROFILES,
  ProductFormFields,
  resolveBranchRules,
  resolveBusinessRules,
  resolveProductBehavior,
  validateProductFieldsAgainstTenantCaps,
} from "@repo/business-type-engine"

export type {
  BranchProfileInput,
  BusinessRulesContext,
  ProductBehaviorProfileDef,
  ProductBehaviorProfileId,
  ProductBehaviorView,
  ProductFieldHintRow,
  ProductLikeForRules,
  ResolvedBusinessRules,
} from "@repo/business-type-engine"
