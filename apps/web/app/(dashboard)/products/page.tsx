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
  sellingPrice: number
  status: string
  trackStock: boolean
}

type CategoryRow = { id: string; name: string }
type GstSlabRow = { id: string; name: string; cgstRate: number; sgstRate: number }

const schema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
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
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [gstSlabs, setGstSlabs] = useState<GstSlabRow[]>([])

  const load = useCallback(async () => {
    const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""
    const res = await apiRequest<ProductRow[]>(`/products${qs}`)
    if (res.success) {
      setRows(res.data)
      setLoadError(null)
    } else {
      setLoadError(res.error.message)
      notifyError(res.error.message)
    }
  }, [q])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!open) return
    void (async () => {
      const [cRes, gRes] = await Promise.all([
        apiRequest<CategoryRow[]>("/categories"),
        apiRequest<GstSlabRow[]>("/gst-slabs"),
      ])
      if (cRes.success) setCategories(cRes.data)
      if (gRes.success) setGstSlabs(gRes.data)
    })()
  }, [open])

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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input placeholder="Search name / SKU / barcode" value={q} onChange={(e) => setQ(e.target.value)} className="sm:w-64" />
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
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.sku}</TableCell>
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
      </div>
    </div>
  )
}
