export const minorFromDecimal = (amount: string | number, fractionDigits = 2): bigint => {
  const s = typeof amount === "number" ? amount.toFixed(fractionDigits) : amount.trim()
  const neg = s.startsWith("-")
  const clean = neg ? s.slice(1) : s
  const [whole, frac = ""] = clean.split(".")
  const f = (frac + "00").slice(0, fractionDigits).padEnd(fractionDigits, "0")
  const w = BigInt(whole || "0")
  const base = 10n ** BigInt(fractionDigits)
  const minor = w * base + BigInt(f || "0")
  return neg ? -minor : minor
}

export const decimalFromMinor = (minor: bigint, fractionDigits = 2): string => {
  const neg = minor < 0n
  const abs = neg ? -minor : minor
  const base = 10n ** BigInt(fractionDigits)
  const whole = abs / base
  const frac = abs % base
  const fracStr = frac.toString().padStart(fractionDigits, "0")
  return `${neg ? "-" : ""}${whole.toString()}.${fracStr}`
}

export const formatInrFromMinor = (minor: bigint): string => {
  const dec = decimalFromMinor(minor, 2)
  const [w, f] = dec.split(".")
  const withCommas = w.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `₹${withCommas}.${f}`
}

export interface ApiErrorShape {
  success: false
  error: { code: string; message: string }
}

export const apiError = (code: string, message: string): ApiErrorShape => ({
  success: false,
  error: { code, message },
})

export const tenantScope = (tenantId: string): { tenantId: string } => ({ tenantId })

export const generateDocumentNumberStub = (prefix: string, seq: number): string =>
  `${prefix}-${new Date().getFullYear()}-${String(seq).padStart(6, "0")}`

export * from "./gst.js"

export {
  exclusiveTaxPaise,
  lineTotalExclusivePaise,
  paiseToRupeesNumber,
  rupeesToPaise,
  sumPaise,
} from "./money-paise.js"

export type { Paise } from "./money-paise.js"

export const idempotencyKey = (parts: string[]): string => parts.join(":")
