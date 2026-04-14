import { z } from "zod"
import { getProductFieldVisibility, ProductFormFields } from "@repo/business-type-engine"

/**
 * Capability-aligned Zod slice for grocery-style product fields (same source as `product-field-presets`).
 */
export const buildProductGroceryFieldsSchema = (tenantCapabilities: readonly string[]) => {
  const allow = getProductFieldVisibility(tenantCapabilities, ProductFormFields.saleUom)
  if (!allow) return z.object({}).strict()
  return z.object({
    saleUom: z.string().max(64).optional(),
    isLoose: z.boolean().optional(),
  })
}
