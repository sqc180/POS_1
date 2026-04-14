/**
 * Client-side re-exports for business rules resolution.
 * Prefer importing from `@repo/business-type-engine` in new code; this module is a stable app entry path.
 */
export {
  resolveBranchRules,
  resolveBusinessRules,
  resolveProductBehavior,
} from "@repo/business-type-engine"
export type {
  BusinessRulesContext,
  ResolveBusinessRulesInput,
  ResolvedBehaviorHints,
  ResolvedBusinessRules,
} from "@repo/business-type-engine"
