import { z } from "zod"
import type { RefinementCtx } from "zod"
import {
  getProductFieldVisibility,
  isProductBehaviorProfileId,
  isSaleUomGroceryStyle,
  mergeProductAugmentedCapabilities,
  ProductFormFields,
} from "@repo/business-type-engine"

/**
 * @deprecated Prefer `buildProductRequestSchema` for routes; kept for callers that only need the grocery slice.
 */
export const buildProductGroceryFieldsSchema = (tenantCapabilities: readonly string[]) => {
  const allow = getProductFieldVisibility(tenantCapabilities, ProductFormFields.saleUom)
  if (!allow) return null
  return z.object({
    saleUom: z.string().max(64).optional(),
    isLoose: z.boolean().optional(),
  })
}

const productBodyBaseSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  internalCode: z.string().optional(),
  hsnSac: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.string().optional(),
  gstSlabId: z.string().optional(),
  taxMode: z.enum(["inclusive", "exclusive"]).optional(),
  sellingPrice: z.number().nonnegative(),
  costPrice: z.number().nonnegative().optional(),
  mrp: z.number().nonnegative().optional(),
  trackStock: z.boolean().optional(),
  brand: z.string().optional(),
  genericName: z.string().max(256).optional(),
  unit: z.string().optional(),
  imageUrl: z.string().optional(),
  variantMode: z.enum(["none", "optional", "required"]).optional(),
  batchTracking: z.boolean().optional(),
  serialTracking: z.boolean().optional(),
  catalogLifecycle: z.enum(["active", "discontinued", "archived"]).optional(),
  saleUom: z.string().max(64).optional(),
  isLoose: z.boolean().optional(),
  behaviorAugmentFlags: z.array(z.string().max(64)).max(32).optional(),
  behaviorProfileId: z
    .union([z.string().trim().max(64), z.null()])
    .optional()
    .refine((v) => v === undefined || v === null || isProductBehaviorProfileId(v), {
      message: "Invalid behaviorProfileId",
    }),
})

const refineGroceryDisallowed = (groceryAllowed: boolean, data: { saleUom?: string; isLoose?: boolean }, ctx: RefinementCtx) => {
  if (groceryAllowed) return
  if (isSaleUomGroceryStyle(data.saleUom)) {
    ctx.addIssue({
      code: "custom",
      message: "saleUom is not allowed for this tenant capability set",
      path: ["saleUom"],
    })
  }
  if (data.isLoose === true) {
    ctx.addIssue({
      code: "custom",
      message: "isLoose is not allowed for this tenant capability set",
      path: ["isLoose"],
    })
  }
}

/**
 * POST body: strict object; grocery fields rejected at Zod when `weight_break_bulk` is off.
 */
export const buildProductRequestSchema = (tenantCapabilities: readonly string[]) =>
  productBodyBaseSchema.strict().superRefine((data, ctx) => {
    const merged = mergeProductAugmentedCapabilities(tenantCapabilities, data.behaviorAugmentFlags)
    const groceryAllowed = getProductFieldVisibility(merged, ProductFormFields.saleUom)
    refineGroceryDisallowed(groceryAllowed, data, ctx)
  })

/**
 * PATCH body: partial product fields + status; same grocery capability gate when keys present.
 * `augmentBaseFromDoc` is merged when the body omits `behaviorAugmentFlags` so partial updates keep stored augments.
 */
export const buildProductPatchSchema = (
  tenantCapabilities: readonly string[],
  augmentBaseFromDoc?: readonly string[] | null,
) =>
  productBodyBaseSchema
    .partial()
    .extend({
      status: z.enum(["active", "inactive"]).optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      const augmentForMerge =
        data.behaviorAugmentFlags !== undefined ? data.behaviorAugmentFlags : (augmentBaseFromDoc ?? [])
      const merged = mergeProductAugmentedCapabilities(tenantCapabilities, augmentForMerge)
      const groceryAllowed = getProductFieldVisibility(merged, ProductFormFields.saleUom)
      refineGroceryDisallowed(groceryAllowed, data, ctx)
    })
