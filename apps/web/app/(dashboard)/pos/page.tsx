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
  Checkbox,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@repo/ui"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { usePortalCopy } from "@/hooks/use-portal-copy"
import { apiRequest } from "@/lib/api"
import { branchLabelMap, formatBranchLabel } from "@/lib/branch-label"
import { notifyError } from "@/lib/notify"
import { loadRazorpayScript, openRazorpayCheckout } from "@/lib/razorpay-checkout"

type ProductRow = {
  id: string
  name: string
  sku: string
  sellingPrice: number
  status: string
  barcode?: string
  genericName?: string
  variantMode?: "none" | "optional" | "required"
  batchTracking?: boolean
  serialTracking?: boolean
}
type CustomerRow = { id: string; name: string; phone?: string }
type CartLine = {
  productId: string
  variantId?: string
  name: string
  sku: string
  qty: number
  serialTracking?: boolean
  serialInput?: string
}

type VariantRow = { id: string; label: string; sku: string }

type PreviewLineStock =
  | { tracked: false }
  | { tracked: true; branchId: string; available: number | null; sufficient: boolean; requiresVariant?: boolean }

type PreviewRes = {
  grandTotal: number
  subtotal: number
  cgstTotal: number
  sgstTotal: number
  igstTotal: number
  lines: {
    productId: string
    variantId: string | null
    name: string
    sku: string
    lineTotal: number
    qty: number
    stock: PreviewLineStock
  }[]
}

type InvoiceRow = {
  id: string
  status: string
  grandTotal: number
  amountPaid: number
  invoiceNumber: string
}

type RazorpayCheckoutSession = {
  id: string
  channel: string
  checkout?: {
    keyId: string
    orderId: string
    amountPaise: number
    currency: string
    amount: number
  }
}

type VerifyRes = {
  payment: { id: string; status: string; providerRef: string }
  session: RazorpayCheckoutSession
}

type BranchDto = { code: string; name: string; status: string }

const stockBranchFromPreview = (lines: PreviewRes["lines"]): string => {
  const row = lines.find((l) => l.stock.tracked)
  return row?.stock.tracked ? row.stock.branchId : "main"
}

const cartLineKey = (l: CartLine): string => `${l.productId}:${l.variantId ?? ""}`

const isTrackedInsufficientLine = (
  l: PreviewRes["lines"][number],
): l is PreviewRes["lines"][number] & { stock: Extract<PreviewLineStock, { tracked: true }> } =>
  l.stock.tracked && !l.stock.sufficient

export default function PosPage() {
  const portalCopy = usePortalCopy()
  const searchParams = useSearchParams()
  const dispenseMode = searchParams.get("dispense") === "1"
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<ProductRow[]>([])
  const [inStockOnly, setInStockOnly] = useState(false)
  const [inStockIds, setInStockIds] = useState<Set<string>>(new Set())
  const [unavailOpen, setUnavailOpen] = useState(false)
  const [unavailName, setUnavailName] = useState("")
  const [unavailNote, setUnavailNote] = useState("")
  const [cart, setCart] = useState<CartLine[]>([])
  const [customerId, setCustomerId] = useState<string | undefined>()
  const [customerLabel, setCustomerLabel] = useState("Walk-in (no customer)")
  const [cq, setCq] = useState("")
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [notes, setNotes] = useState("")
  const [preview, setPreview] = useState<PreviewRes | null>(null)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [msg, setMsg] = useState("")
  const [msgVariant, setMsgVariant] = useState<"default" | "destructive">("default")
  const [productOpen, setProductOpen] = useState(false)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [barcode, setBarcode] = useState("")
  const [branchLabels, setBranchLabels] = useState<Map<string, string>>(new Map())
  const [razorpayBusy, setRazorpayBusy] = useState(false)
  const [verifyState, setVerifyState] = useState<"idle" | "pending" | "verified" | "error">("idle")
  const [payTab, setPayTab] = useState("cash")
  const [variantPickerOpen, setVariantPickerOpen] = useState(false)
  const [variantPickerProduct, setVariantPickerProduct] = useState<ProductRow | null>(null)
  const [variantList, setVariantList] = useState<VariantRow[]>([])

  const setFeedback = (text: string, variant: "default" | "destructive" = "default") => {
    setMsg(text)
    setMsgVariant(variant)
    if (variant === "destructive" && text.trim()) {
      notifyError(text)
    }
  }

  const loadProducts = useCallback(async () => {
    const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""
    const res = await apiRequest<ProductRow[]>(`/products${qs}`)
    if (res.success) setHits(res.data.filter((p) => p.status === "active"))
    else setHits([])
  }, [q])

  useEffect(() => {
    const t = setTimeout(() => void loadProducts(), 250)
    return () => clearTimeout(t)
  }, [loadProducts])

  const loadCustomers = useCallback(async () => {
    const qs = cq.trim() ? `?q=${encodeURIComponent(cq.trim())}` : ""
    const res = await apiRequest<CustomerRow[]>(`/customers${qs}`)
    if (res.success) setCustomers(res.data)
  }, [cq])

  useEffect(() => {
    const t = setTimeout(() => void loadCustomers(), 250)
    return () => clearTimeout(t)
  }, [loadCustomers])

  useEffect(() => {
    void (async () => {
      const res = await apiRequest<BranchDto[]>("/branches")
      if (res.success) setBranchLabels(branchLabelMap(res.data))
    })()
  }, [])

  useEffect(() => {
    if (!dispenseMode || !inStockOnly) {
      setInStockIds(new Set())
      return
    }
    void (async () => {
      const res = await apiRequest<{ productIds: string[] }>("/pos/in-stock-product-ids")
      if (res.success) setInStockIds(new Set(res.data.productIds))
    })()
  }, [dispenseMode, inStockOnly])

  const displayHits = useMemo(() => {
    if (!dispenseMode || !inStockOnly) return hits
    return hits.filter((p) => inStockIds.has(p.id))
  }, [hits, dispenseMode, inStockOnly, inStockIds])

  const handleAddToCart = (p: ProductRow, variant?: VariantRow) => {
    const line: CartLine = {
      productId: p.id,
      variantId: variant?.id,
      name: variant ? `${p.name} (${variant.label})` : p.name,
      sku: variant?.sku ?? p.sku,
      qty: 1,
      serialTracking: p.serialTracking === true,
      serialInput: "",
    }
    setCart((c) => {
      const k = cartLineKey(line)
      const i = c.findIndex((x) => cartLineKey(x) === k)
      if (i >= 0) {
        const n = [...c]
        n[i] = { ...n[i], qty: n[i].qty + 1 }
        return n
      }
      return [...c, line]
    })
    setPreview(null)
    setFeedback("")
  }

  const handleChooseProduct = async (p: ProductRow) => {
    if (p.variantMode === "required") {
      const res = await apiRequest<VariantRow[]>(`/products/${p.id}/variants`)
      if (!res.success) {
        setFeedback(res.error.message, "destructive")
        return
      }
      if (res.data.length === 0) {
        setFeedback("This product requires a variant, but none exist yet. Add variants on the product page.", "destructive")
        return
      }
      setVariantPickerProduct(p)
      setVariantList(res.data)
      setVariantPickerOpen(true)
      return
    }
    handleAddToCart(p)
  }

  const handleQtyChange = (key: string, raw: string) => {
    const qty = Number.parseInt(raw, 10)
    if (Number.isNaN(qty) || qty < 1) {
      setCart((c) => c.filter((x) => cartLineKey(x) !== key))
    } else {
      setCart((c) => c.map((x) => (cartLineKey(x) === key ? { ...x, qty } : x)))
    }
    setPreview(null)
  }

  const handleSerialInputChange = (key: string, value: string) => {
    setCart((c) => c.map((x) => (cartLineKey(x) === key ? { ...x, serialInput: value } : x)))
    setPreview(null)
  }

  const handleBarcodeSubmit = async () => {
    const code = barcode.trim()
    if (!code) return
    setQ(code)
    const path = `/products?q=${encodeURIComponent(code)}`
    const r2 = await apiRequest<ProductRow[]>(path)
    if (!r2.success) {
      setFeedback(r2.error.message, "destructive")
      return
    }
    const active = r2.data.filter((p) => p.status === "active")
    if (active.length === 1) {
      void handleChooseProduct(active[0]!)
      setBarcode("")
      setFeedback(`Added ${active[0]!.name}`)
      return
    }
    setHits(active)
    setProductOpen(true)
    setFeedback(active.length === 0 ? "No product match for barcode / code" : "Pick a product from the list")
  }

  const linesFromCart = () =>
    cart.map((l) => ({
      productId: l.productId,
      qty: l.qty,
      variantId: l.variantId,
      serialNumbers:
        l.serialTracking && l.serialInput?.trim()
          ? l.serialInput
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
    }))

  const handlePreview = async () => {
    if (cart.length === 0) return
    const lines = linesFromCart()
    const res = await apiRequest<PreviewRes>("/pos/preview", {
      method: "POST",
      body: JSON.stringify({ lines }),
    })
    if (!res.success) {
      setFeedback(res.error.message, "destructive")
      return
    }
    setPreview(res.data)
    setFeedback("")
  }

  const handleNewSale = () => {
    setCart([])
    setCustomerId(undefined)
    setCustomerLabel("Walk-in (no customer)")
    setNotes("")
    setPreview(null)
    setInvoiceId(null)
    setInvoice(null)
    setQrDataUrl(null)
    setBarcode("")
    setVerifyState("idle")
    setPayTab("cash")
    setVariantPickerOpen(false)
    setVariantPickerProduct(null)
    setVariantList([])
    setFeedback("New sale")
  }

  const refreshInvoice = useCallback(async () => {
    if (!invoiceId) return
    const res = await apiRequest<InvoiceRow>(`/invoices/${invoiceId}`)
    if (res.success) setInvoice(res.data)
  }, [invoiceId])

  const handleSaveDraft = async () => {
    if (cart.length === 0) return
    const lines = linesFromCart()
    const res = await apiRequest<InvoiceRow>("/invoices", {
      method: "POST",
      body: JSON.stringify({
        lines,
        customerId: customerId || undefined,
        notes: notes || undefined,
      }),
    })
    if (!res.success) {
      setFeedback(res.error.message, "destructive")
      return
    }
    setInvoiceId(res.data.id)
    setInvoice(res.data)
    setFeedback("Draft saved")
  }

  const handleUpdateDraft = async () => {
    if (!invoiceId || cart.length === 0) return
    const lines = linesFromCart()
    const res = await apiRequest<InvoiceRow>(`/invoices/${invoiceId}`, {
      method: "PATCH",
      body: JSON.stringify({
        lines,
        customerId: customerId ?? null,
        notes,
      }),
    })
    if (!res.success) {
      setFeedback(res.error.message, "destructive")
      return
    }
    setInvoice(res.data)
    setFeedback("Draft updated")
  }

  const handleComplete = async () => {
    if (!invoiceId) return
    const res = await apiRequest<InvoiceRow>(`/invoices/${invoiceId}/complete`, { method: "POST" })
    if (!res.success) {
      setFeedback(res.error.message, "destructive")
      return
    }
    setInvoice(res.data)
    setFeedback(`Completed ${res.data.invoiceNumber}`)
    setQrDataUrl(null)
  }

  const ensureInvoiceCompleted = async (): Promise<InvoiceRow | null> => {
    if (!invoiceId || !invoice) return null
    if (invoice.status === "completed") return invoice
    if (invoice.status !== "draft") return null
    const c = await apiRequest<InvoiceRow>(`/invoices/${invoiceId}/complete`, { method: "POST" })
    if (!c.success) {
      setFeedback(c.error.message, "destructive")
      return null
    }
    setInvoice(c.data)
    setFeedback(`Completed ${c.data.invoiceNumber}`)
    return c.data
  }

  const handleCashPay = async () => {
    if (!invoiceId || !invoice) return
    const inv = await ensureInvoiceCompleted()
    if (!inv || inv.status !== "completed") return
    const remaining = Math.round((inv.grandTotal - inv.amountPaid) * 100) / 100
    if (remaining <= 0) {
      setFeedback("Already paid")
      return
    }
    const res = await apiRequest<{ id: string }>("/payments", {
      method: "POST",
      body: JSON.stringify({ invoiceId, amount: remaining, method: "cash" }),
    })
    if (!res.success) {
      setFeedback(res.error.message, "destructive")
      return
    }
    await refreshInvoice()
    setFeedback("Cash payment recorded")
  }

  const handleQr = async () => {
    if (!invoiceId || !invoice) return
    const inv = await ensureInvoiceCompleted()
    if (!inv || inv.status !== "completed") return
    const res = await apiRequest<{ dataUrl: string }>("/qr-sessions", {
      method: "POST",
      body: JSON.stringify({ invoiceId }),
    })
    if (!res.success) {
      setFeedback(res.error.message, "destructive")
      return
    }
    setQrDataUrl(res.data.dataUrl)
    setFeedback("Scan QR to pay remaining balance")
  }

  const handleCardPay = async () => {
    if (!invoiceId || !invoice) return
    const inv = await ensureInvoiceCompleted()
    if (!inv || inv.status !== "completed") return
    const rem = Math.round((inv.grandTotal - inv.amountPaid) * 100) / 100
    if (rem <= 0) {
      setFeedback("Already paid")
      return
    }
    const res = await apiRequest<{ id: string }>("/payments", {
      method: "POST",
      body: JSON.stringify({ invoiceId, amount: rem, method: "card_offline" }),
    })
    if (!res.success) {
      setFeedback(res.error.message, "destructive")
      return
    }
    await refreshInvoice()
    setFeedback("Card / offline payment recorded")
  }

  const handleRazorpayCheckout = async () => {
    if (!invoiceId || !invoice) return
    setRazorpayBusy(true)
    setVerifyState("idle")
    try {
      const inv = await ensureInvoiceCompleted()
      if (!inv || inv.status !== "completed") return
      const rem = Math.round((inv.grandTotal - inv.amountPaid) * 100) / 100
      if (rem <= 0) {
        setFeedback("Already paid")
        return
      }
      const res = await apiRequest<RazorpayCheckoutSession>("/payments/razorpay/checkout-session", {
        method: "POST",
        body: JSON.stringify({ invoiceId }),
      })
      if (!res.success) {
        setFeedback(res.error.message, "destructive")
        return
      }
      const session = res.data
      const ck = session.checkout
      if (!ck?.keyId || !ck.orderId) {
        setFeedback(
          "Razorpay Checkout unavailable. Set gateway to Razorpay, add key ID in Settings → Gateway, and configure RAZORPAY_KEY_SECRET on the API server.",
          "destructive",
        )
        return
      }
      await loadRazorpayScript()
      openRazorpayCheckout({
        keyId: ck.keyId,
        orderId: ck.orderId,
        amountPaise: ck.amountPaise,
        currency: ck.currency,
        businessName: "Store",
        description: `Invoice ${inv.invoiceNumber || invoiceId}`,
        onSuccess: async (r) => {
          setVerifyState("pending")
          const v = await apiRequest<VerifyRes>("/payments/razorpay/verify", {
            method: "POST",
            body: JSON.stringify({
              sessionId: session.id,
              razorpay_order_id: r.razorpay_order_id,
              razorpay_payment_id: r.razorpay_payment_id,
              razorpay_signature: r.razorpay_signature,
            }),
          })
          if (!v.success) {
            setVerifyState("error")
            setFeedback(v.error.message, "destructive")
            return
          }
          setVerifyState("verified")
          await refreshInvoice()
          setFeedback("Razorpay payment verified. Webhook will reconcile if delayed.")
        },
        onDismiss: () => {
          setFeedback("Checkout closed without payment")
        },
      })
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "Razorpay failed"
      setFeedback(m, "destructive")
    } finally {
      setRazorpayBusy(false)
    }
  }

  const handleReceipt = async () => {
    if (!invoiceId) return
    const res = await apiRequest<{ receiptNumber: string }>("/receipts", {
      method: "POST",
      body: JSON.stringify({ invoiceId }),
    })
    if (!res.success) {
      setFeedback(res.error.message, "destructive")
      return
    }
    setFeedback(`Receipt ${res.data.receiptNumber} issued`)
  }

  const handleLogUnavailable = async () => {
    const name = unavailName.trim()
    if (!name) {
      setFeedback("Enter a medicine name", "destructive")
      return
    }
    const res = await apiRequest<{ id: string }>("/pharmacy/unavailable-medicines", {
      method: "POST",
      body: JSON.stringify({ requestedName: name, note: unavailNote.trim() || undefined }),
    })
    if (!res.success) {
      setFeedback(res.error.message, "destructive")
      return
    }
    setUnavailOpen(false)
    setUnavailName("")
    setUnavailNote("")
    setFeedback("Logged unavailable request for purchasing")
  }

  const remaining =
    invoice && (invoice.status === "completed" || invoice.status === "draft")
      ? Math.max(0, Math.round((invoice.grandTotal - invoice.amountPaid) * 100) / 100)
      : 0
  const canPayOrQr = Boolean(
    invoiceId && invoice && (invoice.status === "completed" || invoice.status === "draft") && remaining > 0,
  )
  const canIssueReceipt = Boolean(
    invoice?.status === "completed" && invoice.amountPaid + 0.001 >= invoice.grandTotal,
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{portalCopy.posScreenTitle}</h1>
          <p className="text-sm text-muted-foreground">
            Save a draft, then complete the sale. Payments (cash, card, UPI QR, or Razorpay Checkout) finalize the invoice if it is still a draft. Razorpay is verified on the server; webhooks reconcile the source of truth.
          </p>
          {dispenseMode ? (
            <div className="mt-3 flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="pos-in-stock-only"
                  checked={inStockOnly}
                  onCheckedChange={(v) => setInStockOnly(v === true)}
                />
                <Label htmlFor="pos-in-stock-only" className="cursor-pointer text-sm font-normal">
                  Show in-stock products only (this branch)
                </Label>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setUnavailOpen(true)}>
                Log unavailable medicine
              </Button>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={handleNewSale}>
            New sale
          </Button>
          <Button type="button" variant="secondary" asChild>
            <Link href="/invoices">{portalCopy.billingScreenTitle}</Link>
          </Button>
        </div>
      </div>

      {msg ? (
        <Alert variant={msgVariant === "destructive" ? "destructive" : "default"}>
          {msgVariant === "destructive" ? <AlertTitle>Error</AlertTitle> : null}
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Products</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="pos-barcode">Barcode / quick code</Label>
                <Input
                  id="pos-barcode"
                  placeholder="Scan or type, press Enter"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleBarcodeSubmit()
                  }}
                  autoComplete="off"
                />
              </div>
            </div>
            <Popover open={productOpen} onOpenChange={setProductOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="secondary" className="w-full justify-between">
                  <span>Search & add product</span>
                  <span className="text-xs text-muted-foreground">⌘K-style</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(100vw-2rem,28rem)] p-0" align="start">
                <Command shouldFilter={false} className="rounded-lg border-0 shadow-none">
                  <CommandInput placeholder="Name, SKU, or barcode…" value={q} onValueChange={setQ} />
                  <CommandList>
                    <CommandEmpty>{q.trim() ? "No products found." : "Type to search products."}</CommandEmpty>
                    <CommandGroup heading="Results">
                      {displayHits.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={`${p.id}-${p.name}-${p.sku}-${p.genericName ?? ""}`}
                          onSelect={() => {
                            void handleChooseProduct(p)
                            setProductOpen(false)
                          }}
                        >
                          <div className="flex flex-1 flex-col gap-0.5 text-left">
                            <span className="font-medium">{p.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {p.sku}
                              {p.barcode ? ` · ${p.barcode}` : ""}
                              {p.genericName ? ` · Generic: ${p.genericName}` : ""} · ₹{p.sellingPrice.toFixed(2)}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-start text-left font-normal">
                  {customerLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="start">
                <Command shouldFilter={false} className="rounded-lg border-0 shadow-none">
                  <CommandInput placeholder="Search customers…" value={cq} onValueChange={setCq} />
                  <CommandList>
                    <CommandEmpty>{cq.trim() ? "No customers." : "Type to search."}</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="walk-in"
                        onSelect={() => {
                          setCustomerId(undefined)
                          setCustomerLabel("Walk-in (no customer)")
                          setCustomerOpen(false)
                        }}
                      >
                        Walk-in
                      </CommandItem>
                      {customers.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.id}-${c.name}`}
                          onSelect={() => {
                            setCustomerId(c.id)
                            setCustomerLabel(`${c.name}${c.phone ? ` · ${c.phone}` : ""}`)
                            setCustomerOpen(false)
                          }}
                        >
                          <div className="flex flex-col text-left">
                            <span>{c.name}</span>
                            {c.phone ? <span className="text-xs text-muted-foreground">{c.phone}</span> : null}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <div className="space-y-1">
              <Label htmlFor="pos-notes">Notes</Label>
              <Textarea id="pos-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base">Cart</CardTitle>
          {invoice ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{invoice.status}</Badge>
              {invoice.invoiceNumber ? <span className="text-muted-foreground">#{invoice.invoiceNumber}</span> : null}
              <span className="text-muted-foreground">Due: ₹{remaining.toFixed(2)}</span>
              {verifyState === "pending" ? (
                <Badge
                  variant="outline"
                  className="border-warning/55 bg-warning/10 text-warning-foreground hover:bg-warning/15"
                >
                  Verifying…
                </Badge>
              ) : null}
              {verifyState === "verified" ? (
                <Badge variant="default" className="bg-success text-success-foreground hover:bg-success/90">
                  Razorpay verified
                </Badge>
              ) : null}
              {verifyState === "error" ? (
                <Badge variant="destructive">Verify failed</Badge>
              ) : null}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="w-24">Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cart.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground">
                    Add products to start
                  </TableCell>
                </TableRow>
              ) : (
                cart.map((l) => (
                  <TableRow key={cartLineKey(l)}>
                    <TableCell>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">{l.sku}</div>
                      {l.serialTracking ? (
                        <div className="mt-2 space-y-1">
                          <Label className="text-xs">Serial numbers (comma-separated, count must match qty)</Label>
                          <Input
                            className="h-8 font-mono text-xs"
                            value={l.serialInput ?? ""}
                            onChange={(e) => handleSerialInputChange(cartLineKey(l), e.target.value)}
                            placeholder="SN001, SN002"
                            aria-label={`Serial numbers for ${l.name}`}
                          />
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 w-20"
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) => handleQtyChange(cartLineKey(l), e.target.value)}
                        aria-label={`Quantity for ${l.name}`}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <Separator />

          {preview ? (
            <div className="space-y-3 text-sm">
              {preview.lines.some((l) => l.stock.tracked && !l.stock.sufficient) ? (
                <Alert variant="destructive">
                  <AlertTitle>Stock blocking checkout</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>
                      Completing or paying will fail until each tracked line has enough stock at{" "}
                      <span className="font-medium">
                        {formatBranchLabel(stockBranchFromPreview(preview.lines), branchLabels)}
                      </span>{" "}
                      <span className="font-mono text-xs">({stockBranchFromPreview(preview.lines)})</span>. Add stock in
                      Inventory, disable tracking on the product, or allow negative stock in Settings.
                    </p>
                    <ul className="list-inside list-disc text-xs">
                      {preview.lines.filter(isTrackedInsufficientLine).map((l) => (
                        <li key={`${l.productId}-${l.variantId ?? ""}`}>
                          {l.name} — need {l.qty}, available{" "}
                          {l.stock.available === null ? "no stock row" : l.stock.available}
                          {l.stock.requiresVariant ? " · pick a variant" : ""}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button type="button" variant="outline" size="sm" asChild>
                        <Link href="/inventory">Inventory</Link>
                      </Button>
                      <Button type="button" variant="outline" size="sm" asChild>
                        <Link href="/branches">Branches</Link>
                      </Button>
                      <Button type="button" variant="outline" size="sm" asChild>
                        <Link href="/settings">Settings</Link>
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : null}
              {preview.lines.some((l) => l.stock.tracked) ? (
                <p className="text-xs text-muted-foreground">
                  Stock for tracked lines is checked at{" "}
                  <span className="font-medium text-foreground">
                    {formatBranchLabel(stockBranchFromPreview(preview.lines), branchLabels)}
                  </span>{" "}
                  <span className="font-mono">({stockBranchFromPreview(preview.lines)})</span>. Set the default under Settings →
                  Inventory, or manage names in{" "}
                  <Link href="/branches" className="text-primary underline-offset-4 hover:underline">
                    Branches
                  </Link>
                  .
                </p>
              ) : null}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₹{preview.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>GST</span>
                  <span>
                    CGST {preview.cgstTotal.toFixed(2)} · SGST {preview.sgstTotal.toFixed(2)} · IGST{" "}
                    {preview.igstTotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <span>Total</span>
                  <span>₹{preview.grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={handlePreview} disabled={cart.length === 0}>
              Preview totals
            </Button>
            <Button type="button" onClick={handleSaveDraft} disabled={cart.length === 0}>
              Save draft
            </Button>
            <Button type="button" variant="outline" onClick={handleUpdateDraft} disabled={!invoiceId || cart.length === 0}>
              Update draft
            </Button>
            <Button type="button" onClick={handleComplete} disabled={!invoiceId || invoice?.status !== "draft"}>
              Complete
            </Button>
            <Tabs value={payTab} onValueChange={setPayTab} className="w-full">
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
                <TabsTrigger value="cash" className="text-xs sm:text-sm">
                  Cash
                </TabsTrigger>
                <TabsTrigger value="card" className="text-xs sm:text-sm">
                  Card / offline
                </TabsTrigger>
                <TabsTrigger value="qr" className="text-xs sm:text-sm">
                  UPI QR
                </TabsTrigger>
                <TabsTrigger value="rzp" className="text-xs sm:text-sm">
                  Razorpay
                </TabsTrigger>
              </TabsList>
              <TabsContent value="cash" className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">Records full remaining balance as cash tender.</p>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={handleCashPay}
                  disabled={!canPayOrQr}
                  title={invoice?.status === "draft" ? "Finalizes the invoice, then records full cash payment" : undefined}
                >
                  Pay cash (full)
                </Button>
              </TabsContent>
              <TabsContent value="card" className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">Terminal or manual card / UPI collected outside Razorpay Checkout.</p>
                <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={handleCardPay} disabled={!canPayOrQr}>
                  Record card / offline (full)
                </Button>
              </TabsContent>
              <TabsContent value="qr" className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">Static UPI QR or Razorpay order payload encoded as QR when configured.</p>
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={handleQr} disabled={!canPayOrQr}>
                  Show payment QR
                </Button>
              </TabsContent>
              <TabsContent value="rzp" className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Opens Razorpay Checkout. Signature is verified on the API; duplicate webhooks are ignored safely.
                </p>
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={() => void handleRazorpayCheckout()}
                  disabled={!canPayOrQr || razorpayBusy}
                >
                  {razorpayBusy ? "Opening…" : "Pay with Razorpay"}
                </Button>
              </TabsContent>
            </Tabs>
            <Button type="button" variant="outline" onClick={handleReceipt} disabled={!invoiceId || !canIssueReceipt}>
              Issue receipt
            </Button>
          </div>

          <Dialog
            open={variantPickerOpen}
            onOpenChange={(open) => {
              setVariantPickerOpen(open)
              if (!open) {
                setVariantPickerProduct(null)
                setVariantList([])
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Choose variant</DialogTitle>
                <DialogDescription>
                  {variantPickerProduct ? `${variantPickerProduct.name} — pick a SKU variant for this line.` : "Pick a SKU variant for this line."}
                </DialogDescription>
              </DialogHeader>
              <div className="flex max-h-72 flex-col gap-2 overflow-y-auto py-2">
                {variantList.map((v) => (
                  <Button
                    key={v.id}
                    type="button"
                    variant="outline"
                    className="h-auto justify-start py-3 text-left"
                    onClick={() => {
                      if (!variantPickerProduct) return
                      handleAddToCart(variantPickerProduct, v)
                      setVariantPickerOpen(false)
                      setVariantPickerProduct(null)
                      setVariantList([])
                    }}
                  >
                    <span className="block font-medium">{v.label}</span>
                    <span className="block text-xs text-muted-foreground">{v.sku}</span>
                  </Button>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          {qrDataUrl ? (
            <Card className="border-dashed bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Payment QR</CardTitle>
              </CardHeader>
              <CardContent>
                <Image
                  src={qrDataUrl}
                  alt="Payment QR code"
                  width={192}
                  height={192}
                  unoptimized
                  className="h-48 w-48 rounded-md border bg-white p-1 shadow-sm"
                />
              </CardContent>
            </Card>
          ) : null}
        </CardContent>
      </Card>

      <Sheet open={unavailOpen} onOpenChange={setUnavailOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Unavailable medicine</SheetTitle>
            <SheetDescription>Capture demand when an item is out of stock or not in the catalog.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="unavail-name">Name</Label>
              <Input
                id="unavail-name"
                value={unavailName}
                onChange={(e) => setUnavailName(e.target.value)}
                placeholder="Medicine or generic name"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unavail-note">Note (optional)</Label>
              <Textarea
                id="unavail-note"
                value={unavailNote}
                onChange={(e) => setUnavailNote(e.target.value)}
                rows={2}
                placeholder="Strength, pack size, patient context…"
              />
            </div>
          </div>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setUnavailOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleLogUnavailable()}>
              Save request
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
