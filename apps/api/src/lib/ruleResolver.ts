import mongoose from "mongoose"
import {
  resolveActiveBusinessType,
  resolveBranchRules,
  resolveBusinessRules,
  type BranchProfileInput,
  type PackPosMode,
  type ResolvedBusinessRules,
} from "@repo/business-type-engine"
import type { BusinessTypeId } from "@repo/types"
import { BranchModel } from "../models/branch.model.js"
import { TenantModel } from "../models/tenant.model.js"

/** Minimal tenant fields for rule resolution (matches lean query). */
export interface TenantRulesLean {
  businessType?: string
  pilotVertical?: string | null
  enabledPackIds?: string[]
}

/** Minimal branch fields for rule resolution. */
export interface BranchRulesLean {
  businessTypeSlug?: string
  enabledPackIds?: string[]
  posMode?: PackPosMode | string
}

const tenantBase = (tenant: TenantRulesLean) => ({
  coreBusinessType: resolveActiveBusinessType(String(tenant.businessType ?? "retail")) as BusinessTypeId,
  tenantPilotVertical: tenant.pilotVertical,
  tenantEnabledPackIds: (tenant.enabledPackIds ?? []).filter(Boolean),
})

/**
 * Pure: build tenant-only resolved rules from an already-loaded tenant row (no DB).
 */
export const resolveRulesForTenantDoc = (tenant: TenantRulesLean): ResolvedBusinessRules =>
  resolveBusinessRules(tenantBase(tenant))

/**
 * Pure: merge optional branch profile onto tenant row (no DB).
 */
export const resolveRulesForTenantAndBranchDoc = (
  tenant: TenantRulesLean,
  branch: BranchRulesLean | null | undefined,
): ResolvedBusinessRules => {
  const base = tenantBase(tenant)
  if (!branch) return resolveBusinessRules(base)
  const branchInput: BranchProfileInput = {
    businessTypeSlug: branch.businessTypeSlug,
    enabledPackIds: branch.enabledPackIds,
    posMode: (branch.posMode as PackPosMode | undefined) ?? undefined,
  }
  return resolveBranchRules(base, branchInput)
}

/**
 * Single import path for async resolution: tenant + optional branch by code.
 */
export const loadResolvedRulesWithOptionalBranch = async (
  tenantId: string,
  branchCode?: string | null,
): Promise<ResolvedBusinessRules> => {
  const oid = new mongoose.Types.ObjectId(tenantId)
  const tenant = await TenantModel.findById(oid).lean()
  if (!tenant) {
    const err = new Error("Tenant not found")
    ;(err as Error & { statusCode?: number }).statusCode = 404
    throw err
  }
  const t = tenant as TenantRulesLean
  const code = branchCode?.trim()
  if (!code) return resolveRulesForTenantDoc(t)
  const br = await BranchModel.findOne({ tenantId: oid, code: code.toLowerCase() }).lean()
  if (!br) return resolveRulesForTenantDoc(t)
  return resolveRulesForTenantAndBranchDoc(t, {
    businessTypeSlug: String((br as BranchRulesLean).businessTypeSlug ?? "").trim() || undefined,
    enabledPackIds: ((br as BranchRulesLean).enabledPackIds ?? []).filter(Boolean),
    posMode: (br as BranchRulesLean).posMode as PackPosMode | undefined,
  })
}

export const loadResolvedTenantRules = async (tenantId: string): Promise<ResolvedBusinessRules> =>
  loadResolvedRulesWithOptionalBranch(tenantId, null)
