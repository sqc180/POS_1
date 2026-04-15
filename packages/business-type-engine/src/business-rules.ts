import type { BusinessTypeId } from "@repo/types"
import type { CapabilityPack } from "./capability-packs"
import { getCapabilityPackById } from "./capability-packs"
import type { PackGstProfileHint, PackInventoryMode, PackPosMode } from "./capability-packs"
import { isPilotVerticalSlug, mergeProductAugmentedCapabilities } from "./vertical-capabilities"
import { resolveEffectiveCapabilities } from "./vertical-capabilities"
import type { VerticalCapability } from "./vertical-capability-codes"
import { getProductBehaviorProfileDef } from "./product-behavior-registry"

/** Transaction kind for future workflow hooks (stub). */
export type BusinessTransactionKind =
  | "retail_sale"
  | "wholesale_sale"
  | "purchase_receipt"
  | "return"
  | "transfer"
  | "other"

/**
 * Full resolution context (Layers 1–2 + stub for Layer 4). Layer 3 uses `resolveProductBehavior`.
 * Core `businessType` remains retail/supermart (billing feature map); industry behavior comes from packs.
 */
export interface BusinessRulesContext {
  coreBusinessType: BusinessTypeId
  tenantPilotVertical: string | null | undefined
  tenantEnabledPackIds?: readonly string[] | null | undefined
  branchBusinessTypeSlug?: string | null | undefined
  branchEnabledPackIds?: readonly string[] | null | undefined
  /** Branch POS mode overlay when resolving a branch-scoped context. */
  branchPosMode?: PackPosMode | null | undefined
  transactionKind?: BusinessTransactionKind | null | undefined
}

/**
 * Inputs for resolving tenant-wide or branch-scoped business rules.
 * @deprecated Prefer `BusinessRulesContext`; kept for call-site compatibility.
 */
export type ResolveBusinessRulesInput = BusinessRulesContext

export interface BranchProfileInput {
  businessTypeSlug?: string | null | undefined
  enabledPackIds?: readonly string[] | null | undefined
  posMode?: PackPosMode | null | undefined
}

/** Product shape sufficient for rule projection (no Mongoose types). */
export interface ProductLikeForRules {
  batchTracking?: boolean
  serialTracking?: boolean
  saleUom?: string
  isLoose?: boolean
  /** Optional registry key; merged before `behaviorProfile.augmentFlags`. */
  behaviorProfileId?: string | null
  behaviorProfile?: { augmentFlags?: string[] }
}

/** Narrow view for services (capabilities + tracking hints). */
export interface ProductBehaviorView {
  mergedCapabilities: readonly VerticalCapability[]
  trackingMode: "none" | "batch" | "serial"
  /** True when product is configured for loose / non-piece UOM patterns. */
  usesGroceryStyleUnits: boolean
  /** Registry id applied for merge, or null when unset / unknown. */
  behaviorProfileIdResolved: string | null
}

/** UI + service hints derived from the active capability pack(s) — not a second source of truth for flags. */
export interface ResolvedBehaviorHints {
  defaultPosMode: PackPosMode
  defaultInventoryMode: PackInventoryMode
  gstProfileHint: PackGstProfileHint
  posShellRoute?: string | null
  dashboardAccent?: CapabilityPack["uiRules"]["dashboardAccent"]
}

export interface ResolvedBusinessRules {
  coreBusinessType: BusinessTypeId
  pilotVertical: string | null
  tenantEnabledPackIds: readonly string[]
  capabilities: readonly VerticalCapability[]
  hints: ResolvedBehaviorHints
}

const defaultHints = (): ResolvedBehaviorHints => ({
  defaultPosMode: "standard",
  defaultInventoryMode: "standard",
  gstProfileHint: "retail_default",
  posShellRoute: null,
  dashboardAccent: "neutral",
})

const pickPrimaryPack = (
  pilot: string | null | undefined,
  tenantPackIds: readonly string[],
): CapabilityPack | undefined => {
  if (pilot && isPilotVerticalSlug(pilot)) {
    const p = getCapabilityPackById(pilot)
    if (p) return p
  }
  for (const id of tenantPackIds) {
    const p = getCapabilityPackById(id)
    if (p) return p
  }
  return undefined
}

/**
 * Single entry point for capability + pack-derived hints.
 * Controllers and UI should prefer this over ad-hoc `businessType ===` checks for industry behavior.
 */
export const resolveBusinessRules = (input: BusinessRulesContext): ResolvedBusinessRules => {
  const pilot =
    input.tenantPilotVertical && String(input.tenantPilotVertical).trim() !== ""
      ? String(input.tenantPilotVertical).trim()
      : null
  const tenantPackIds = [...(input.tenantEnabledPackIds ?? [])].map((s) => String(s).trim()).filter(Boolean)
  const capabilities = resolveEffectiveCapabilities({
    tenantPilotVertical: pilot,
    tenantEnabledPackIds: tenantPackIds.length ? tenantPackIds : undefined,
    branchBusinessTypeSlug: input.branchBusinessTypeSlug,
    branchEnabledPackIds: input.branchEnabledPackIds,
  })
  const primary = pickPrimaryPack(pilot, tenantPackIds)
  const hints = defaultHints()
  if (primary) {
    hints.defaultPosMode = primary.defaultPosMode
    hints.defaultInventoryMode = primary.defaultInventoryMode
    hints.gstProfileHint = primary.defaultGstProfile
    hints.posShellRoute = primary.uiRules.posShellRoute ?? null
    hints.dashboardAccent = primary.uiRules.dashboardAccent ?? "neutral"
  }
  if (input.branchPosMode) {
    hints.defaultPosMode = input.branchPosMode
  }
  return {
    coreBusinessType: input.coreBusinessType,
    pilotVertical: pilot,
    tenantEnabledPackIds: tenantPackIds,
    capabilities,
    hints,
  }
}

type TenantRulesBase = Omit<BusinessRulesContext, "branchBusinessTypeSlug" | "branchEnabledPackIds" | "branchPosMode">

/**
 * Layer 2: merge branch profile onto tenant base without re-querying DB (callers pass branch fields).
 */
export const resolveBranchRules = (
  tenantPart: TenantRulesBase,
  branch: BranchProfileInput | null | undefined,
): ResolvedBusinessRules => {
  if (!branch) return resolveBusinessRules({ ...tenantPart })
  return resolveBusinessRules({
    ...tenantPart,
    branchBusinessTypeSlug: branch.businessTypeSlug ?? undefined,
    branchEnabledPackIds: branch.enabledPackIds ?? undefined,
    branchPosMode: branch.posMode ?? undefined,
  })
}

/**
 * Layer 3: project product flags + augment flags onto effective tenant/branch capabilities.
 */
export const resolveProductBehavior = (
  product: ProductLikeForRules,
  effectiveCapabilities: readonly string[] | null | undefined,
): ProductBehaviorView => {
  const profile = getProductBehaviorProfileDef(product.behaviorProfileId)
  const profileIdResolved = profile?.id ?? null
  const withProfile = mergeProductAugmentedCapabilities(
    effectiveCapabilities ?? [],
    profile?.defaultAugmentFlags ?? [],
  )
  const aug = product.behaviorProfile?.augmentFlags ?? []
  const merged = mergeProductAugmentedCapabilities(withProfile, aug)
  let trackingMode: ProductBehaviorView["trackingMode"] = "none"
  if (product.serialTracking) trackingMode = "serial"
  else if (product.batchTracking) trackingMode = "batch"
  const u = (product.saleUom ?? "").trim().toLowerCase()
  const trivial = new Set(["", "piece", "pcs", "each", "unit", "no"])
  const usesGroceryStyleUnits = product.isLoose === true || (u.length > 0 && !trivial.has(u))
  return { mergedCapabilities: merged, trackingMode, usesGroceryStyleUnits, behaviorProfileIdResolved: profileIdResolved }
}
