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
  Skeleton,
} from "@repo/ui"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import Link from "next/link"
import { FUTURE_BUSINESS_TYPE_ROADMAP } from "@repo/business-type-engine"
import { useAuth } from "@/components/auth-provider"
import { apiRequest } from "@/lib/api"
import { notifyError, notifySuccess } from "@/lib/notify"

type Settings = {
  allowNegativeStock: boolean
  invoiceNumberPrefix: string
  receiptNumberPrefix: string
  defaultTaxMode: string
  posDefaultPaymentMode: string
  defaultBranchId: string
}

type BranchOpt = { code: string; name: string; status: string }

const schema = z.object({
  allowNegativeStock: z.boolean(),
  invoiceNumberPrefix: z.string().min(1),
  receiptNumberPrefix: z.string().min(1),
  defaultTaxMode: z.enum(["inclusive", "exclusive"]),
  posDefaultPaymentMode: z.string().min(1),
  defaultBranchId: z.string().min(1),
})

const SettingsFormSkeleton = () => (
  <div className="grid gap-4">
    <Skeleton className="h-20 w-full rounded-lg" />
    {Array.from({ length: 5 }, (_, i) => (
      <div key={i} className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    ))}
    <Skeleton className="h-9 w-40 rounded-md" />
  </div>
)

export default function SettingsPage() {
  const { me, refresh } = useAuth()
  const [loaded, setLoaded] = useState<Settings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [branchOptions, setBranchOptions] = useState<BranchOpt[]>([])
  const [pilotSaving, setPilotSaving] = useState(false)
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      allowNegativeStock: false,
      invoiceNumberPrefix: "INV",
      receiptNumberPrefix: "RCP",
      defaultTaxMode: "exclusive",
      posDefaultPaymentMode: "cash",
      defaultBranchId: "main",
    },
  })

  const load = useCallback(async () => {
    setLoadError(null)
    const [setRes, brRes] = await Promise.all([
      apiRequest<Settings>("/settings/business"),
      apiRequest<BranchOpt[]>("/branches"),
    ])
    if (brRes.success) {
      setBranchOptions(brRes.data)
    }
    if (setRes.success) {
      setLoaded(setRes.data)
      form.reset({
        allowNegativeStock: setRes.data.allowNegativeStock,
        invoiceNumberPrefix: setRes.data.invoiceNumberPrefix,
        receiptNumberPrefix: setRes.data.receiptNumberPrefix,
        defaultTaxMode: setRes.data.defaultTaxMode as "inclusive" | "exclusive",
        posDefaultPaymentMode: setRes.data.posDefaultPaymentMode,
        defaultBranchId: setRes.data.defaultBranchId,
      })
    } else {
      setLoaded(null)
      setLoadError(setRes.error.message)
      notifyError(setRes.error.message)
    }
  }, [form])

  useEffect(() => {
    void load()
  }, [load])

  const handleSave = form.handleSubmit(async (values) => {
    const res = await apiRequest<Settings>("/settings/business", {
      method: "PATCH",
      body: JSON.stringify(values),
    })
    if (!res.success) return
    setLoaded(res.data)
    notifySuccess("Settings saved")
  })

  const canSetPilotVertical = me?.user.role === "owner" || me?.user.role === "admin"

  const handlePilotVerticalChange = async (value: string) => {
    if (!canSetPilotVertical) return
    setPilotSaving(true)
    const pilotVertical = value === "__none__" ? null : value
    const res = await apiRequest<{ pilotVertical: string | null }>("/settings/pilot-vertical", {
      method: "PATCH",
      body: JSON.stringify({ pilotVertical }),
    })
    setPilotSaving(false)
    if (!res.success) {
      notifyError(res.error.message)
      return
    }
    notifySuccess("Pilot vertical updated")
    await refresh()
  }

  const handleCopyWorkspaceId = async () => {
    const id = me?.tenant.id
    if (!id || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(id)
      notifySuccess("Workspace ID copied to clipboard.")
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Business settings</h1>
        <p className="text-sm text-muted-foreground">
          Tenant: <span className="font-medium">{me?.tenant.name}</span> ({me?.tenant.businessType})
        </p>
      </div>
      <Alert className="border-primary/25 bg-primary/5">
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm">New here? Open the in-app guide for what each module does and modern UI samples.</span>
          <Button size="sm" variant="secondary" asChild>
            <Link href="/settings/guide">Guide & samples</Link>
          </Button>
        </AlertDescription>
      </Alert>

      {loadError ? (
        <Alert variant="destructive" className="border-destructive/40 shadow-elevate-sm">
          <AlertTitle>Could not load business settings</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-destructive/90">{loadError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-destructive/30 sm:w-auto"
              onClick={() => void load()}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace ID</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Use this on the sign-in screen when your email is registered on more than one business. Paste it under “Sign in to a specific workspace”.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input readOnly value={me?.tenant.id ?? ""} className="font-mono text-sm" aria-label="Workspace ID" />
            <Button type="button" variant="outline" className="shrink-0 sm:w-auto" onClick={() => void handleCopyWorkspaceId()}>
              Copy
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Active profile:{" "}
            <span className="font-medium text-foreground">{me?.tenant.businessType}</span>. Retail and Supermart use the same core; future
            verticals extend feature maps without rewriting billing, stock, or GST services.
          </p>
          <div className="flex flex-wrap gap-2">
            {me?.permissions.includes("audit.view") ? (
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings/audit">Audit log</Link>
              </Button>
            ) : null}
            {me?.permissions.includes("gateway.manage") ? (
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings/gateway">Payment gateway</Link>
              </Button>
            ) : null}
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Roadmap (configuration-only today)</p>
            <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {FUTURE_BUSINESS_TYPE_ROADMAP.map((row) => (
                <li key={row.id} className="text-muted-foreground">
                  <span className="font-medium text-foreground">{row.label}</span>
                  <span className="text-xs"> — {row.modules}</span>
                </li>
              ))}
            </ul>
          </div>
          {canSetPilotVertical ? (
            <div className="space-y-3 rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">Pilot vertical (optional)</p>
                <p className="text-xs text-muted-foreground">
                  Enables capability flags for future modules. Does not change billing type ({me?.tenant.businessType}).
                </p>
              </div>
              <Select
                disabled={pilotSaving}
                value={me?.tenant.pilotVertical ?? "__none__"}
                onValueChange={(v) => void handlePilotVerticalChange(v)}
              >
                <SelectTrigger className="max-w-md" aria-label="Pilot vertical">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (core retail engine only)</SelectItem>
                  {FUTURE_BUSINESS_TYPE_ROADMAP.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {me?.tenant.capabilities && me.tenant.capabilities.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {me.tenant.capabilities.map((c) => (
                    <Badge key={c} variant="secondary" className="font-mono text-xs">
                      {c}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No extra capabilities until a pilot vertical is selected.</p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inventory & documents</CardTitle>
        </CardHeader>
        <CardContent>
          {loaded ? (
            <Form {...form}>
              <form onSubmit={handleSave} className="grid gap-4">
                <FormField
                  control={form.control}
                  name="allowNegativeStock"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start gap-3 rounded-lg border p-3">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} aria-label="Allow negative stock" />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Allow negative stock</FormLabel>
                        <p className="text-xs text-muted-foreground">When off, POS and adjustments cannot go below zero.</p>
                      </div>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="invoiceNumberPrefix"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice prefix</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="receiptNumberPrefix"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Receipt prefix</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultTaxMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default tax mode</FormLabel>
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
                  name="posDefaultPaymentMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>POS default payment</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultBranchId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default branch for POS & stock</FormLabel>
                      {branchOptions.length > 0 ? (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select branch code" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-[min(20rem,60vh)]">
                            {branchOptions.map((b) => (
                              <SelectItem key={b.code} value={b.code}>
                                {b.name} ({b.code})
                                {b.status === "inactive" ? " — inactive" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <FormControl>
                          <Input {...field} placeholder="e.g. main" className="font-mono" />
                        </FormControl>
                      )}
                      <FormDescription>
                        Must match a branch code used on inventory rows. Manage locations under{" "}
                        <Link href="/branches" className="font-medium text-foreground underline-offset-4 hover:underline">
                          Branches & locations
                        </Link>
                        .
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit">Save settings</Button>
              </form>
            </Form>
          ) : loadError ? (
            <p className="text-sm text-muted-foreground">Resolve the error above, then retry.</p>
          ) : (
            <SettingsFormSkeleton />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
