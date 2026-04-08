"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { apiBlob, apiRequest } from "@/lib/api"
import { notifyError } from "@/lib/notify"

type ReceiptRow = {
  id: string
  receiptNumber: string
  invoiceId: string
  grandTotal: number
  createdAt: string
}

const formatReceiptDate = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

export default function ReceiptsPage() {
  const [rows, setRows] = useState<ReceiptRow[]>([])
  const [pdfError, setPdfError] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await apiRequest<ReceiptRow[]>("/receipts")
    if (res.success) {
      setRows(res.data)
      setLoadError(null)
    } else {
      setLoadError(res.error.message)
      notifyError(res.error.message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handlePdf = async (id: string) => {
    const r = await apiBlob(`/receipts/${id}/pdf`)
    if (!r.ok) {
      setPdfError(r.error.message)
      notifyError(r.error.message)
      return
    }
    setPdfError("")
    const url = URL.createObjectURL(r.blob)
    window.open(url, "_blank", "noopener,noreferrer")
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <p className="text-sm text-muted-foreground">Issued when an invoice is fully paid.</p>
      </div>
      <Alert>
        <AlertTitle>How receipts appear here</AlertTitle>
        <AlertDescription className="space-y-2 text-muted-foreground">
          <p>
            After you complete payment on an invoice (for example from{" "}
            <Link href="/pos" className="font-medium text-foreground underline-offset-4 hover:underline">
              POS
            </Link>{" "}
            or{" "}
            <Link href="/invoices" className="font-medium text-foreground underline-offset-4 hover:underline">
              Invoices
            </Link>
            ), a receipt is generated automatically. Use PDF for printing or the viewer for on-screen review.
          </p>
        </AlertDescription>
      </Alert>
      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load receipts</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" size="sm" className="w-fit shrink-0" onClick={() => void load()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {pdfError ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{pdfError}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receipts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.receiptNumber}</TableCell>
                  <TableCell className="text-muted-foreground">{formatReceiptDate(r.createdAt)}</TableCell>
                  <TableCell>
                    <Link href={`/invoices/${r.invoiceId}`} className="text-primary underline-offset-4 hover:underline">
                      View invoice
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">₹{r.grandTotal.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => void handlePdf(r.id)}>
                        PDF
                      </Button>
                      <Button type="button" size="sm" variant="ghost" asChild>
                        <Link href={`/documents?type=receipt&id=${encodeURIComponent(r.id)}`}>Viewer</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 && !loadError ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No receipts yet. Record a full payment on an invoice to see it listed here.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
