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
  Separator,
  Skeleton,
} from "@repo/ui"
import type { UserPublic } from "@repo/types"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { useAuth } from "@/components/auth-provider"
import { apiRequest } from "@/lib/api"
import { notifyError } from "@/lib/notify"

const userStatuses = ["active", "inactive", "invited", "suspended", "deactivated", "archived"] as const

const updateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum(["admin", "manager", "cashier", "billing_staff", "inventory_staff", "accountant", "viewer"]),
  status: z.enum(userStatuses),
})

const nameOnlySchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
})

const resetSchema = z.object({ password: z.string().min(8) })

export default function UserDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { me, refresh } = useAuth()
  const [user, setUser] = useState<UserPublic | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const canAdmin = me?.user.role === "owner" || me?.user.role === "admin"
  const isManager = me?.user.role === "manager"

  const userId = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : ""

  const load = useCallback(async () => {
    setPageLoading(true)
    setFetchError(null)
    if (!userId) {
      setFetchError("Invalid user link")
      notifyError("Invalid user link")
      setPageLoading(false)
      return
    }
    const res = await apiRequest<UserPublic>(`/users/${userId}`)
    setPageLoading(false)
    if (res.success) {
      setUser(res.data)
      return
    }
    if (res.error.code === "not_found") {
      router.replace("/users")
      return
    }
    setFetchError(res.error.message)
    notifyError(res.error.message)
  }, [userId, router])

  useEffect(() => {
    void load()
  }, [load])

  const form = useForm<z.infer<typeof updateSchema>>({
    resolver: zodResolver(updateSchema),
    defaultValues: { name: "", phone: "", role: "cashier", status: "active" },
  })

  const nameOnlyForm = useForm<z.infer<typeof nameOnlySchema>>({
    resolver: zodResolver(nameOnlySchema),
    defaultValues: { name: "", phone: "" },
  })

  useEffect(() => {
    if (!user || user.role === "owner") return
    form.reset({
      name: user.name,
      phone: user.phone ?? "",
      role: user.role as z.infer<typeof updateSchema>["role"],
      status: user.status as z.infer<typeof updateSchema>["status"],
    })
  }, [user, form])

  const resetForm = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: "" } })

  const isOwnerSelf = Boolean(me && user && me.user.id === user.id && user.role === "owner")
  const showNameOnlyEdit = Boolean(
    user && (isOwnerSelf || (isManager && user.role !== "owner")),
  )

  useEffect(() => {
    if (!showNameOnlyEdit || !user) return
    nameOnlyForm.reset({ name: user.name, phone: user.phone ?? "" })
  }, [user, showNameOnlyEdit, nameOnlyForm])

  const handleUpdate = form.handleSubmit(async (values) => {
    const res = await apiRequest<UserPublic>(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: values.name,
        phone: values.phone,
        role: values.role,
        status: values.status,
      }),
    })
    if (!res.success) {
      form.setError("root", { message: res.error.message })
      notifyError(res.error.message)
      return
    }
    setUser(res.data)
    await refresh()
  })

  const handleNameOnly = nameOnlyForm.handleSubmit(async (values) => {
    const res = await apiRequest<UserPublic>(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: values.name, phone: values.phone }),
    })
    if (!res.success) {
      nameOnlyForm.setError("root", { message: res.error.message })
      notifyError(res.error.message)
      return
    }
    setUser(res.data)
    await refresh()
  })

  const handleReset = resetForm.handleSubmit(async (values) => {
    const res = await apiRequest<{ ok: boolean }>(`/users/${userId}/reset-password`, {
      method: "POST",
      body: JSON.stringify(values),
    })
    if (!res.success) {
      resetForm.setError("root", { message: res.error.message })
      notifyError(res.error.message)
      return
    }
    resetForm.reset()
  })

  if (pageLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Button variant="ghost" asChild>
          <Link href="/users">Back to users</Link>
        </Button>
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" asChild>
          <Link href="/users">Back</Link>
        </Button>
        <Badge className="capitalize">{user.role.replaceAll("_", " ")}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{user.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          {user.phone ? <p className="text-sm text-muted-foreground">{user.phone}</p> : null}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>Status: {user.status}</span>
            {user.lastLoginAt ? <span>Last login: {new Date(user.lastLoginAt).toLocaleString()}</span> : <span>No login yet</span>}
          </div>
          <Separator />
          {showNameOnlyEdit ? (
            <Form {...nameOnlyForm}>
              <form onSubmit={handleNameOnly} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {isOwnerSelf
                    ? "Update your display name. Role and security for the owner account are fixed."
                    : "Update this user’s display name. Only owner or admin can change role, status, or passwords."}
                </p>
                {nameOnlyForm.formState.errors.root ? (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{nameOnlyForm.formState.errors.root.message}</AlertDescription>
                  </Alert>
                ) : null}
                <FormField
                  control={nameOnlyForm.control}
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
                  control={nameOnlyForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input type="tel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={nameOnlyForm.formState.isSubmitting}>
                  Save profile
                </Button>
              </form>
            </Form>
          ) : null}
          {canAdmin && user.role !== "owner" ? (
            <Form {...form}>
              <form onSubmit={handleUpdate} className="space-y-4">
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
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input type="tel" {...field} />
                      </FormControl>
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
                            <SelectValue />
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
                          {userStatuses.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  Save changes
                </Button>
              </form>
            </Form>
          ) : null}
          {!showNameOnlyEdit && !(canAdmin && user.role !== "owner") ? (
            <p className="text-sm text-muted-foreground">
              You can view this profile. Editing is limited by your role (owner accounts can only be edited by that owner for their own name).
            </p>
          ) : null}
          {canAdmin && user.role !== "owner" ? (
            <>
              <Separator />
              <Form {...resetForm}>
                <form onSubmit={handleReset} className="space-y-4">
                  <h3 className="text-sm font-medium">Reset password</h3>
                  {resetForm.formState.errors.root ? (
                    <Alert variant="destructive">
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{resetForm.formState.errors.root.message}</AlertDescription>
                    </Alert>
                  ) : null}
                  <FormField
                    control={resetForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New password</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="new-password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" variant="secondary" disabled={resetForm.formState.isSubmitting}>
                    Update password
                  </Button>
                </form>
              </Form>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
