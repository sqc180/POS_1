"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui"
import { hasVerticalCapability, VerticalCapability } from "@repo/business-type-engine"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { apiRequest } from "@/lib/api"
import { branchLabelMap, formatBranchLabel } from "@/lib/branch-label"
import { notifyError } from "@/lib/notify"

type Row = {
  id: string
  productId: string
  productName: string
  sku: string
  currentStock: number
  reorderLevel: number
  isLowStock: boolean
  branchId: string
  variantId?: string | null
  variantLabel?: string
  variantSku?: string
}

type BranchDto = { code: string; name: string; status: string }

type NearExpiryBatch = {
  id: string
  productId: string
  variantId: string | null
  branchId: string
  batchCode: string
  expiryDate: string | null
  qtyOnHand: number
}

type LocationRow = { id: string; branchId: string; code: string; name: string; kind: string; status: string }

export default function InventoryPage() {
  const { me } = useAuth()
  const showTransferHint = hasVerticalCapability(me?.tenant.capabilities, VerticalCapability.interStoreTransfer)
  const [rows, setRows] = useState<Row[]>([])
  const [branchFilter, setBranchFilter] = useState<string>("all")
  const [branchLabels, setBranchLabels] = useState<Map<string, string>>(new Map())
  const [loadError, setLoadError] = useState<string | null>(null)
  const [nearExpiryBatches, setNearExpiryBatches] = useState<NearExpiryBatch[]>([])
  const [locations, setLocations] = useState<LocationRow[]>([])

  const load = useCallback(async () => {
    const [invRes, brRes, nearRes, locRes] = await Promise.all([
      apiRequest<Row[]>("/inventory"),
      apiRequest<BranchDto[]>("/branches"),
      apiRequest<NearExpiryBatch[]>("/stock/batches/near-expiry?withinDays=60"),
      apiRequest<LocationRow[]>("/inventory/locations"),
    ])
    if (invRes.success) {
      setRows(invRes.data)
      setLoadError(null)
    } else {
      setLoadError(invRes.error.message)
      notifyError(invRes.error.message)
    }
    if (brRes.success) {
      setBranchLabels(branchLabelMap(brRes.data))
    }
    if (nearRes.success) {
      setNearExpiryBatches(nearRes.data)
    } else {
      setNearExpiryBatches([])
    }
    if (locRes.success) {
      setLocations(locRes.data)
    } else {
      setLocations([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const branchOptions = useMemo(() => [...new Set(rows.map((r) => r.branchId))].sort(), [rows])

  const filteredRows = useMemo(
    () => (branchFilter === "all" ? rows : rows.filter((r) => r.branchId === branchFilter)),
    [rows, branchFilter],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Stock by product and branch; low-stock signals and links to detail. Branch names come from{" "}
            <Link href="/branches" className="font-medium text-foreground underline-offset-4 hover:underline">
              Branches & locations
            </Link>
            .
          </p>
        </div>
        {branchOptions.length > 0 ? (
          <div className="flex flex-col gap-1.5 sm:min-w-[14rem]">
            <span className="text-xs font-medium text-muted-foreground">Branch</span>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger aria-label="Filter by branch">
                <SelectValue placeholder="All branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branchOptions.map((b) => (
                  <SelectItem key={b} value={b}>
                    {formatBranchLabel(b, branchLabels)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load inventory</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" size="sm" className="w-fit shrink-0" onClick={() => void load()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <Tabs defaultValue="stock" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="stock">Stock levels</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
        </TabsList>
        <TabsContent value="stock" className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>On hand</TableHead>
                <TableHead>Reorder</TableHead>
                <TableHead className="text-right">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.productName}</TableCell>
                  <TableCell>{r.sku}</TableCell>
                  <TableCell className="max-w-[10rem] truncate text-muted-foreground">
                    {r.variantLabel ? `${r.variantLabel} (${r.variantSku ?? ""})` : "—"}
                  </TableCell>
                  <TableCell>{formatBranchLabel(r.branchId, branchLabels)}</TableCell>
                  <TableCell>
                    {r.currentStock}
                    {r.isLowStock ? (
                      <Badge variant="destructive" className="ml-2">
                        Low
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{r.reorderLevel}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="link" className="h-auto p-0" asChild>
                      <Link href={`/inventory/${r.id}`}>Manage</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="movements" className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Record stock ins, outs, and adjustments under{" "}
            <Link href="/stock" className="font-medium text-foreground underline-offset-4 hover:underline">
              Stock movements
            </Link>
            . Movement types now include purchase, sale, transfer, damage, and other ledger-aligned labels on the API.
          </p>
          {showTransferHint ? (
            <p className="mt-4 text-sm text-muted-foreground">
              For cross-branch moves, use{" "}
              <Link href="/stock#inter-branch-transfer" className="font-medium text-foreground underline-offset-4 hover:underline">
                Inter-branch transfer
              </Link>{" "}
              on the Stock page (enabled for your pilot capabilities).
            </p>
          ) : null}
        </TabsContent>
        <TabsContent value="locations" className="rounded-xl border bg-card">
          {locations.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No warehouse or bin locations yet. Add rows via the API <span className="font-mono">GET /inventory/locations</span> seeding or a future location manager.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Kind</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.map((loc) => (
                  <TableRow key={loc.id}>
                    <TableCell>{formatBranchLabel(loc.branchId, branchLabels)}</TableCell>
                    <TableCell className="font-mono">{loc.code}</TableCell>
                    <TableCell>{loc.name}</TableCell>
                    <TableCell>{loc.kind}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {nearExpiryBatches.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Batches nearing expiry</CardTitle>
            <CardDescription>Active batch-tracked stock expiring within the next 60 days (requires stock permission).</CardDescription>
          </CardHeader>
          <div className="border-t px-6 pb-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead className="text-right">Product</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nearExpiryBatches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-sm">{b.batchCode}</TableCell>
                    <TableCell>{formatBranchLabel(b.branchId, branchLabels)}</TableCell>
                    <TableCell>{b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>{b.qtyOnHand}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="link" className="h-auto p-0" asChild>
                        <Link href={`/products/${b.productId}`}>Open product</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
