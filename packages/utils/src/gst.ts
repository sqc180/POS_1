/** GST line math — amounts in major currency units (e.g. INR), rates in percent. Intra-state: CGST+SGST. */

export interface GstSlabRates {
  cgstRate: number
  sgstRate: number
  igstRate: number
}

export interface LineTaxResult {
  taxableValue: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  lineTotal: number
}

const round2 = (n: number): number => Math.round(n * 100) / 100

export const computeLineTax = (
  qty: number,
  unitPrice: number,
  slab: GstSlabRates,
  taxMode: "inclusive" | "exclusive",
  useIgst = false,
): LineTaxResult => {
  const combined = useIgst ? slab.igstRate : slab.cgstRate + slab.sgstRate
  if (taxMode === "exclusive") {
    const taxableValue = round2(qty * unitPrice)
    if (useIgst) {
      const igstAmount = round2((taxableValue * slab.igstRate) / 100)
      return {
        taxableValue,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount,
        lineTotal: round2(taxableValue + igstAmount),
      }
    }
    const cgstAmount = round2((taxableValue * slab.cgstRate) / 100)
    const sgstAmount = round2((taxableValue * slab.sgstRate) / 100)
    return {
      taxableValue,
      cgstAmount,
      sgstAmount,
      igstAmount: 0,
      lineTotal: round2(taxableValue + cgstAmount + sgstAmount),
    }
  }
  const gross = round2(qty * unitPrice)
  const divisor = 1 + combined / 100
  const taxableValue = round2(gross / divisor)
  if (useIgst) {
    const igstAmount = round2(gross - taxableValue)
    return { taxableValue, cgstAmount: 0, sgstAmount: 0, igstAmount, lineTotal: gross }
  }
  const ratio = combined > 0 ? slab.cgstRate / combined : 0
  const totalTax = round2(gross - taxableValue)
  const cgstAmount = round2(totalTax * ratio)
  const sgstAmount = round2(totalTax - cgstAmount)
  return { taxableValue, cgstAmount, sgstAmount, igstAmount: 0, lineTotal: gross }
}

export const sumMoney = (values: number[]): number => round2(values.reduce((a, b) => a + b, 0))
