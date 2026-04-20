"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
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
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { apiRequest } from "@/lib/api"
import { notifyError, notifySuccess } from "@/lib/notify"

type Product = {
  id: string
  name: string
  sku: string
  barcode: string
  categoryId: string | null
  gstSlabId: string | null
  taxMode: string
  sellingPrice: number
  costPrice: number
  mrp?: number
  status: string
  trackStock: boolean
  brand: string
  genericName?: string
  unit: string
  variantMode?: "none" | "optional" | "required"
  batchTracking?: boolean
  serialTracking?: boolean
}

type VariantDto = { id: string; label: string; sku: string; status: string }

type CategoryRow = { id: string; name: string }
type GstSlabRow = { id: string; name: string; cgstRate: number; sgstRate: number }
type BranchRow = { id: string; code: string; name: string; status: string }

const schema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().optional(),
  categoryId: z.string(),
  gstSlabId: z.string(),
  taxMode: z.enum(["inclusive", "exclusive"]),
  sellingPrice: z.coerce.number().nonnegative(),
  costPrice: z.coerce.number().nonnegative(),
  mrp: z.coerce.number().nonnegative().optional(),
  trackStock: z.boolean(),
  brand: z.string().optional(),
  genericName: z.string().optional(),
  unit: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  variantMode: z.enum(["none", "optional", "required"]),
  batchTracking: z.boolean(),
  serialTracking: z.boolean(),
}).refine((v) => !(v.batchTracking && v.serialTracking), {
  message: "Cannot enable both batch and serial tracking",
  path: ["serialTracking"],
})

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [gstSlabs, setGstSlabs] = useState<GstSlabRow[]>([])
  const [variants, setVariants] = useState<VariantDto[]>([])
  const [variantOpen, setVariantOpen] = useState(false)
  const [newVariantLabel, setNewVariantLabel] = useState("")
  const [newVariantSku, setNewVariantSku] = useState("")
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [batchCode, setBatchCode] = useState("")
  const [batchQty, setBatchQty] = useState(1)
  const [batchExpiry, setBatchExpiry] = useState("")
  const [batchBranch, setBatchBranch] = useState("main")
  const [batchVariantId, setBatchVariantId] = useState("")
  const [newSerial, setNewSerial] = useState("")
  const [serialVariantId, setSerialVariantId] = useState("")

  const load = useCallback(async () => {
    const res = await apiRequest<Product>(`/products/${params.id}`)
    if (res.success) setProduct(res.data)
    else router.replace("/products")
  }, [params.id, router])

  useEffect(() => {
    void load()
  }, [load])

  const loadVariants = useCallback(async () => {
    const res = await apiRequest<VariantDto[]>(`/products/${params.id}/variants`)
    if (res.success) setVariants(res.data)
  }, [params.id])

  useEffect(() => {
    void loadVariants()
  }, [loadVariants])

  useEffect(() => {
    void (async () => {
      const [cRes, gRes, bRes] = await Promise.all([
        apiRequest<CategoryRow[]>("/categories"),
        apiRequest<GstSlabRow[]>("/gst-slabs"),
        apiRequest<BranchRow[]>("/branches"),
      ])
      if (cRes.success) setCategories(cRes.data)
      if (gRes.success) setGstSlabs(gRes.data)
      if (bRes.success) {
        setBranches(bRes.data)
        const first = bRes.data.find((b) => b.status === "active") ?? bRes.data[0]
        if (first?.code) setBatchBranch(first.code)
      }
    })()
  }, [])

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      sku: "",
      barcode: "",
      categoryId: "__none__",
      gstSlabId: "__none__",
      taxMode: "exclusive",
      sellingPrice: 0,
      costPrice: 0,
      mrp: 0,
      trackStock: true,
      brand: "",
      genericName: "",
      unit: "",
      status: "active",
      variantMode: "none",
      batchTracking: false,
      serialTracking: false,
    },
  })

  useEffect(() => {
    if (!product) return
    form.reset({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode ?? "",
      categoryId: product.categoryId ?? "__none__",
      gstSlabId: product.gstSlabId ?? "__none__",
      taxMode: product.taxMode === "inclusive" ? "inclusive" : "exclusive",
      sellingPrice: product.sellingPrice,
      costPrice: product.costPrice,
      mrp: product.mrp ?? 0,
      trackStock: product.trackStock,
      brand: product.brand ?? "",
      genericName: product.genericName ?? "",
      unit: product.unit ?? "",
      status: product.status === "inactive" ? "inactive" : "active",
      variantMode: product.variantMode ?? "none",
      batchTracking: product.batchTracking === true,
      serialTracking: product.serialTracking === true,
    })
  }, [product, form])

  const handleSave = form.handleSubmit(async (values) => {
    const body = {
      name: values.name,
      sku: values.sku,
      barcode: values.barcode,
      categoryId: values.categoryId === "__none__" ? "" : values.categoryId,
      gstSlabId: values.gstSlabId === "__none__" ? "" : values.gstSlabId,
      taxMode: values.taxMode,
      sellingPrice: values.sellingPrice,
      costPrice: values.costPrice,
      mrp: values.mrp,
      trackStock: values.trackStock,
      brand: values.brand,
      genericName: values.genericName,
      unit: values.unit,
      status: values.status,
      variantMode: values.variantMode,
      batchTracking: values.batchTracking,
      serialTracking: values.serialTracking,
    }
    const res = await apiRequest<Product>(`/products/${params.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
    if (!res.success) {
      notifyError(res.error.message)
      return
    }
    setProduct(res.data)
    notifySuccess("Product saved")
  })

  const handleCreateVariant = async () => {
    const label = newVariantLabel.trim()
    const sku = newVariantSku.trim()
    if (!label || !sku) {
      notifyError("Enter label and SKU")
      return
    }
    const res = await apiRequest<VariantDto>(`/products/${params.id}/variants`, {
      method: "POST",
      body: JSON.stringify({ label, sku }),
    })
    if (!res.success) {
      notifyError(res.error.message)
      return
    }
    setNewVariantLabel("")
    setNewVariantSku("")
    setVariantOpen(false)
    void loadVariants()
    notifySuccess("Variant created")
  }

  const handleReceiveBatch = async () => {
    const code = batchCode.trim()
    if (!code) {
      notifyError("Batch code is required")
      return
    }
    if (batchQty < 1) {
      notifyError("Quantity must be at least 1")
      return
    }
    const body: Record<string, unknown> = {
      productId: params.id,
      branchId: batchBranch,
      batchCode: code,
      qty: batchQty,
    }
    if (batchExpiry.trim()) body.expiryDate = new Date(batchExpiry).toISOString()
    if (batchVariantId.trim()) body.variantId = batchVariantId.trim()
    const res = await apiRequest<{ id: string }>("/stock/batches/receive", {
      method: "POST",
      body: JSON.stringify(body),
    })
    if (!res.success) {
      notifyError(res.error.message)
      return
    }
    setBatchCode("")
    setBatchQty(1)
    setBatchExpiry("")
    notifySuccess("Stock received into batch")
  }

  const handleRegisterSerial = async () => {
    const sn = newSerial.trim()
    if (!sn) {
      notifyError("Enter a serial number")
      return
    }
    const body: Record<string, unknown> = { serialNumber: sn }
    if (serialVariantId.trim()) body.variantId = serialVariantId.trim()
    const res = await apiRequest<{ id: string }>(`/products/${params.id}/serials`, {
      method: "POST",
      body: JSON.stringify(body),
    })
    if (!res.success) {
      notifyError(res.error.message)
      return
    }
    setNewSerial("")
    notifySuccess("Serial registered")
  }

  if (!product) return null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/products">Back</Link>
      </Button>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>{product.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{product.sku}</p>
          </div>
          <Badge>{product.status}</Badge>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="barcode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Barcode</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
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
                name="gstSlabId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GST slab</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Slab" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {gstSlabs.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
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
                name="taxMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax mode</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="exclusive">Exclusive</SelectItem>
                        <SelectItem value="inclusive">Inclusive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sellingPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selling price</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="costPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost price</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mrp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>MRP</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="brand"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Brand</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="genericName"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Generic / pharmacological name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Paracetamol" autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="trackStock"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 sm:col-span-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                        aria-label="Track stock"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Track stock</FormLabel>
                      <FormDescription>
                        When on, sales and adjustments hit the inventory row on your default branch (Settings). Manage codes and display names under{" "}
                        <Link href="/branches" className="font-medium text-foreground underline-offset-4 hover:underline">
                          Branches & locations
                        </Link>{" "}
                        and levels under{" "}
                        <Link href="/inventory" className="font-medium text-foreground underline-offset-4 hover:underline">
                          Inventory
                        </Link>
                        .
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="variantMode"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Variant mode</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None (single SKU)</SelectItem>
                        <SelectItem value="optional">Optional variants</SelectItem>
                        <SelectItem value="required">Variants required at POS</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Set to optional or required before adding variants below. Changing mode after stock exists may need matching inventory rows per variant.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="batchTracking"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                        aria-label="Batch tracking"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Batch tracking</FormLabel>
                      <FormDescription>FEFO stock by batch code and expiry; cannot combine with serial tracking.</FormDescription>
                    </div>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="serialTracking"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                        aria-label="Serial tracking"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Serial tracking</FormLabel>
                      <FormDescription>Unique serial per unit at sale; cannot combine with batch tracking.</FormDescription>
                    </div>
                  </FormItem>
                )}
              />
              <div className="sm:col-span-2">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  Save
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variants</CardTitle>
          <p className="text-sm text-muted-foreground">
            Save the product with variant mode set to optional or required, then add SKUs here. POS will prompt when variants are required.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="secondary">{variants.length} variant(s)</Badge>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadVariants()}>
              Refresh list
            </Button>
            <Button type="button" size="sm" onClick={() => setVariantOpen(true)} disabled={product.variantMode === "none"}>
              Add variant
            </Button>
          </div>
          {variants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No variants yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.label}</TableCell>
                    <TableCell>{v.sku}</TableCell>
                    <TableCell>{v.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={variantOpen} onOpenChange={setVariantOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Add variant</SheetTitle>
            <SheetDescription>Create an additional SKU for this product (label and unique SKU).</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 py-6">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="nv-label">
                Label
              </label>
              <Input id="nv-label" value={newVariantLabel} onChange={(e) => setNewVariantLabel(e.target.value)} placeholder="e.g. 500 ml" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="nv-sku">
                SKU
              </label>
              <Input id="nv-sku" value={newVariantSku} onChange={(e) => setNewVariantSku(e.target.value)} placeholder="Unique per product" />
            </div>
          </div>
          <SheetFooter>
            <Button type="button" onClick={() => void handleCreateVariant()}>
              Create
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {product.batchTracking ? (
        <Card>
          <CardHeader>
            <CardTitle>Receive batch stock</CardTitle>
            <p className="text-sm text-muted-foreground">Creates a batch and increases on-hand for this product at the branch.</p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="batch-code">
                Batch code
              </label>
              <Input id="batch-code" value={batchCode} onChange={(e) => setBatchCode(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="batch-qty">
                Quantity
              </label>
              <Input id="batch-qty" type="number" min={1} value={batchQty} onChange={(e) => setBatchQty(Number(e.target.value) || 1)} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="batch-exp">
                Expiry (optional)
              </label>
              <Input id="batch-exp" type="date" value={batchExpiry} onChange={(e) => setBatchExpiry(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Branch</span>
              <Select value={batchBranch} onValueChange={setBatchBranch}>
                <SelectTrigger aria-label="Branch for receive">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {branches.length === 0 ? (
                    <SelectItem value="main">main</SelectItem>
                  ) : (
                    branches.map((b) => (
                      <SelectItem key={b.id} value={b.code}>
                        {b.name} ({b.code})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            {product.variantMode !== "none" ? (
              <div className="grid gap-2 sm:col-span-2">
                <label className="text-sm font-medium" htmlFor="batch-var">
                  Variant ID (optional)
                </label>
                <Input
                  id="batch-var"
                  value={batchVariantId}
                  onChange={(e) => setBatchVariantId(e.target.value)}
                  placeholder="Mongo id of variant row"
                />
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <Button type="button" onClick={() => void handleReceiveBatch()}>
                Receive into batch
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {product.serialTracking ? (
        <Card>
          <CardHeader>
            <CardTitle>Register serial</CardTitle>
            <p className="text-sm text-muted-foreground">Adds an available serial unit for this product before POS sale.</p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="serial-num">
                Serial number
              </label>
              <Input id="serial-num" value={newSerial} onChange={(e) => setNewSerial(e.target.value)} />
            </div>
            {product.variantMode !== "none" ? (
              <div className="grid gap-2 sm:col-span-2">
                <label className="text-sm font-medium" htmlFor="serial-var">
                  Variant ID (optional)
                </label>
                <Input id="serial-var" value={serialVariantId} onChange={(e) => setSerialVariantId(e.target.value)} />
              </div>
            ) : null}
            <Button type="button" className="w-fit" onClick={() => void handleRegisterSerial()}>
              Register
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
