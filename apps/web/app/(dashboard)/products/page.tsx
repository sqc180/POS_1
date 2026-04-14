"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { notifyError, notifySuccess } from "@/lib/notify"

type ProductRow = {
  id: string
  name: string
  sku: string
  internalCode?: string
  hsnSac?: string
  catalogLifecycle?: string
  sellingPrice: number
  status: string
  trackStock: boolean
  variantMode?: "none" | "optional" | "required"
  batchTracking?: boolean
  serialTracking?: boolean
}

type CategoryRow = { id: string; name: string }
type GstSlabRow = { id: string; name: string; cgstRate: number; sgstRate: number }

type PagedProducts = { items: ProductRow[]; total: number; skip: number; limit: number }

const schema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  internalCode: z.string().optional(),
  hsnSac: z.string().optional(),
  catalogLifecycle: z.enum(["active", "discontinued", "archived"]).optional(),
  barcode: z.string().optional(),
  categoryId: z.string().optional(),
  gstSlabId: z.string().optional(),
  taxMode: z.enum(["inclusive", "exclusive"]).optional(),
  sellingPrice: z.coerce.number().nonnegative(),
  costPrice: z.coerce.number().nonnegative().optional(),
  mrp: z.coerce.number().nonnegative().optional(),
  trackStock: z.boolean().optional(),
  brand: z.string().optional(),
  unit: z.string().optional(),
})

export default function ProductsPage() {
  const [rows, setRows] = useState<ProductRow[]>([])
  const [total, setTotal] = useState(0)
  const [skip, setSkip] = useState(0)
  const limit = 25
  const [q, setQ] = useState("")
  const [filterCategoryId, setFilterCategoryId] = useState<string>("__all__")
  const [filterLifecycle, setFilterLifecycle] = useState<string>("all")
  const [sortField, setSortField] = useState<"updatedAt" | "name" | "sku" | "sellingPrice">("updatedAt")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [open, setOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [gstSlabs, setGstSlabs] = useState<GstSlabRow[]>([])

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    params.set("paged", "true")
    params.set("limit", String(limit))
    params.set("skip", String(skip))
    if (q.trim()) params.set("q", q.trim())
    if (filterCategoryId !== "__all__") params.set("categoryId", filterCategoryId)
    if (filterLifecycle !== "all") params.set("catalogLifecycle", filterLifecycle)
    params.set("sort", sortField)
    params.set("order", sortOrder)
    const res = await apiRequest<PagedProducts>(`/products?${params.toString()}`)
    if (res.success) {
      setRows(res.data.items)
      setTotal(res.data.total)
      setLoadError(null)
    } else {
      setLoadError(res.error.message)
      notifyError(res.error.message)
    }
  }, [skip, q, filterCategoryId, filterLifecycle, sortField, sortOrder])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void (async () => {
      const cRes = await apiRequest<CategoryRow[]>("/categories")
      if (cRes.success) setCategories(cRes.data)
    })()
  }, [])

  useEffect(() => {
    setSkip(0)
  }, [q, filterCategoryId, filterLifecycle, sortField, sortOrder])

  useEffect(() => {
    if (!open) return
    void (async () => {
      const gRes = await apiRequest<GstSlabRow[]>("/gst-slabs")
      if (gRes.success) setGstSlabs(gRes.data)
    })()
  }, [open])

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      sku: "",
      internalCode: "",
      hsnSac: "",
      catalogLifecycle: "active",
      barcode: "",
      categoryId: "__none__",
      gstSlabId: "__none__",
      taxMode: "exclusive",
      sellingPrice: 0,
      costPrice: 0,
      mrp: 0,
      trackStock: true,
      brand: "",
      unit: "",
    },
  })

  const handleCreate = form.handleSubmit(async (values) => {
    const body = {
      ...values,
      categoryId: values.categoryId === "__none__" ? undefined : values.categoryId,
      gstSlabId: values.gstSlabId === "__none__" ? undefined : values.gstSlabId,
      taxMode: values.taxMode,
      barcode: values.barcode || undefined,
      internalCode: values.internalCode?.trim() || undefined,
      hsnSac: values.hsnSac?.trim() || undefined,
      catalogLifecycle: values.catalogLifecycle,
      brand: values.brand || undefined,
      unit: values.unit || undefined,
      trackStock: values.trackStock,
    }
    const res = await apiRequest<ProductRow>("/products", { method: "POST", body: JSON.stringify(body) })
    if (!res.success) {
      form.setError("root", { message: res.error.message })
      notifyError(res.error.message)
      return
    }
    setOpen(false)
    form.reset()
    notifySuccess("Product created")
    await load()
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Products</h1>
          <p className="text-sm text-muted-foreground">SKU, barcode-ready, GST mapping, category, and stock flag.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Input placeholder="Search name / SKU / barcode / HSN" value={q} onChange={(e) => setQ(e.target.value)} className="sm:w-64" />
          <Select value={filterCategoryId} onValueChange={setFilterCategoryId}>
            <SelectTrigger className="sm:w-48" aria-label="Filter by category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterLifecycle} onValueChange={setFilterLifecycle}>
            <SelectTrigger className="sm:w-44" aria-label="Filter by lifecycle">
              <SelectValue placeholder="Lifecycle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lifecycles</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="discontinued">Discontinued</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortField} onValueChange={(v) => setSortField(v as typeof sortField)}>
            <SelectTrigger className="sm:w-44" aria-label="Sort by">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt">Updated</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="sku">SKU</SelectItem>
              <SelectItem value="sellingPrice">Price</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as typeof sortOrder)}>
            <SelectTrigger className="sm:w-36" aria-label="Sort order">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Desc</SelectItem>
              <SelectItem value="asc">Asc</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setOpen(true)}>New product</Button>
        </div>
      </div>
      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex flex-col sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New product</SheetTitle>
          </SheetHeader>
          <Form {...form}>
            <form onSubmit={handleCreate} className="flex flex-1 flex-col gap-3 overflow-y-auto py-4">
              {form.formState.errors.root ? (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
                </Alert>
              ) : null}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
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
                name="internalCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Internal code</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hsnSac"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>HSN / SAC</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="catalogLifecycle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Catalog lifecycle</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="discontinued">Discontinued</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
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
                          <SelectValue placeholder="Select category" />
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
                          <SelectValue placeholder="Select slab" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {gstSlabs.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name} (CGST {g.cgstRate}% / SGST {g.sgstRate}%)
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
              {(["sellingPrice", "costPrice", "mrp"] as const).map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="capitalize">{name.replace("Price", " price")}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              {(["brand", "unit"] as const).map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="capitalize">{name}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <FormField
                control={form.control}
                name="trackStock"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                        aria-label="Track stock"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Track stock</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Creates an inventory row on the default branch from settings when enabled. Define shops and warehouses under{" "}
                        <Link href="/branches" className="font-medium text-foreground underline-offset-4 hover:underline">
                          Branches & locations
                        </Link>
                        .
                      </p>
                    </div>
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
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>HSN</TableHead>
              <TableHead>Lifecycle</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <span className="block">{p.name}</span>
                  {p.variantMode && p.variantMode !== "none" ? (
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      Variants: {p.variantMode}
                      {p.batchTracking ? " · Batch" : ""}
                      {p.serialTracking ? " · Serial" : ""}
                    </span>
                  ) : p.batchTracking || p.serialTracking ? (
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {[p.batchTracking ? "Batch" : null, p.serialTracking ? "Serial" : null].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm">{p.sku}</span>
                  {p.internalCode ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">Int: {p.internalCode}</span>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-sm">{p.hsnSac || "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{p.catalogLifecycle ?? "active"}</Badge>
                </TableCell>
                <TableCell>₹{p.sellingPrice.toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant={p.trackStock ? "secondary" : "outline"}>{p.trackStock ? "Tracked" : "No stock"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" aria-label={`Actions for ${p.name}`}>
                        Actions
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Product</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href={`/products/${p.id}`}>View details</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          void navigator.clipboard.writeText(p.id).then(() => notifySuccess("ID copied to clipboard"))
                        }}
                      >
                        Copy product ID
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
          <span>
            {total === 0 ? "No products" : `Showing ${skip + 1}–${Math.min(skip + rows.length, total)} of ${total}`}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={skip === 0} onClick={() => setSkip((s) => Math.max(0, s - limit))}>
              Previous
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={skip + limit >= total} onClick={() => setSkip((s) => s + limit)}>
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
