import {
  buildProductFieldHintsFromCaps,
  getProductFieldVisibility,
  ProductFormFields,
  type ProductFieldHintRow,
  type ProductFormFieldKey,
} from "@repo/business-type-engine"

export { buildProductFieldHintsFromCaps, getProductFieldVisibility, ProductFormFields }
export type { ProductFieldHintRow, ProductFormFieldKey }

/** Prefer `/me` `productFieldHints` when present; otherwise derive from capability list. */
export const getProductFieldHintsForMe = (
  capabilities: readonly string[] | undefined,
  hintsFromApi?: readonly { key: string; visible: boolean; section?: string }[] | undefined,
): ProductFieldHintRow[] => {
  if (hintsFromApi?.length) {
    return hintsFromApi.map((h) => ({
      key: h.key as ProductFormFieldKey,
      visible: h.visible,
      section: (h.section === "stock_entry" ? "stock_entry" : "catalog") as ProductFieldHintRow["section"],
    }))
  }
  return buildProductFieldHintsFromCaps(capabilities ?? [])
}

export const isGroceryProductSectionVisible = (
  capabilities: readonly string[] | undefined,
  hintsFromApi?: readonly { key: string; visible: boolean }[] | undefined,
): boolean => {
  const fromHints = hintsFromApi?.find((h) => h.key === ProductFormFields.saleUom)?.visible
  if (fromHints !== undefined) return fromHints
  return getProductFieldVisibility(capabilities, ProductFormFields.saleUom)
}
