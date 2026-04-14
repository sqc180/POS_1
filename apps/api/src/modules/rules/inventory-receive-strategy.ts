import { hasVerticalCapability, VerticalCapability } from "@repo/business-type-engine"
import type { InventoryReceiveStrategyKey } from "./strategy-types.js"

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

export const inventoryReceiveStrategyRequiresExpiryDate = (key: InventoryReceiveStrategyKey): boolean =>
  key === "require_expiry_on_receive"
