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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { apiRequest } from "@/lib/api"
import { notifyError } from "@/lib/notify"

type PaymentRow = {
  id: string
  invoiceId: string
  amount: number
  method: string
  status: string
  providerRef: string
  idempotencyKey: string
  createdAt: string
}

const PAYMENTS_LIST_SKELETON_ROWS = 6

const PaymentsTableSkeleton = () => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Invoice</TableHead>
        <TableHead>Method</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="text-right">Amount</TableHead>
        <TableHead className="w-[100px] text-right"> </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {Array.from({ length: PAYMENTS_LIST_SKELETON_ROWS }, (_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-20 rounded-full" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="ml-auto h-4 w-16" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="ml-auto h-8 w-16" />
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
)

const PaymentDetailSheetSkeleton = () => (
  <div className="mt-6 space-y-4">
    {Array.from({ length: 6 }, (_, i) => (
      <div key={i} className="space-y-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-full max-w-[12rem]" />
      </div>
    ))}
  </div>
)

export default function PaymentsPage() {
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<PaymentRow | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setListLoading(true)
    setLoadError(null)
    const res = await apiRequest<PaymentRow[]>("/payments")
    if (res.success) {
      setRows(res.data)
    } else {
      setRows([])
      setLoadError(res.error.message)
      notifyError(res.error.message)
    }
    setListLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setDetail(null)
      setDetailError(null)
      setDetailLoadingId(null)
    }
  }

  const handleOpenRow = async (id: string) => {
    setDetailError(null)
    setDetail(null)
    setDetailLoadingId(id)
    setOpen(true)
    const res = await apiRequest<PaymentRow>(`/payments/${id}`)
    setDetailLoadingId(null)
    if (!res.success) {
      setDetailError(res.error.message)
      notifyError(res.error.message)
      return
    }
    setDetail(res.data)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">Recorded tender for completed invoices. Open a row for full detail.</p>
      </div>
      {loadError ? (
        <Alert variant="destructive" className="border-destructive/40 shadow-elevate-sm">
          <AlertTitle>Could not load payments</AlertTitle>
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
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Recent payments</CardTitle>
        </CardHeader>
        <CardContent>
          {listLoading ? (
            <PaymentsTableSkeleton />
          ) : loadError ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Resolve the error above, then retry.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[100px] text-right"> </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/invoices/${r.invoiceId}`} className="text-primary underline-offset-4 hover:underline">
                          Open invoice
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize">{r.method.replace("_", " ")}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "completed" ? "default" : "secondary"}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">₹{r.amount.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={detailLoadingId === r.id}
                          onClick={() => void handleOpenRow(r.id)}
                        >
                          {detailLoadingId === r.id ? "…" : "Details"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No payments yet.</p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Payment</SheetTitle>
            <SheetDescription>Provider reference and idempotency metadata.</SheetDescription>
          </SheetHeader>
          {detailError ? (
            <Alert variant="destructive" className="mt-6">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{detailError}</AlertDescription>
            </Alert>
          ) : null}
          {detail ? (
            <dl className="mt-6 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Amount</dt>
                <dd className="font-medium tabular-nums">₹{detail.amount.toFixed(2)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Method</dt>
                <dd className="capitalize">{detail.method.replace("_", " ")}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant={detail.status === "completed" ? "default" : "secondary"}>{detail.status}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Invoice</dt>
                <dd>
                  <Link href={`/invoices/${detail.invoiceId}`} className="text-primary underline-offset-4 hover:underline">
                    View invoice
                  </Link>
                </dd>
              </div>
              {detail.providerRef ? (
                <div>
                  <dt className="text-muted-foreground">Provider ref</dt>
                  <dd className="break-all font-mono text-xs">{detail.providerRef}</dd>
                </div>
              ) : null}
              {detail.idempotencyKey ? (
                <div>
                  <dt className="text-muted-foreground">Idempotency key</dt>
                  <dd className="break-all font-mono text-xs">{detail.idempotencyKey}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd className="text-muted-foreground">{detail.createdAt}</dd>
              </div>
            </dl>
          ) : null}
          {detailLoadingId && !detail && !detailError ? <PaymentDetailSheetSkeleton /> : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
