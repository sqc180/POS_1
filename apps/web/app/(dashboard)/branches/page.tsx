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
  Textarea,
} from "@repo/ui"
import { CAPABILITY_PACKS } from "@repo/business-type-engine"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { useAuth } from "@/components/auth-provider"
import { apiRequest } from "@/lib/api"
import { notifyError, notifySuccess } from "@/lib/notify"

type BranchRow = {
  id: string
  code: string
  name: string
  kind: "shop" | "warehouse" | "other"
  address: string
  notes: string
  status: "active" | "inactive"
  sortOrder: number
  businessTypeSlug: string | null
  enabledPackIds: string[]
  posMode: "standard" | "high_volume" | "table_service" | "field"
}

const createSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(64)
    .transform((s) => s.trim().toLowerCase()),
  name: z.string().min(1),
  kind: z.enum(["shop", "warehouse", "other"]),
  address: z.string().optional(),
  notes: z.string().optional(),
  sortOrder: z.coerce.number().optional(),
})

const editSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["shop", "warehouse", "other"]),
  address: z.string().optional(),
  notes: z.string().optional(),
  sortOrder: z.coerce.number().optional(),
  businessTypeSlug: z.string().max(64).optional(),
  enabledPackIdsCsv: z.string().optional(),
  posMode: z.enum(["standard", "high_volume", "table_service", "field"]),
})

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

const defaultCreate: CreateValues = {
  code: "",
  name: "",
  kind: "shop",
  address: "",
  notes: "",
  sortOrder: 0,
}

const defaultEdit: EditValues = {
  name: "",
  kind: "shop",
  address: "",
  notes: "",
  sortOrder: 0,
  businessTypeSlug: "",
  enabledPackIdsCsv: "",
  posMode: "standard",
}

const kindLabel = (k: BranchRow["kind"]) =>
  k === "shop" ? "Shop / front" : k === "warehouse" ? "Warehouse" : "Other"

const kindBadgeVariant = (k: BranchRow["kind"]): "default" | "secondary" | "outline" =>
  k === "shop" ? "default" : k === "warehouse" ? "secondary" : "outline"

const parsePackIdsCsv = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)

export default function BranchesPage() {
  const { me } = useAuth()
  const canMutate = me?.permissions.includes("branches.manage") ?? false
  const canEditBranchPacks =
    canMutate && (me?.user.role === "owner" || me?.user.role === "admin")

  const [rows, setRows] = useState<BranchRow[]>([])
  const [open, setOpen] = useState(false)
  const [editRow, setEditRow] = useState<BranchRow | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: defaultCreate,
  })

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: defaultEdit,
  })

  const load = useCallback(async () => {
    const res = await apiRequest<BranchRow[]>("/branches")
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

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setEditRow(null)
      createForm.reset(defaultCreate)
      editForm.reset(defaultEdit)
      createForm.clearErrors("root")
      editForm.clearErrors("root")
    }
  }

  useEffect(() => {
    if (!open) return
    if (editRow) {
      editForm.reset({
        name: editRow.name,
        kind: editRow.kind,
        address: editRow.address || "",
        notes: editRow.notes || "",
        sortOrder: editRow.sortOrder,
        businessTypeSlug: editRow.businessTypeSlug ?? "",
        enabledPackIdsCsv: (editRow.enabledPackIds ?? []).join(", "),
        posMode: editRow.posMode ?? "standard",
      })
    } else {
      createForm.reset(defaultCreate)
    }
  }, [open, editRow, createForm, editForm])

  const openCreate = () => {
    setEditRow(null)
    setOpen(true)
  }

  const openEdit = (b: BranchRow) => {
    setEditRow(b)
    setOpen(true)
  }

  const handleCreate = createForm.handleSubmit(async (values) => {
    const res = await apiRequest<BranchRow>("/branches", {
      method: "POST",
      body: JSON.stringify({
        code: values.code,
        name: values.name,
        kind: values.kind,
        address: values.address || undefined,
        notes: values.notes || undefined,
        sortOrder: values.sortOrder,
      }),
    })
    if (!res.success) {
      createForm.setError("root", { message: res.error.message })
      notifyError(res.error.message)
      return
    }
    notifySuccess("Location created")
    handleOpenChange(false)
    await load()
  })

  const handleEdit = editForm.handleSubmit(async (values) => {
    if (!editRow) return
    const packIds = parsePackIdsCsv(values.enabledPackIdsCsv)
    const slugTrim = values.businessTypeSlug?.trim() ?? ""
    const res = await apiRequest<BranchRow>(`/branches/${editRow.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: values.name,
        kind: values.kind,
        address: values.address || undefined,
        notes: values.notes || undefined,
        sortOrder: values.sortOrder,
        ...(canEditBranchPacks
          ? {
              businessTypeSlug: slugTrim === "" ? null : slugTrim,
              enabledPackIds: packIds,
              posMode: values.posMode,
            }
          : {}),
      }),
    })
    if (!res.success) {
      editForm.setError("root", { message: res.error.message })
      notifyError(res.error.message)
      return
    }
    notifySuccess("Location updated")
    handleOpenChange(false)
    await load()
  })

  const patchStatus = async (b: BranchRow, status: "active" | "inactive") => {
    const res = await apiRequest<BranchRow>(`/branches/${b.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    })
    if (!res.success) {
      notifyError(res.error.message)
      return
    }
    notifySuccess(status === "active" ? "Location activated" : "Location deactivated")
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Branches & locations</h1>
          <p className="text-sm text-muted-foreground">
            Shops, warehouses, and other stock locations. The <span className="font-medium text-foreground">code</span> is stored on each
            inventory row and used by POS (default branch in settings).
          </p>
        </div>
        {canMutate ? (
          <Button type="button" onClick={openCreate}>
            New location
          </Button>
        ) : null}
      </div>

      <Alert>
        <AlertTitle>Codes and inventory</AlertTitle>
        <AlertDescription className="space-y-2 text-muted-foreground">
          <p>
            Use a short stable code such as <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">main</code> or{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">wh-north</code>. Existing stock rows keep their code; add new
            locations before assigning products there from{" "}
            <Link href="/inventory" className="font-medium text-foreground underline-offset-4 hover:underline">
              Inventory
            </Link>
            .
          </p>
        </AlertDescription>
      </Alert>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load locations</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" size="sm" className="w-fit shrink-0" onClick={() => void load()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent className="flex flex-col sm:max-w-md">
          {editRow ? (
            <>
              <SheetHeader>
                <SheetTitle>Edit location</SheetTitle>
                <SheetDescription>
                  Code <span className="font-mono font-medium text-foreground">{editRow.code}</span> is fixed so existing inventory and
                  documents stay aligned. Change the display name, kind, or notes anytime.
                </SheetDescription>
              </SheetHeader>
              <Form {...editForm}>
                <form onSubmit={handleEdit} className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
                  {editForm.formState.errors.root ? (
                    <Alert variant="destructive">
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{editForm.formState.errors.root.message}</AlertDescription>
                    </Alert>
                  ) : null}
                  <FormField
                    control={editForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Flagship store" {...field} />
                        </FormControl>
                        <FormDescription>Shown in filters and branch pickers across the app.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="kind"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="shop">Shop / front (retail floor)</SelectItem>
                            <SelectItem value="warehouse">Warehouse / back store</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>For reporting and future transfers; does not change how stock math works.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address (optional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Building, area, city — PIN" className="min-h-[72px] resize-y" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Internal notes</FormLabel>
                        <FormControl>
                          <Textarea placeholder="e.g. Open Mon–Sat · GRN dock B" className="min-h-[72px] resize-y" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="sortOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sort order</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0" {...field} />
                        </FormControl>
                        <FormDescription>Lower numbers appear first in dropdowns.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {canEditBranchPacks ? (
                    <>
                      <div className="rounded-lg border border-border/80 bg-muted/30 p-3">
                        <p className="text-sm font-medium text-foreground">Operating mode (this branch)</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Overrides tenant pilot vertical for capability resolution. Leave blank to inherit tenant settings.
                        </p>
                      </div>
                      <FormField
                        control={editForm.control}
                        name="businessTypeSlug"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Branch business pack</FormLabel>
                            <Select
                              onValueChange={(v) => field.onChange(v === "__inherit__" ? "" : v)}
                              value={field.value === "" || !field.value ? "__inherit__" : field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Inherit from tenant" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="__inherit__">Inherit from tenant</SelectItem>
                                {CAPABILITY_PACKS.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="enabledPackIdsCsv"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Extra pack ids (optional)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g. grocery, wholesale"
                                className="font-mono text-sm"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormDescription>Comma-separated roadmap pack ids; flags are unioned with the branch base.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="posMode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>POS mode hint</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="standard">Standard counter</SelectItem>
                                <SelectItem value="high_volume">High volume</SelectItem>
                                <SelectItem value="table_service">Table service</SelectItem>
                                <SelectItem value="field">Field / van</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  ) : null}
                  <SheetFooter className="mt-auto gap-2 sm:justify-end">
                    <Button type="submit" disabled={editForm.formState.isSubmitting}>
                      {editForm.formState.isSubmitting ? "Saving…" : "Save changes"}
                    </Button>
                  </SheetFooter>
                </form>
              </Form>
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>New location</SheetTitle>
                <SheetDescription>
                  Pick a unique code in lowercase with optional hyphens. Match codes already used on inventory rows if you are formalizing an
                  existing branch id.
                </SheetDescription>
              </SheetHeader>
              <Form {...createForm}>
                <form onSubmit={handleCreate} className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
                  {createForm.formState.errors.root ? (
                    <Alert variant="destructive">
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{createForm.formState.errors.root.message}</AlertDescription>
                    </Alert>
                  ) : null}
                  <FormField
                    control={createForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Branch code</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. wh-north" autoComplete="off" className="font-mono" {...field} />
                        </FormControl>
                        <FormDescription>Stored as branchId on stock rows; cannot be renamed later.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. North warehouse" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="kind"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="shop">Shop / front</SelectItem>
                            <SelectItem value="warehouse">Warehouse</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address (optional)</FormLabel>
                        <FormControl>
                          <Textarea className="min-h-[72px] resize-y" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Internal notes (optional)</FormLabel>
                        <FormControl>
                          <Textarea className="min-h-[72px] resize-y" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="sortOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sort order</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <SheetFooter className="mt-auto gap-2 sm:justify-end">
                    <Button type="submit" disabled={createForm.formState.isSubmitting}>
                      {createForm.formState.isSubmitting ? "Creating…" : "Create"}
                    </Button>
                  </SheetFooter>
                </form>
              </Form>
            </>
          )}
        </SheetContent>
      </Sheet>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Pack</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-mono text-sm">{b.code}</TableCell>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell>
                  <Badge variant={kindBadgeVariant(b.kind)}>{kindLabel(b.kind)}</Badge>
                </TableCell>
                <TableCell className="max-w-[10rem]">
                  {b.businessTypeSlug ? (
                    <Badge variant="outline" className="font-mono text-xs">
                      {b.businessTypeSlug}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Tenant default</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={b.status === "active" ? "default" : "secondary"}>{b.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {canMutate ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" size="sm" aria-label={`Actions for ${b.name}`}>
                          Actions
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Location</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => openEdit(b)}>Edit details</DropdownMenuItem>
                        {b.status === "active" ? (
                          <DropdownMenuItem onClick={() => void patchStatus(b, "inactive")}>Deactivate</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => void patchStatus(b, "active")}>Activate</DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            void navigator.clipboard.writeText(b.code).then(() => notifySuccess("Code copied"))
                          }}
                        >
                          Copy branch code
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            void navigator.clipboard.writeText(b.id).then(() => notifySuccess("ID copied"))
                          }}
                        >
                          Copy record ID
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="text-xs text-muted-foreground">View only</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
