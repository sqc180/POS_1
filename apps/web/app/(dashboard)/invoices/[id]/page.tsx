"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
  Skeleton,
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
import type { FileAssetPublic } from "@repo/types"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { apiBlob, apiRequest } from "@/lib/api"
import { notifyError } from "@/lib/notify"

type InvoiceDetail = {
  id: string
  invoiceNumber: string
  status: string
  grandTotal: number
  amountPaid: number
  subtotal: number
  cgstTotal: number
  sgstTotal: number
  igstTotal: number
  notes: string
  items: {
    name: string
    sku: string
    qty: number
    unitPrice: number
    lineTotal: number
  }[]
}

type PaymentRow = {
  id: string
  amount: number
  method: string
  status: string
  createdAt: string
}

type PageBanner = { message: string; variant: "default" | "destructive" }

const InvoiceDetailBodySkeleton = () => (
  <Card className="border-border/80 shadow-elevate-sm">
    <CardHeader className="space-y-2 pb-2">
      <Skeleton className="h-4 w-32" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
      <Skeleton className="h-24 w-full rounded-lg" />
    </CardContent>
  </Card>
)

export default function InvoiceDetailPage() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : ""
  const [inv, setInv] = useState<InvoiceDetail | null>(null)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [banner, setBanner] = useState<PageBanner | null>(null)
  const [pdfMeta, setPdfMeta] = useState<FileAssetPublic | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setInv(null)
    setPayments([])
    setPdfMeta(null)
    setLoadError(null)
    setBanner(null)
    setLoading(true)
  }, [id])

  const load = useCallback(async () => {
    if (!id) return
    setLoadError(null)
    const res = await apiRequest<InvoiceDetail>(`/invoices/${id}`)
    if (res.success) {
      setInv(res.data)
    } else {
      setInv(null)
      setLoadError(res.error.message)
      notifyError(res.error.message)
    }
    const pr = await apiRequest<PaymentRow[]>(`/payments?invoiceId=${encodeURIComponent(id)}`)
    if (pr.success) setPayments(pr.data)
    else setPayments([])
    setLoading(false)
  }, [id])

  const loadPdfMeta = useCallback(async () => {
    if (!id) return
    const res = await apiRequest<FileAssetPublic>(
      `/documents/ensure?documentType=invoice_pdf&relatedEntityId=${encodeURIComponent(id)}`,
    )
    setPdfMeta(res.success ? res.data : null)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadPdfMeta()
  }, [loadPdfMeta])

  const handlePdf = async () => {
    if (!id) return
    const r = await apiBlob(`/invoices/${id}/pdf`)
    if (!r.ok) {
      setBanner({ message: r.error.message, variant: "destructive" })
      notifyError(r.error.message)
      return
    }
    setBanner(null)
    const url = URL.createObjectURL(r.blob)
    window.open(url, "_blank", "noopener,noreferrer")
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const handleComplete = async () => {
    if (!id) return
    const res = await apiRequest<InvoiceDetail>(`/invoices/${id}/complete`, { method: "POST" })
    if (!res.success) {
      setBanner({ message: res.error.message, variant: "destructive" })
      notifyError(res.error.message)
      return
    }
    setInv(res.data)
    await load()
    await loadPdfMeta()
    setBanner({ message: "Invoice completed", variant: "default" })
  }

  const handleCancel = async () => {
    if (!id) return
    const res = await apiRequest<InvoiceDetail>(`/invoices/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: "Cancelled from detail page" }),
    })
    if (!res.success) {
      setBanner({ message: res.error.message, variant: "destructive" })
      notifyError(res.error.message)
      return
    }
    setInv(res.data)
    await loadPdfMeta()
    setBanner({ message: "Invoice cancelled", variant: "default" })
  }

  if (!id) {
    return <p className="text-sm text-muted-foreground">Invalid invoice</p>
  }

  const showBodySkeleton = loading && !inv
  const headerSubtitle =
    inv ? (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Badge variant={inv.status === "completed" ? "default" : "secondary"}>{inv.status}</Badge>
        <span className="text-sm text-muted-foreground">₹{inv.grandTotal.toFixed(2)}</span>
      </div>
    ) : showBodySkeleton ? (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-4 w-20" />
      </div>
    ) : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link href="/invoices">← Invoices</Link>
          </Button>
          <h1 className="text-2xl font-semibold">
            {showBodySkeleton ? (
              <Skeleton className="block h-8 w-56" />
            ) : inv?.invoiceNumber ? (
              `Invoice ${inv.invoiceNumber}`
            ) : (
              "Invoice"
            )}
          </h1>
          {headerSubtitle}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={handlePdf} disabled={!inv}>
            Download PDF
          </Button>
          <Button type="button" onClick={handleComplete} disabled={!inv || inv.status !== "draft"}>
            Complete
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleCancel}
            disabled={
              !inv ||
              inv.status === "cancelled" ||
              (inv.status === "completed" && inv.amountPaid > 0)
            }
          >
            Cancel
          </Button>
        </div>
      </div>

      {loadError && !loading ? (
        <Alert variant="destructive" className="border-destructive/40 shadow-elevate-sm">
          <AlertTitle>Could not load invoice</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-destructive/90">{loadError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-destructive/30 sm:w-auto"
              onClick={() => void load()}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {banner ? (
        <Alert variant={banner.variant === "destructive" ? "destructive" : "default"}>
          {banner.variant === "destructive" ? <AlertTitle>Error</AlertTitle> : null}
          <AlertDescription>{banner.message}</AlertDescription>
        </Alert>
      ) : null}

      {pdfMeta && !showBodySkeleton ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Stored invoice PDF</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p>
                <span className="font-medium text-foreground">File</span> {pdfMeta.originalFileName} · {(pdfMeta.fileSize / 1024).toFixed(1)} KB
              </p>
              <p className="text-xs">Served only via authenticated API; disk paths are never exposed to the client.</p>
            </div>
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/documents?type=invoice&id=${encodeURIComponent(id)}`}>Open in viewer</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {showBodySkeleton ? <InvoiceDetailBodySkeleton /> : null}

      {inv ? (
        <Tabs defaultValue="lines">
          <TabsList>
            <TabsTrigger value="lines">Lines</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>
          <TabsContent value="lines" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Line items</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inv.items.map((it, i) => (
                      <TableRow key={`${it.sku}-${i}`}>
                        <TableCell>
                          <div className="font-medium">{it.name}</div>
                          <div className="text-xs text-muted-foreground">{it.sku}</div>
                        </TableCell>
                        <TableCell className="text-right">{it.qty}</TableCell>
                        <TableCell className="text-right">₹{it.unitPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-right">₹{it.lineTotal.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Separator className="my-4" />
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>₹{inv.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>CGST / SGST / IGST</span>
                    <span>
                      {inv.cgstTotal.toFixed(2)} / {inv.sgstTotal.toFixed(2)} / {inv.igstTotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Grand total</span>
                    <span>₹{inv.grandTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid</span>
                    <span>₹{inv.amountPaid.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="payments" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payments</CardTitle>
              </CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.method}</TableCell>
                          <TableCell>{p.status}</TableCell>
                          <TableCell className="text-right">₹{p.amount.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="notes" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <p className="whitespace-pre-wrap text-sm">{inv.notes || "—"}</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  )
}
