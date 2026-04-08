"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
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
  role: z.enum(["admin", "manager", "cashier", "billing_staff", "inventory_staff", "accountant", "viewer"]),
})

type CreateForm = z.infer<typeof createSchema>

export default function UsersPage() {
  const { me, refresh } = useAuth()
  const [rows, setRows] = useState<UserPublic[]>([])
  const [open, setOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await apiRequest<UserPublic[]>("/users")
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

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: "", password: "", name: "", role: "cashier" },
  })

  const canCreate = me?.user.role === "owner" || me?.user.role === "admin"

  const handleCreate = form.handleSubmit(async (values) => {
    const res = await apiRequest<UserPublic>("/users", { method: "POST", body: JSON.stringify(values) })
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
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell className="capitalize">{u.role.replaceAll("_", " ")}</TableCell>
                <TableCell>
                  <Badge variant={u.status === "active" ? "default" : "secondary"}>{u.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="link" className="h-auto p-0" asChild>
                    <Link href={`/users/${u.id}`}>View</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
