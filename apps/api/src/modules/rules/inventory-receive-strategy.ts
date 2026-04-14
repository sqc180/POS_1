import { hasVerticalCapability, VerticalCapability } from "@repo/business-type-engine"
import type { InventoryReceiveStrategyContext, InventoryReceiveStrategyKey } from "./strategy-types.js"

/**
 * Pure selection: when batch/expiry capability is active on merged product caps, receive must collect expiry.
 */
export const selectInventoryReceiveStrategy = (
  mergedProductCapabilities: readonly string[],
): InventoryReceiveStrategyKey => {
  if (hasVerticalCapability(mergedProductCapabilities, VerticalCapability.batchExpiry)) {
    return "require_expiry_on_receive"
  }
  return "standard_receive"
}

/**
 * Plan-shaped entry point: branch rules + merged product behavior (today strategy uses merged caps only).
 */
export const selectInventoryReceiveStrategyFromContext = (
  ctx: InventoryReceiveStrategyContext,
): InventoryReceiveStrategyKey => {
  void ctx.resolvedTenantOrBranchRules
  return selectInventoryReceiveStrategy(ctx.productBehavior.mergedCapabilities)
}

export const inventoryReceiveStrategyRequiresExpiryDate = (key: InventoryReceiveStrategyKey): boolean =>
  key === "require_expiry_on_receive"
