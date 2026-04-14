"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from "@repo/ui"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { apiRequest } from "@/lib/api"
import { branchLabelMap, formatBranchLabel } from "@/lib/branch-label"
import { notifyError, notifySuccess } from "@/lib/notify"

type Inv = {
  id: string
  productName: string
  sku: string
  branchId: string
  currentStock: number
  reorderLevel: number
  lowStockThreshold: number
  openingStock: number
  variantId?: string | null
  variantLabel?: string
  variantSku?: string
}

type BranchDto = { code: string; name: string; status: string }

const schema = z.object({
  reorderLevel: z.coerce.number().nonnegative(),
  lowStockThreshold: z.coerce.number().nonnegative(),
  openingStock: z.coerce.number().nonnegative(),
})

const fieldCopy = {
  reorderLevel: {
    label: "Reorder level",
    description: "When on-hand quantity is at or below this level, the inventory list highlights the row as low stock (if threshold is also set).",
  },
  lowStockThreshold: {
    label: "Low stock threshold",
    description: "Must be greater than zero for the red Low badge to appear when current stock is at or below this value.",
  },
  openingStock: {
    label: "Opening stock baseline",
    description: "Recorded baseline for this row; day-to-day quantity changes go through Stock movements or sales.",
  },
} as const

export default function InventoryDetailPage() {
  const params = useParams<{ id: string }>()
  const [row, setRow] = useState<Inv | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [branchLabels, setBranchLabels] = useState<Map<string, string>>(new Map())

  const load = useCallback(async () => {
    const [invRes, brRes] = await Promise.all([
      apiRequest<Inv>(`/inventory/${params.id}`),
      apiRequest<BranchDto[]>("/branches"),
    ])
    if (invRes.success) {
      setRow(invRes.data)
      setLoadError(null)
    } else {
      setRow(null)
      setLoadError(invRes.error.message)
      notifyError(invRes.error.message)
    }
    if (brRes.success) {
      setBranchLabels(branchLabelMap(brRes.data))
    }
  }, [params.id])

  useEffect(() => {
    void load()
  }, [load])

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { reorderLevel: 0, lowStockThreshold: 0, openingStock: 0 },
  })

  useEffect(() => {
    if (!row) return
    form.reset({
      reorderLevel: row.reorderLevel,
      lowStockThreshold: row.lowStockThreshold,
      openingStock: row.openingStock,
    })
  }, [row, form])

  const handleSave = form.handleSubmit(async (values) => {
    const res = await apiRequest<Inv>(`/inventory/${params.id}`, {
      method: "PATCH",
      body: JSON.stringify(values),
    })
    if (!res.success) {
      form.setError("root", { message: res.error.message })
      notifyError(res.error.message)
      return
    }
    setRow(res.data)
    notifySuccess("Inventory levels saved")
  })

  if (loadError && !row) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/inventory">Back</Link>
        </Button>
        <Alert variant="destructive">
          <AlertTitle>Could not load inventory row</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" size="sm" className="w-fit shrink-0" onClick={() => void load()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!row) return null

  const branchDisplay = formatBranchLabel(row.branchId, branchLabels)

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/inventory">Back</Link>
      </Button>
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>{row.productName}</CardTitle>
              <CardDescription className="font-mono">{row.sku}</CardDescription>
              {row.variantLabel ? (
                <p className="text-sm text-muted-foreground">
                  Variant: <span className="font-medium text-foreground">{row.variantLabel}</span>
                  {row.variantSku ? <span className="font-mono"> ({row.variantSku})</span> : null}
                </p>
              ) : null}
            </div>
            <Badge variant="secondary" className="shrink-0">
              {branchDisplay}
            </Badge>
          </div>
          <CardDescription>
            Stock for branch code{" "}
            <span className="font-mono font-medium text-foreground">{row.branchId}</span>. Names come from{" "}
            <Link href="/branches" className="font-medium text-foreground underline-offset-4 hover:underline">
              Branches & locations
            </Link>
            . Adjust quantities from{" "}
            <Link href="/stock" className="font-medium text-foreground underline-offset-4 hover:underline">
              Stock
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Current on hand: <span className="font-semibold text-foreground">{row.currentStock}</span>
          </p>
          <Form {...form}>
            <form onSubmit={handleSave} className="space-y-4">
              {form.formState.errors.root ? (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
                </Alert>
              ) : null}
              {(["reorderLevel", "lowStockThreshold", "openingStock"] as const).map((name) => {
                const meta = fieldCopy[name]
                return (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{meta.label}</FormLabel>
                        <FormControl>
                          <Input type="number" step="1" {...field} />
                        </FormControl>
                        <FormDescription>{meta.description}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )
              })}
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Save levels"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
