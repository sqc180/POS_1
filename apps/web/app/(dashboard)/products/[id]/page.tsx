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
} from "@repo/ui"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { apiRequest } from "@/lib/api"

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
  unit: string
}

type CategoryRow = { id: string; name: string }
type GstSlabRow = { id: string; name: string; cgstRate: number; sgstRate: number }

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
  unit: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
})

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [gstSlabs, setGstSlabs] = useState<GstSlabRow[]>([])

  const load = useCallback(async () => {
    const res = await apiRequest<Product>(`/products/${params.id}`)
    if (res.success) setProduct(res.data)
    else router.replace("/products")
  }, [params.id, router])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void (async () => {
      const [cRes, gRes] = await Promise.all([
        apiRequest<CategoryRow[]>("/categories"),
        apiRequest<GstSlabRow[]>("/gst-slabs"),
      ])
      if (cRes.success) setCategories(cRes.data)
      if (gRes.success) setGstSlabs(gRes.data)
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
      unit: "",
      status: "active",
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
      unit: product.unit ?? "",
      status: product.status === "inactive" ? "inactive" : "active",
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
      unit: values.unit,
      status: values.status,
    }
    const res = await apiRequest<Product>(`/products/${params.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
    if (!res.success) return
    setProduct(res.data)
  })

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
              <div className="sm:col-span-2">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  Save
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
