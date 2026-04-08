"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { apiRequest } from "@/lib/api"
import { notifyError, notifySuccess } from "@/lib/notify"

type CategoryRow = {
  id: string
  name: string
  parentId: string | null
  status: string
  sortOrder: number
}

const schema = z.object({
  name: z.string().min(1),
  parentId: z.string().optional(),
  sortOrder: z.coerce.number().optional(),
})

export default function CategoriesPage() {
  const [rows, setRows] = useState<CategoryRow[]>([])
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<CategoryRow | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await apiRequest<CategoryRow[]>("/categories")
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

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", parentId: "", sortOrder: 0 },
  })

  useEffect(() => {
    if (edit) {
      form.reset({
        name: edit.name,
        parentId: edit.parentId ?? "",
        sortOrder: edit.sortOrder,
      })
    } else {
      form.reset({ name: "", parentId: "", sortOrder: 0 })
    }
  }, [edit, form])

  const handleCreate = form.handleSubmit(async (values) => {
    const body = {
      name: values.name,
      parentId: values.parentId || null,
      sortOrder: values.sortOrder,
    }
    const res = await apiRequest<CategoryRow>("/categories", { method: "POST", body: JSON.stringify(body) })
    if (!res.success) {
      form.setError("root", { message: res.error.message })
      notifyError(res.error.message)
      return
    }
    setOpen(false)
    form.reset()
    notifySuccess("Category created")
    await load()
  })

  const handleUpdate = form.handleSubmit(async (values) => {
    if (!edit) return
    const res = await apiRequest<CategoryRow>(`/categories/${edit.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: values.name,
        parentId: values.parentId || null,
        sortOrder: values.sortOrder,
        status: edit.status,
      }),
    })
    if (!res.success) {
      form.setError("root", { message: res.error.message })
      notifyError(res.error.message)
      return
    }
    setEdit(null)
    notifySuccess("Category updated")
    await load()
  })

  const parentName = (id: string | null) => rows.find((r) => r.id === id)?.name ?? "—"

  const openEdit = (c: CategoryRow) => {
    setEdit(c)
    setOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Categories</h1>
          <p className="text-sm text-muted-foreground">Hierarchy-ready categories for retail and supermart.</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setEdit(null)
              setOpen(true)
            }}
          >
            New category
          </Button>
          <Sheet
            open={open}
            onOpenChange={(v) => {
              setOpen(v)
              if (!v) setEdit(null)
            }}
          >
            <SheetContent className="flex flex-col sm:max-w-md">
              <SheetHeader>
                <SheetTitle>{edit ? "Edit category" : "New category"}</SheetTitle>
                <SheetDescription>
                  Use a clear name (for example &quot;Dairy&quot; or &quot;Snacks&quot;). Parent builds a tree for navigation and reporting.
                </SheetDescription>
              </SheetHeader>
              <Form {...form}>
                <form
                  onSubmit={edit ? handleUpdate : handleCreate}
                  className="flex flex-1 flex-col gap-4 overflow-y-auto py-4"
                >
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
                          <Input placeholder="e.g. Beverages" {...field} />
                        </FormControl>
                        <FormDescription>Shown in product pickers and category filters.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="parentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Parent category (optional)</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                          value={field.value ? field.value : "__none__"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Top-level category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-[min(20rem,60vh)]">
                            <SelectItem value="__none__">None (top-level)</SelectItem>
                            {rows
                              .filter((r) => r.id !== edit?.id)
                              .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
                              .map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Optional. Choose a parent to nest under; leave none for a root category.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="sortOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sort order</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="e.g. 10" {...field} />
                        </FormControl>
                        <FormDescription>Lower numbers appear first when lists are sorted by order.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <SheetFooter>
                    <Button type="submit">Save</Button>
                  </SheetFooter>
                </form>
              </Form>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load categories</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" size="sm" className="w-fit shrink-0" onClick={() => void load()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{parentName(c.parentId)}</TableCell>
                <TableCell>
                  <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" aria-label={`Actions for ${c.name}`}>
                        Actions
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Category</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => openEdit(c)}>Edit category</DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          void navigator.clipboard.writeText(c.id).then(() => notifySuccess("ID copied to clipboard"))
                        }}
                      >
                        Copy category ID
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
