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
  CardHeader,
  CardTitle,
  Form,
  FormControl,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { apiRequest } from "@/lib/api"
import { notifyError } from "@/lib/notify"

type RefundRow = {
  id: string
  refundNumber: string
  invoiceId: string
  amount: number
  status: string
  reason: string
}

type RefundBanner = { message: string; variant: "default" | "destructive" }

type InvoiceOption = {
  id: string
  invoiceNumber: string
  status: string
  grandTotal: number
  amountPaid: number
}

type PaymentOption = {
  id: string
  amount: number
  method: string
  status: string
}

const createSchema = z.object({
  invoiceId: z.string().min(1, "Select an invoice"),
  paymentId: z.string().optional(),
  amount: z.coerce.number().positive(),
  reason: z.string().optional(),
})

const invoiceLabel = (inv: InvoiceOption) =>
  `${inv.invoiceNumber || "—"} · ${inv.status} · ₹${inv.grandTotal.toFixed(2)} paid ₹${inv.amountPaid.toFixed(2)}`

const paymentLabel = (p: PaymentOption) =>
  `${p.method.replaceAll("_", " ")} · ₹${p.amount.toFixed(2)} · ${p.status}`

export default function RefundsPage() {
  const [rows, setRows] = useState<RefundRow[]>([])
  const [open, setOpen] = useState(false)
  const [banner, setBanner] = useState<RefundBanner | null>(null)
  const [invoices, setInvoices] = useState<InvoiceOption[]>([])
  const [payments, setPayments] = useState<PaymentOption[]>([])

  const load = useCallback(async () => {
    const res = await apiRequest<RefundRow[]>("/refunds")
    if (res.success) setRows(res.data)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { invoiceId: "", paymentId: "", amount: 0, reason: "" },
  })

  const invoiceIdWatch = form.watch("invoiceId")

  useEffect(() => {
    if (!open) return
    void (async () => {
      const res = await apiRequest<InvoiceOption[]>("/invoices")
      if (res.success) {
        setInvoices(res.data)
      }
    })()
  }, [open])

  useEffect(() => {
    if (!invoiceIdWatch) {
      setPayments([])
      form.setValue("paymentId", "")
      return
    }
    void (async () => {
      const res = await apiRequest<PaymentOption[]>(`/payments?invoiceId=${encodeURIComponent(invoiceIdWatch)}`)
      if (res.success) {
        setPayments(res.data)
        form.setValue("paymentId", "")
      } else {
        setPayments([])
      }
    })()
  }, [invoiceIdWatch, form])

  const handleCreate = form.handleSubmit(async (values) => {
    const res = await apiRequest<RefundRow>("/refunds", {
      method: "POST",
      body: JSON.stringify({
        invoiceId: values.invoiceId,
        paymentId: values.paymentId?.trim() ? values.paymentId.trim() : undefined,
        amount: values.amount,
        reason: values.reason || undefined,
      }),
    })
    if (!res.success) {
      setBanner({ message: res.error.message, variant: "destructive" })
      notifyError(res.error.message)
      return
    }
    setOpen(false)
    form.reset({ invoiceId: "", paymentId: "", amount: 0, reason: "" })
    setPayments([])
    setBanner({ message: `Refund ${res.data.refundNumber} created (pending)`, variant: "default" })
    await load()
  })

  const handleComplete = async (id: string) => {
    const res = await apiRequest<RefundRow>(`/refunds/${id}/complete`, { method: "POST", body: JSON.stringify({}) })
    if (!res.success) {
      setBanner({ message: res.error.message, variant: "destructive" })
      notifyError(res.error.message)
      return
    }
    setBanner({ message: "Refund completed", variant: "default" })
    await load()
  }

  const sortedInvoices = [...invoices].sort((a, b) => (a.invoiceNumber || "").localeCompare(b.invoiceNumber || ""))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Refunds</h1>
          <p className="text-sm text-muted-foreground">Caps against paid amounts; completes adjust invoice balance.</p>
        </div>
        <Button type="button" onClick={() => setOpen(true)}>
          New refund
        </Button>
      </div>
      {banner ? (
        <Alert variant={banner.variant === "destructive" ? "destructive" : "default"}>
          {banner.variant === "destructive" ? <AlertTitle>Error</AlertTitle> : null}
          <AlertDescription>{banner.message}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Refunds</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.refundNumber}</TableCell>
                  <TableCell>
                    <Button variant="link" className="h-auto p-0" asChild>
                      <Link href={`/refunds/${r.id}`}>View</Link>
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Link href={`/invoices/${r.invoiceId}`} className="text-primary underline-offset-4 hover:underline">
                      Open
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "completed" ? "default" : "secondary"}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">₹{r.amount.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Button type="button" size="sm" variant="outline" disabled={r.status !== "pending"} onClick={() => void handleComplete(r.id)}>
                      Complete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No refunds yet.</p> : null}
        </CardContent>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Create refund</SheetTitle>
            <SheetDescription>Record a refund against an invoice and optional payment.</SheetDescription>
          </SheetHeader>
          <Form {...form}>
            <form onSubmit={handleCreate} className="flex flex-1 flex-col gap-4 py-4">
              <FormField
                control={form.control}
                name="invoiceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select invoice" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[min(24rem,70vh)]">
                        {sortedInvoices.map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {invoiceLabel(inv)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="paymentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment (optional)</FormLabel>
                    <Select
                      disabled={!invoiceIdWatch}
                      onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                      value={field.value ? field.value : "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={invoiceIdWatch ? "Link to a payment" : "Select invoice first"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">No specific payment</SelectItem>
                        {payments.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {paymentLabel(p)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    {invoiceIdWatch && payments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No payments on file for this invoice; leave as “No specific payment”.</p>
                    ) : null}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <SheetFooter>
                <Button type="submit">Create</Button>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
