import { describe, expect, it } from "vitest"
import { exclusiveTaxPaise, rupeesToPaise, sumPaise } from "@repo/utils"

describe("money paise helpers", () => {
  it("rupeesToPaise rounds half up", () => {
    expect(rupeesToPaise(10)).toBe(1000)
    expect(rupeesToPaise(10.994)).toBe(1099)
    expect(rupeesToPaise(10.995)).toBe(1100)
  })

  it("exclusiveTaxPaise matches percent on integer taxable", () => {
    const taxable = rupeesToPaise(100)
    const nine = exclusiveTaxPaise(taxable, 9)
    expect(nine).toBe(900)
    expect(sumPaise([taxable, nine])).toBe(10900)
  })
})
