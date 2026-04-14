"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui"
import { hasVerticalCapability, VerticalCapability } from "@repo/business-type-engine"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { useAuth } from "@/components/auth-provider"
import { apiRequest } from "@/lib/api"
import { branchLabelMap, formatBranchLabel } from "@/lib/branch-label"
import { notifyError, notifySuccess } from "@/lib/notify"

const movementSchema = z.object({
  inventoryItemId: z.string().min(1, "Select an inventory item"),
  type: z.enum(["in", "out", "adjustment", "correction", "transfer"]),
  quantity: z.coerce.number(),
  reason: z.string().optional(),
})

const interBranchSchema = z.object({
  fromInventoryItemId: z.string().min(1),
  toBranchId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  reason: z.string().optional(),
})

type Hist = {
  id: string
  inventoryItemId: string
  type: string
  quantity: number
  reason: string
  createdAt: string
}

type InventoryOption = {
  id: string
  productName: string
  sku: string
  branchId: string
  currentStock: number
}

type BranchDto = { code: string; name: string; status: string }

const inventoryRowLabel = (r: InventoryOption, labels: ReadonlyMap<string, string>) =>
  `${r.productName} · ${r.sku || "—"} · ${formatBranchLabel(r.branchId, labels)} · ${r.currentStock} on hand`

export default function StockPage() {
  const { me } = useAuth()
  const [history, setHistory] = useState<Hist[]>([])
  const [inventoryRows, setInventoryRows] = useState<InventoryOption[]>([])
  const [branchRows, setBranchRows] = useState<BranchDto[]>([])
  const [branchLabels, setBranchLabels] = useState<Map<string, string>>(new Map())
  const [loadError, setLoadError] = useState<string | null>(null)
  const showInterBranchTransfer = hasVerticalCapability(me?.tenant.capabilities, VerticalCapability.interStoreTransfer)

  const labelByInventoryId = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of inventoryRows) {
      m.set(r.id, inventoryRowLabel(r, branchLabels))
    }
    return m
  }, [inventoryRows, branchLabels])

  const loadAll = useCallback(async () => {
    setLoadError(null)
    const [invRes, brRes, histRes] = await Promise.all([
      apiRequest<InventoryOption[]>("/inventory"),
      apiRequest<BranchDto[]>("/branches"),
      apiRequest<Hist[]>("/stock/history"),
    ])
    const parts: string[] = []
    if (invRes.success) {
      setInventoryRows(invRes.data)
    } else {
      parts.push(`Inventory: ${invRes.error.message}`)
      notifyError(invRes.error.message)
    }
    if (brRes.success) {
      setBranchRows(brRes.data)
      setBranchLabels(branchLabelMap(brRes.data))
    }
    if (histRes.success) {
      setHistory(histRes.data)
    } else {
      parts.push(`History: ${histRes.error.message}`)
      notifyError(histRes.error.message)
    }
    if (parts.length) setLoadError(parts.join(" · "))
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const form = useForm<z.infer<typeof movementSchema>>({
    resolver: zodResolver(movementSchema),
    defaultValues: { inventoryItemId: "", type: "in", quantity: 1, reason: "" },
  })

  const sortedInventory = useMemo(
    () => [...inventoryRows].sort((a, b) => a.productName.localeCompare(b.productName, undefined, { sensitivity: "base" })),
    [inventoryRows],
  )

  const transferForm = useForm<z.infer<typeof interBranchSchema>>({
    resolver: zodResolver(interBranchSchema),
    defaultValues: { fromInventoryItemId: "", toBranchId: "", quantity: 1, reason: "" },
  })

  const handleInterBranch = transferForm.handleSubmit(async (values) => {
    const res = await apiRequest<{ referenceId: string }>("/stock/inter-branch-transfer", {
      method: "POST",
      body: JSON.stringify(values),
    })
    if (!res.success) {
      transferForm.setError("root", { message: res.error.message })
      notifyError(res.error.message)
      return
    }
    transferForm.reset({ fromInventoryItemId: "", toBranchId: "", quantity: 1, reason: "" })
    notifySuccess("Inter-branch transfer recorded")
    await loadAll()
  })

  const handleMovement = form.handleSubmit(async (values) => {
    const res = await apiRequest<{ currentStock: number }>("/stock/movements", {
      method: "POST",
      body: JSON.stringify(values),
    })
    if (!res.success) {
      form.setError("root", { message: res.error.message })
      notifyError(res.error.message)
      return
    }
    form.reset({ inventoryItemId: "", type: values.type, quantity: 1, reason: "" })
    notifySuccess("Movement recorded")
    await loadAll()
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Stock</h1>
        <p className="text-sm text-muted-foreground">Movements are ledgered; insufficient stock respects tenant settings.</p>
      </div>

      <Alert>
        <AlertTitle>Branches & rows</AlertTitle>
        <AlertDescription className="space-y-2 text-muted-foreground">
          <p>
            Each inventory row is a product at one branch code. Names in the picker come from{" "}
            <Link href="/branches" className="font-medium text-foreground underline-offset-4 hover:underline">
              Branches & locations
            </Link>
            ; create or adjust rows in{" "}
            <Link href="/inventory" className="font-medium text-foreground underline-offset-4 hover:underline">
              Inventory
            </Link>
            .
          </p>
        </AlertDescription>
      </Alert>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not refresh data</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" size="sm" className="w-fit shrink-0" onClick={() => void loadAll()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Record movement</CardTitle>
          <CardDescription>Posts one ledger entry for the selected inventory row. Invoice complete/cancel writes movements automatically when tracking is on.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={handleMovement} className="grid gap-4 md:grid-cols-2">
              {form.formState.errors.root ? (
                <Alert variant="destructive" className="md:col-span-2">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
                </Alert>
              ) : null}
              <FormField
                control={form.control}
                name="inventoryItemId"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Inventory item</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose product / branch row" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[min(24rem,70vh)]">
                        {sortedInventory.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {inventoryRowLabel(r, branchLabels)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Must match the branch where you want quantity to change.</FormDescription>
                    <FormMessage />
                    {sortedInventory.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No inventory rows yet. Enable tracking on a product or open{" "}
                        <Link href="/inventory" className="text-primary underline-offset-4 hover:underline">
                          Inventory
                        </Link>
                        .
                      </p>
                    ) : null}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="in">Stock in</SelectItem>
                        <SelectItem value="out">Stock out</SelectItem>
                        <SelectItem value="adjustment">Adjustment (signed delta)</SelectItem>
                        <SelectItem value="correction">Correction</SelectItem>
                        <SelectItem value="transfer">Transfer (placeholder)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>In and out use the amount as a positive magnitude; adjustment uses your number as the signed change.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="e.g. 10" {...field} />
                    </FormControl>
                    <FormDescription>Decimals allowed when your catalog uses fractional units.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Reason (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. GRN #4421 · cycle count" {...field} />
                    </FormControl>
                    <FormDescription>Shown in the history table below for audits.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="md:col-span-2" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Applying…" : "Apply"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {showInterBranchTransfer ? (
        <Card id="inter-branch-transfer">
          <CardHeader>
            <CardTitle className="text-base">Inter-branch transfer</CardTitle>
            <CardDescription>
              Moves quantity from one inventory row to another branch for the same product. Shown when your workspace pilot includes distribution or
              multi-branch capabilities.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...transferForm}>
              <form onSubmit={handleInterBranch} className="grid gap-4 md:grid-cols-2">
                {transferForm.formState.errors.root ? (
                  <Alert variant="destructive" className="md:col-span-2">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{transferForm.formState.errors.root.message}</AlertDescription>
                  </Alert>
                ) : null}
                <FormField
                  control={transferForm.control}
                  name="fromInventoryItemId"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>From inventory row</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Source row (loses stock)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-[min(24rem,70vh)]">
                          {sortedInventory.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {inventoryRowLabel(r, branchLabels)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={transferForm.control}
                  name="toBranchId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>To branch</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Destination branch code" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {branchRows
                            .filter((b) => b.status === "active")
                            .map((b) => (
                              <SelectItem key={b.code} value={b.code}>
                                {b.name} ({b.code})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={transferForm.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={transferForm.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Reason (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Replenishment" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="md:col-span-2" disabled={transferForm.formState.isSubmitting}>
                  {transferForm.formState.isSubmitting ? "Transferring…" : "Run transfer"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent movements</CardTitle>
          <CardDescription>Newest first. The item column resolves the product and branch for known inventory ids.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(h.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="max-w-[min(24rem,55vw)]">
                    <span className="text-sm">{labelByInventoryId.get(h.inventoryItemId) ?? h.inventoryItemId}</span>
                  </TableCell>
                  <TableCell>{h.type}</TableCell>
                  <TableCell>{h.quantity}</TableCell>
                  <TableCell>{h.reason || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {history.length === 0 && !loadError ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No movements recorded yet.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
