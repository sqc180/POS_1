"use client"

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
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
import { useCallback, useEffect, useState } from "react"
import { PageHeader, PageHeaderRule } from "@/components/page-header"
import { apiRequest } from "@/lib/api"
import { notifyError, notifySuccess } from "@/lib/notify"

type PrRow = {
  id: string
  title: string
  status: string
  branchId: string
  lines: { productId: string; qty: number; note: string }[]
  createdAt: string
}

type GrnRow = {
  id: string
  status: string
  branchId: string
  lines: { productId: string; qty: number; batchCode: string; expiryDate: string | null }[]
  createdAt: string
}

type StrRow = {
  id: string
  status: string
  fromBranchId: string
  toBranchId: string
  lines: { productId: string; variantId: string | null; qty: number }[]
  createdAt: string
}

export default function ProcurementPage() {
  const [tab, setTab] = useState("pr")
  const [prRows, setPrRows] = useState<PrRow[]>([])
  const [grnRows, setGrnRows] = useState<GrnRow[]>([])
  const [strRows, setStrRows] = useState<StrRow[]>([])
  const [prProductId, setPrProductId] = useState("")
  const [prQty, setPrQty] = useState(1)
  const [grnProductId, setGrnProductId] = useState("")
  const [grnQty, setGrnQty] = useState(1)
  const [grnBatch, setGrnBatch] = useState("")
  const [stFrom, setStFrom] = useState("main")
  const [stTo, setStTo] = useState("")
  const [stProductId, setStProductId] = useState("")
  const [stQty, setStQty] = useState(1)

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      apiRequest<PrRow[]>("/procurement/purchase-requisitions"),
      apiRequest<GrnRow[]>("/procurement/grn-drafts"),
      apiRequest<StrRow[]>("/procurement/stock-transfers"),
    ])
    if (a.success) setPrRows(a.data)
    if (b.success) setGrnRows(b.data)
    if (c.success) setStrRows(c.data)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreatePr = async () => {
    if (!prProductId.trim()) {
      notifyError("Enter product id")
      return
    }
    const res = await apiRequest<PrRow>("/procurement/purchase-requisitions", {
      method: "POST",
      body: JSON.stringify({ title: "Counter request", lines: [{ productId: prProductId.trim(), qty: prQty }] }),
    })
    if (!res.success) {
      notifyError(res.error.message)
      return
    }
    notifySuccess("Purchase requisition created")
    setPrProductId("")
    void load()
  }

  const handleCreateGrn = async () => {
    if (!grnProductId.trim()) {
      notifyError("Enter product id")
      return
    }
    const res = await apiRequest<GrnRow>("/procurement/grn-drafts", {
      method: "POST",
      body: JSON.stringify({
        lines: [{ productId: grnProductId.trim(), qty: grnQty, batchCode: grnBatch.trim() || "B1" }],
      }),
    })
    if (!res.success) {
      notifyError(res.error.message)
      return
    }
    notifySuccess("GRN draft saved")
    setGrnProductId("")
    void load()
  }

  const handleCreateStr = async () => {
    if (!stProductId.trim() || !stTo.trim()) {
      notifyError("Product id and destination branch required")
      return
    }
    const res = await apiRequest<StrRow>("/procurement/stock-transfers", {
      method: "POST",
      body: JSON.stringify({
        fromBranchId: stFrom,
        toBranchId: stTo.trim(),
        lines: [{ productId: stProductId.trim(), qty: stQty }],
      }),
    })
    if (!res.success) {
      notifyError(res.error.message)
      return
    }
    notifySuccess("Stock transfer request created")
    setStProductId("")
    void load()
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Procurement & transfers"
        description="Purchase requisitions, GRN drafts, and stock transfer requests (Phase 3 workspace)."
      />
      <PageHeaderRule />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pr">Requisitions</TabsTrigger>
          <TabsTrigger value="grn">GRN drafts</TabsTrigger>
          <TabsTrigger value="st">Transfers</TabsTrigger>
        </TabsList>

        <TabsContent value="pr" className="space-y-4">
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">New requisition</CardTitle>
              <CardDescription>Minimum viable line — add product Mongo id from catalog.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="pr-pid">Product id</Label>
                <Input id="pr-pid" value={prProductId} onChange={(e) => setPrProductId(e.target.value)} />
              </div>
              <div className="w-24 space-y-1">
                <Label htmlFor="pr-qty">Qty</Label>
                <Input
                  id="pr-qty"
                  type="number"
                  min={1}
                  value={prQty}
                  onChange={(e) => setPrQty(Number.parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <Button type="button" onClick={() => void handleCreatePr()}>
                Create
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Lines</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.title}</TableCell>
                      <TableCell>{r.status}</TableCell>
                      <TableCell>{r.lines.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {prRows.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No requisitions yet.</p> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grn" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New GRN draft</CardTitle>
              <CardDescription>Draft goods receipt — posting to stock is a future step.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="grn-pid">Product id</Label>
                <Input id="grn-pid" value={grnProductId} onChange={(e) => setGrnProductId(e.target.value)} />
              </div>
              <div className="w-24 space-y-1">
                <Label htmlFor="grn-qty">Qty</Label>
                <Input
                  id="grn-qty"
                  type="number"
                  min={1}
                  value={grnQty}
                  onChange={(e) => setGrnQty(Number.parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="grn-batch">Batch code</Label>
                <Input id="grn-batch" value={grnBatch} onChange={(e) => setGrnBatch(e.target.value)} placeholder="Optional" />
              </div>
              <Button type="button" onClick={() => void handleCreateGrn()}>
                Save draft
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Lines</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grnRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.status}</TableCell>
                      <TableCell>{r.lines.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {grnRows.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No drafts.</p> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="st" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stock transfer request</CardTitle>
              <CardDescription>Indent-style request between branch codes.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="st-from">From branch</Label>
                <Input id="st-from" value={stFrom} onChange={(e) => setStFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="st-to">To branch</Label>
                <Input id="st-to" value={stTo} onChange={(e) => setStTo(e.target.value)} placeholder="e.g. store-2" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="st-pid">Product id</Label>
                <Input id="st-pid" value={stProductId} onChange={(e) => setStProductId(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="st-qty">Qty</Label>
                <Input
                  id="st-qty"
                  type="number"
                  min={1}
                  value={stQty}
                  onChange={(e) => setStQty(Number.parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <div className="flex items-end">
                <Button type="button" onClick={() => void handleCreateStr()}>
                  Submit request
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {strRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.fromBranchId}</TableCell>
                      <TableCell>{r.toBranchId}</TableCell>
                      <TableCell>{r.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {strRows.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No transfers yet.</p> : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
