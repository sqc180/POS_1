"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
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
  SheetFooter,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui"
import type { UserPublic } from "@repo/types"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { useAuth } from "@/components/auth-provider"
import { apiRequest } from "@/lib/api"
import { notifyError, notifySuccess } from "@/lib/notify"

const createSchema = z.object({
  email: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().email()),
  password: z.string().min(8),
  name: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum(["admin", "manager", "cashier", "billing_staff", "inventory_staff", "accountant", "viewer"]),
})

type PagedUsers = { items: UserPublic[]; total: number; skip: number; limit: number }

type BranchRow = { id: string; code: string; name: string; status: string }

type CreateForm = z.infer<typeof createSchema>

export default function UsersPage() {
  const { me, refresh } = useAuth()
  const [rows, setRows] = useState<UserPublic[]>([])
  const [total, setTotal] = useState(0)
  const [skip, setSkip] = useState(0)
  const limit = 25
  const [filterQ, setFilterQ] = useState("")
  const [filterRole, setFilterRole] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [open, setOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [branchSheetUser, setBranchSheetUser] = useState<UserPublic | null>(null)
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    params.set("paged", "true")
    params.set("limit", String(limit))
    params.set("skip", String(skip))
    if (filterQ.trim()) params.set("q", filterQ.trim())
    if (filterRole !== "all") params.set("role", filterRole)
    if (filterStatus !== "all") params.set("status", filterStatus)
    const res = await apiRequest<PagedUsers>(`/users?${params.toString()}`)
    if (res.success) {
      setRows(res.data.items)
      setTotal(res.data.total)
      setLoadError(null)
    } else {
      setLoadError(res.error.message)
      notifyError(res.error.message)
    }
  }, [skip, filterQ, filterRole, filterStatus])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void (async () => {
      const res = await apiRequest<BranchRow[]>("/branches")
      if (res.success) setBranches(res.data.filter((b) => b.status === "active"))
    })()
  }, [])

  useEffect(() => {
    if (!branchSheetUser) return
    const next = new Set(branchSheetUser.branchCodes ?? [])
    setSelectedBranches(next)
  }, [branchSheetUser])

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: "", password: "", name: "", phone: "", role: "cashier" },
  })

  const canCreate = me?.user.role === "owner" || me?.user.role === "admin"

  const handleCreate = form.handleSubmit(async (values) => {
    const res = await apiRequest<UserPublic>("/users", {
      method: "POST",
      body: JSON.stringify({
        email: values.email,
        password: values.password,
        name: values.name,
        role: values.role,
        ...(values.phone?.trim() ? { phone: values.phone.trim() } : {}),
      }),
    })
    if (!res.success) {
      form.setError("root", { message: res.error.message })
      notifyError(res.error.message)
      return
    }
    setOpen(false)
    form.reset()
    notifySuccess("User created")
    await load()
    await refresh()
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">Tenant-scoped staff. Only owner/admin can create users or reset passwords.</p>
        </div>
        {canCreate ? (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button>New user</Button>
            </SheetTrigger>
            <SheetContent className="flex flex-col sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Create user</SheetTitle>
                <SheetDescription>
                  They will sign in with the email and initial password below. Ask them to change the password after first login if your policy requires it.
                </SheetDescription>
              </SheetHeader>
              <Form {...form}>
                <form onSubmit={handleCreate} className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
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
                          <Input placeholder="e.g. Ananya Iyer" autoComplete="name" {...field} />
                        </FormControl>
                        <FormDescription>Shown in the user list and audit trails.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input type="tel" autoComplete="tel" placeholder="Optional" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="name@company.com" autoComplete="email" {...field} />
                        </FormControl>
                        <FormDescription>Used as the login identifier; must be unique in your workspace.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Initial password</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="new-password" placeholder="At least 8 characters" {...field} />
                        </FormControl>
                        <FormDescription>Minimum 8 characters. Share it securely; you can reset it later from the user profile.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="cashier">Cashier</SelectItem>
                            <SelectItem value="billing_staff">Billing staff</SelectItem>
                            <SelectItem value="inventory_staff">Inventory staff</SelectItem>
                            <SelectItem value="accountant">Accountant</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>Controls dashboard sections and actions. See Roles for the full permission map.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <SheetFooter className="mt-auto gap-2 sm:justify-end">
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                      {form.formState.isSubmitting ? "Saving…" : "Create"}
                    </Button>
                  </SheetFooter>
                </form>
              </Form>
            </SheetContent>
          </Sheet>
        ) : null}
      </div>
      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load users</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" size="sm" className="w-fit shrink-0" onClick={() => void load()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid flex-1 gap-2 sm:min-w-[12rem]">
          <span className="text-xs font-medium text-muted-foreground">Search</span>
          <Input value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="Name, email, phone" />
        </div>
        <div className="grid gap-2 sm:min-w-[10rem]">
          <span className="text-xs font-medium text-muted-foreground">Role</span>
          <Select value={filterRole} onValueChange={(v) => { setSkip(0); setFilterRole(v) }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="cashier">Cashier</SelectItem>
              <SelectItem value="billing_staff">Billing staff</SelectItem>
              <SelectItem value="inventory_staff">Inventory staff</SelectItem>
              <SelectItem value="accountant">Accountant</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 sm:min-w-[10rem]">
          <span className="text-xs font-medium text-muted-foreground">Status</span>
          <Select value={filterStatus} onValueChange={(v) => { setSkip(0); setFilterStatus(v) }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="invited">Invited</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="deactivated">Deactivated</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setSkip(0)
            void load()
          }}
        >
          Apply filters
        </Button>
      </div>
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Branches</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell className="text-muted-foreground">{u.phone ?? "—"}</TableCell>
                <TableCell className="capitalize">{u.role.replaceAll("_", " ")}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      u.status === "active"
                        ? "default"
                        : u.status === "suspended" || u.status === "deactivated"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {u.status}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[10rem] truncate text-xs text-muted-foreground">
                  {u.branchCodes && u.branchCodes.length > 0 ? u.branchCodes.join(", ") : "All"}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  {canCreate && u.role !== "owner" ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setBranchSheetUser(u)}>
                      Branches
                    </Button>
                  ) : null}
                  <Button variant="link" className="h-auto p-0" asChild>
                    <Link href={`/users/${u.id}`}>View</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
          <span>
            {total === 0 ? "No users" : `Showing ${skip + 1}–${Math.min(skip + rows.length, total)} of ${total}`}
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

      <Sheet open={Boolean(branchSheetUser)} onOpenChange={(o) => !o && setBranchSheetUser(null)}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Branch access</SheetTitle>
            <SheetDescription>
              Restrict this user to specific branch codes, or clear all to allow every branch. Owner accounts cannot be restricted.
            </SheetDescription>
          </SheetHeader>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto py-4">
            {branches.map((b) => (
              <label key={b.id} className="flex cursor-pointer items-center gap-3 rounded-md border p-3">
                <Checkbox
                  checked={selectedBranches.has(b.code)}
                  onCheckedChange={(checked) => {
                    setSelectedBranches((prev) => {
                      const next = new Set(prev)
                      if (checked === true) next.add(b.code)
                      else next.delete(b.code)
                      return next
                    })
                  }}
                  aria-label={`Branch ${b.name}`}
                />
                <span className="text-sm">
                  <span className="font-medium">{b.name}</span>
                  <span className="ml-2 font-mono text-muted-foreground">{b.code}</span>
                </span>
              </label>
            ))}
          </div>
          <SheetFooter className="gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSelectedBranches(new Set())
              }}
            >
              Clear all
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (!branchSheetUser) return
                const res = await apiRequest<UserPublic>(`/users/${branchSheetUser.id}/branch-access`, {
                  method: "PATCH",
                  body: JSON.stringify({ branchCodes: [...selectedBranches] }),
                })
                if (!res.success) {
                  notifyError(res.error.message)
                  return
                }
                notifySuccess("Branch access updated")
                setBranchSheetUser(null)
                await load()
              }}
            >
              Save access
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
