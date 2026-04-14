import type { ProductBehaviorView, ResolvedBusinessRules } from "@repo/business-type-engine"

/** How stock-batch receive validates optional vs required batch metadata. */
export type InventoryReceiveStrategyKey = "require_expiry_on_receive" | "standard_receive"

/** Stub keys for future billing strategy wiring (Phase E facade). */
export type BillingStrategyKey = "standard_retail_complete"

export interface BillingConfirmContextStub {
  readonly tenantId: string
  readonly invoiceId: string
  readonly branchCode: string
}

/** Inputs sufficient to pick an inventory receive strategy (pure selection). */
export interface InventoryReceiveStrategyContext {
  readonly resolvedTenantOrBranchRules: Pick<ResolvedBusinessRules, "capabilities">
  readonly productBehavior: Pick<ProductBehaviorView, "mergedCapabilities">
}
