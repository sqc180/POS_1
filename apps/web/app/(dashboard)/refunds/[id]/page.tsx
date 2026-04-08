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
} from "@repo/ui"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { apiBlob, apiRequest } from "@/lib/api"
import { notifyError } from "@/lib/notify"

type RefundDetail = {
  id: string
  refundNumber: string
  invoiceId: string
  paymentId: string | null
  amount: number
  status: string
  reason: string
  providerRefundId: string
  createdBy: string
  createdAt: string
}

type Banner = { message: string; variant: "default" | "destructive" }

const RefundDetailBodySkeleton = () => (
  <Card className="border-border/80 shadow-elevate-sm">
    <CardHeader className="pb-2">
      <Skeleton className="h-5 w-28" />
    </CardHeader>
    <CardContent className="space-y-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex justify-between gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
      ))}
    </CardContent>
  </Card>
)

export default function RefundDetailPage() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : ""
  const [row, setRow] = useState<RefundDetail | null>(null)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setRow(null)
    setBanner(null)
    setLoadError(null)
    setLoading(true)
  }, [id])

  const load = useCallback(async () => {
    if (!id) return
    setLoadError(null)
    const res = await apiRequest<RefundDetail>(`/refunds/${id}`)
    if (!res.success) {
      setRow(null)
      setLoadError(res.error.message)
      notifyError(res.error.message)
    } else {
      setRow(res.data)
      setBanner(null)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const handlePdf = async () => {
    if (!id) return
    const r = await apiBlob(`/refunds/${id}/pdf`)
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
    const res = await apiRequest<RefundDetail>(`/refunds/${id}/complete`, { method: "POST", body: JSON.stringify({}) })
    if (!res.success) {
      setBanner({ message: res.error.message, variant: "destructive" })
      notifyError(res.error.message)
      return
    }
    setRow(res.data)
    setBanner({ message: "Refund marked completed", variant: "default" })
  }

  if (!id) {
    return <p className="text-sm text-muted-foreground">Invalid refund</p>
  }

  const showBodySkeleton = loading && !row

  const headerSubtitle =
    row ? (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Badge variant={row.status === "completed" ? "default" : "secondary"}>{row.status}</Badge>
        <span className="text-sm text-muted-foreground">₹{row.amount.toFixed(2)}</span>
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
            <Link href="/refunds">← Refunds</Link>
          </Button>
          <h1 className="text-2xl font-semibold">
            {showBodySkeleton ? (
              <Skeleton className="block h-8 w-56" />
            ) : row?.refundNumber ? (
              `Refund ${row.refundNumber}`
            ) : (
              "Refund"
            )}
          </h1>
          {headerSubtitle}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void handlePdf()} disabled={!row}>
            Refund note PDF
          </Button>
          <Button type="button" onClick={() => void handleComplete()} disabled={!row || row.status !== "pending"}>
            Complete
          </Button>
        </div>
      </div>

      {loadError && !loading ? (
        <Alert variant="destructive" className="border-destructive/40 shadow-elevate-sm">
          <AlertTitle>Could not load refund</AlertTitle>
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

      {showBodySkeleton ? <RefundDetailBodySkeleton /> : null}

      {row ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-muted-foreground">Invoice</span>
              <Button variant="link" className="h-auto p-0 font-mono text-sm" asChild>
                <Link href={`/invoices/${row.invoiceId}`}>{row.invoiceId}</Link>
              </Button>
            </div>
            <Separator />
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Payment</span>
              <span className="font-mono text-xs">{row.paymentId ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Reason</span>
              <span className="max-w-md text-right">{row.reason || "—"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Provider refund id</span>
              <span className="font-mono text-xs">{row.providerRefundId || "—"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(row.createdAt).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
