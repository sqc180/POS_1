import { describe, expect, it } from "vitest"
import { VerticalCapability } from "@repo/business-type-engine"
import {
  inventoryReceiveStrategyRequiresExpiryDate,
  selectInventoryReceiveStrategy,
} from "../../src/modules/rules/inventory-receive-strategy.js"

describe("selectInventoryReceiveStrategy", () => {
  it("selects require_expiry when batch_expiry capability is present", () => {
    const key = selectInventoryReceiveStrategy([VerticalCapability.batchExpiry])
    expect(key).toBe("require_expiry_on_receive")
    expect(inventoryReceiveStrategyRequiresExpiryDate(key)).toBe(true)
  })

  it("selects standard when batch_expiry is absent", () => {
    const key = selectInventoryReceiveStrategy([VerticalCapability.weightBreakBulk])
    expect(key).toBe("standard_receive")
    expect(inventoryReceiveStrategyRequiresExpiryDate(key)).toBe(false)
  })

  it("selects standard for empty caps", () => {
    const key = selectInventoryReceiveStrategy([])
    expect(key).toBe("standard_receive")
  })
})
