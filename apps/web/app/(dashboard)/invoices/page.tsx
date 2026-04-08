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

type InvoiceListRow = {
  id: string
  invoiceNumber: string
  status: string
  grandTotal: number
  amountPaid: number
  createdAt: string
}

const INVOICE_LIST_SKELETON_ROWS = 6

const InvoiceListTableSkeleton = () => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Number</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="text-right">Total</TableHead>
        <TableHead className="text-right">Paid</TableHead>
        <TableHead />
      </TableRow>
    </TableHeader>
    <TableBody>
      {Array.from({ length: INVOICE_LIST_SKELETON_ROWS }, (_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-20 rounded-full" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="ml-auto h-4 w-16" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="ml-auto h-4 w-16" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="ml-auto h-8 w-14" />
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
)

export default function InvoicesPage() {
  const [rows, setRows] = useState<InvoiceListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const res = await apiRequest<InvoiceListRow[]>("/invoices")
    if (res.success) {
      setRows(res.data)
    } else {
      setRows([])
      setLoadError(res.error.message)
      notifyError(res.error.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground">Draft and completed sales with PDF export on detail.</p>
        </div>
        <Button asChild>
          <Link href="/pos">Open POS</Link>
        </Button>
      </div>

      {loadError ? (
        <Alert variant="destructive" className="border-destructive/40 shadow-elevate-sm">
          <AlertTitle>Could not load invoices</AlertTitle>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <InvoiceListTableSkeleton />
          ) : loadError ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Resolve the error above, then retry.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.invoiceNumber || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "completed" ? "default" : "secondary"}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">₹{r.grandTotal.toFixed(2)}</TableCell>
                      <TableCell className="text-right">₹{r.amountPaid.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/invoices/${r.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No invoices yet.</p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
