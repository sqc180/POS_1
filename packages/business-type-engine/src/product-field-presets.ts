import { VerticalCapability } from "./vertical-capability-codes"
import { hasVerticalCapability, mergeProductAugmentedCapabilities } from "./vertical-capabilities"

/** Keys the products UI and API validate together (expand in Phase F). */
export const ProductFormFields = {
  saleUom: "saleUom",
  isLoose: "isLoose",
  batchTracking: "batchTracking",
  serialTracking: "serialTracking",
  behaviorAugmentFlags: "behaviorAugmentFlags",
} as const

export type ProductFormFieldKey = (typeof ProductFormFields)[keyof typeof ProductFormFields]

export type ProductFieldSection = "catalog" | "stock_entry"

export interface ProductFieldHintRow {
  key: ProductFormFieldKey
  visible: boolean
  section: ProductFieldSection
}

const trivialSaleUoms = new Set(["", "piece", "pcs", "each", "unit", "no"])

/** True when `saleUom` is set to a non-catalog default (grocery-style UOM). */
export const isSaleUomGroceryStyle = (saleUom: string | null | undefined): boolean => {
  const u = (saleUom ?? "").trim().toLowerCase()
  return u.length > 0 && !trivialSaleUoms.has(u)
}

type FieldRule = {
  requiresAll: readonly VerticalCapability[]
  section: ProductFieldSection
}

const FIELD_RULES: Record<ProductFormFieldKey, FieldRule> = {
  saleUom: { requiresAll: [VerticalCapability.weightBreakBulk], section: "catalog" },
  isLoose: { requiresAll: [VerticalCapability.weightBreakBulk], section: "catalog" },
  batchTracking: { requiresAll: [], section: "stock_entry" },
  serialTracking: { requiresAll: [], section: "catalog" },
  behaviorAugmentFlags: { requiresAll: [], section: "catalog" },
}

/**
 * Declarative visibility rows for tenant-scoped product forms (capabilities only; no raw industry checks).
 */
export const buildProductFieldHintsFromCaps = (capabilities: readonly string[]): ProductFieldHintRow[] =>
  (Object.keys(FIELD_RULES) as ProductFormFieldKey[]).map((key: ProductFormFieldKey) => {
    const rule = FIELD_RULES[key]
    const visible =
      rule.requiresAll.length === 0 || rule.requiresAll.every((c) => hasVerticalCapability(capabilities, c))
    return { key, visible, section: rule.section }
  })

export const getProductFieldVisibility = (
  capabilities: readonly string[] | null | undefined,
  field: ProductFormFieldKey,
): boolean => {
  const row = buildProductFieldHintsFromCaps(capabilities ?? []).find((h) => h.key === field)
  return row?.visible ?? false
}

/**
 * Shared predicate for API Zod + product service: rejects grocery-style fields when caps (including augments) disallow.
 */
export const validateProductFieldsAgainstTenantCaps = (
  tenantEffectiveCaps: readonly string[],
  body: {
    saleUom?: string | null | undefined
    isLoose?: boolean | null | undefined
    behaviorAugmentFlags?: readonly string[] | null | undefined
  },
): string | null => {
  const merged = mergeProductAugmentedCapabilities(tenantEffectiveCaps, body.behaviorAugmentFlags ?? [])
  const groceryish = body.isLoose === true || isSaleUomGroceryStyle(body.saleUom)
  if (groceryish && !hasVerticalCapability(merged, VerticalCapability.weightBreakBulk)) {
    return "Loose or sale unit (UOM) fields require the weight / break-bulk capability on the tenant, branch pack, or product behavior augment flags"
  }
  return null
}
