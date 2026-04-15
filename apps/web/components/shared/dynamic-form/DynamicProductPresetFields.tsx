"use client"

import { Checkbox, FormControl, FormField, FormItem, FormLabel, FormMessage, Input } from "@repo/ui"
import type { Control, FieldPath, FieldValues } from "react-hook-form"
import { ProductFormFields, type ProductFieldHintRow } from "@repo/business-type-engine"

export type DynamicProductPresetFieldsProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>
  hints: readonly ProductFieldHintRow[]
}

const isVisible = (hints: readonly ProductFieldHintRow[], key: (typeof ProductFormFields)[keyof typeof ProductFormFields]) =>
  hints.some((h) => h.key === key && h.visible)

/**
 * Renders capability-gated product inputs from preset hints (shadcn / `@repo/ui` only).
 */
export const DynamicProductPresetFields = <TFieldValues extends FieldValues>({
  control,
  hints,
}: DynamicProductPresetFieldsProps<TFieldValues>) => {
  const showGrocery = isVisible(hints, ProductFormFields.saleUom)
  if (!showGrocery) return null
  return (
    <>
      <FormField
        control={control}
        name={"saleUom" as FieldPath<TFieldValues>}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Sale UOM</FormLabel>
            <FormControl>
              <Input placeholder="e.g. kg, piece" {...field} value={String(field.value ?? "")} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={"isLoose" as FieldPath<TFieldValues>}
        render={({ field }) => (
          <FormItem className="flex flex-row items-start gap-3 rounded-md border p-3">
            <FormControl>
              <Checkbox
                checked={Boolean(field.value)}
                onCheckedChange={(v) => field.onChange(v === true)}
                aria-label="Loose / break-bulk item"
              />
            </FormControl>
            <div className="space-y-1 leading-none">
              <FormLabel>Loose / break-bulk</FormLabel>
              <p className="text-xs text-muted-foreground">For weighted or open-sale SKUs.</p>
            </div>
          </FormItem>
        )}
      />
    </>
  )
}
