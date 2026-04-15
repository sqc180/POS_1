import type { FutureBusinessTypeSlug } from "./future-registry"
import { FUTURE_BUSINESS_TYPE_ROADMAP } from "./future-registry"
import { assertCapabilityPackRegistryComplete, getFlagsForPilotSlug, unionFlagsForPackIds } from "./capability-packs"
import { VerticalCapability } from "./vertical-capability-codes"

/** Slugs allowed for `Tenant.pilotVertical` (matches roadmap entries). */
export const PILOT_VERTICAL_SLUGS = FUTURE_BUSINESS_TYPE_ROADMAP.map((r) => r.id) as readonly FutureBusinessTypeSlug[]

export function isPilotVerticalSlug(raw: string | null | undefined): raw is FutureBusinessTypeSlug {
  if (!raw || typeof raw !== "string") return false
  const t = raw.trim()
  return (PILOT_VERTICAL_SLUGS as readonly string[]).includes(t)
}

export function resolveVerticalCapabilities(pilotVertical: string | null | undefined): readonly VerticalCapability[] {
  if (!pilotVertical || !isPilotVerticalSlug(pilotVertical)) return []
  return getFlagsForPilotSlug(pilotVertical)
}

export interface BranchCapabilityResolutionInput {
  tenantPilotVertical: string | null | undefined
  /** Tenant-level extra pack ids (unioned with pilot flags before branch overrides). */
  tenantEnabledPackIds?: readonly string[] | null | undefined
  /** When set to a valid pilot slug, replaces tenant pilot for this branch. */
  branchBusinessTypeSlug?: string | null | undefined
  /** Additional pack ids whose flags are unioned onto the branch base. */
  branchEnabledPackIds?: readonly string[] | null | undefined
}

/**
 * Effective capabilities: tenant pilot + optional tenant pack ids, then optional branch slug override,
 * then optional branch extra pack ids (all unions; invalid pack ids ignored).
 */
export function resolveEffectiveCapabilities(input: BranchCapabilityResolutionInput): readonly VerticalCapability[] {
  const slug = input.branchBusinessTypeSlug
  let base: VerticalCapability[] =
    slug && isPilotVerticalSlug(slug) ? [...getFlagsForPilotSlug(slug)] : [...resolveVerticalCapabilities(input.tenantPilotVertical)]
  const tenantPackIds = input.tenantEnabledPackIds?.filter((s) => typeof s === "string" && s.trim()) ?? []
  const branchPackIds = input.branchEnabledPackIds?.filter((s) => typeof s === "string" && s.trim()) ?? []
  const packIds = [...new Set([...tenantPackIds, ...branchPackIds])]
  if (packIds.length === 0) return base
  const extra = unionFlagsForPackIds(packIds)
  return [...new Set<VerticalCapability>([...base, ...extra])]
}

const verticalCapabilityValues = new Set<string>(Object.values(VerticalCapability) as string[])

/**
 * Merges product-level augment flags onto tenant/branch effective capabilities.
 * Unknown strings are ignored. Order: base first, then augments (additive only).
 */
export function mergeProductAugmentedCapabilities(
  effectiveCaps: readonly string[] | null | undefined,
  augmentFlags: readonly string[] | null | undefined,
): VerticalCapability[] {
  const out = new Set<string>()
  for (const c of effectiveCaps ?? []) {
    if (verticalCapabilityValues.has(c)) out.add(c)
  }
  for (const c of augmentFlags ?? []) {
    if (typeof c === "string" && verticalCapabilityValues.has(c)) out.add(c)
  }
  return [...out] as VerticalCapability[]
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

/** Dev-only invariant: every roadmap row has a capability pack (may enable zero flags). */
export function assertPilotCapabilityMapComplete(): void {
  assertCapabilityPackRegistryComplete()
  for (const row of FUTURE_BUSINESS_TYPE_ROADMAP) {
    getFlagsForPilotSlug(row.id)
  }
}
