/**
 * Integer paise (1/100 INR) for APIs and GST math — parallel to legacy decimal-rupee fields until full migration.
 * All amounts here are whole paise; use `rupeesToPaise` / `paiseToRupeesNumber` at boundaries only.
 */
export type Paise = number & { readonly __brand: "Paise" }

const assertSafeInt = (n: number, label: string): void => {
  if (!Number.isFinite(n) || !Number.isInteger(n) || !Number.isSafeInteger(n)) {
    throw new Error(`${label}: expected safe integer`)
  }
}

/** Convert a decimal rupee amount to integer paise (half-up). */
export const rupeesToPaise = (rupees: number): Paise => {
  if (!Number.isFinite(rupees)) throw new Error("rupeesToPaise: invalid number")
  const n = Math.round(rupees * 100)
  assertSafeInt(n, "rupeesToPaise")
  return n as Paise
}

export const paiseToRupeesNumber = (paise: Paise): number => paise / 100

export const sumPaise = (values: readonly Paise[]): Paise => {
  let t = 0
  for (const v of values) t += v
  assertSafeInt(t, "sumPaise")
  return t as Paise
}

/** Exclusive GST: tax = round half away from zero of (taxablePaise * ratePercent / 100). */
export const exclusiveTaxPaise = (taxablePaise: Paise, ratePercent: number): Paise => {
  assertSafeInt(taxablePaise, "exclusiveTaxPaise.taxable")
  if (!Number.isFinite(ratePercent)) throw new Error("exclusiveTaxPaise: invalid rate")
  const raw = (taxablePaise * ratePercent) / 100
  const n = Math.round(raw)
  assertSafeInt(n, "exclusiveTaxPaise.result")
  return n as Paise
}

/** Line total in paise for exclusive tax: taxable + tax components (caller supplies split rates). */
export const lineTotalExclusivePaise = (taxablePaise: Paise, taxPaiseParts: readonly Paise[]): Paise =>
  sumPaise([taxablePaise, ...taxPaiseParts])
