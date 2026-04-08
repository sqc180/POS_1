"use client"

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
  Skeleton,
} from "@repo/ui"
import type { DashboardSummaryDTO } from "@repo/types"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { PageHeader, PageHeaderRule } from "@/components/page-header"
import { useAuth } from "@/components/auth-provider"
import { apiRequest } from "@/lib/api"
import { notifyError } from "@/lib/notify"

type Kpi = {
  label: string
  value: number
  href: string
  hint?: string
}

const DASHBOARD_KPI_SKELETON_COUNT = 9

const DashboardKpiSkeletonGrid = () => (
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {Array.from({ length: DASHBOARD_KPI_SKELETON_COUNT }, (_, i) => (
      <Card key={i} className="border-border/80 shadow-elevate-sm">
        <CardHeader className="pb-1 pt-4">
          <Skeleton className="h-3 w-28" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pb-4">
          <Skeleton className="h-8 w-14" />
          <Skeleton className="h-8 w-full max-w-[5.5rem] rounded-md" />
        </CardContent>
      </Card>
    ))}
  </div>
)

export default function DashboardPage() {
  const { me } = useAuth()
  const [summary, setSummary] = useState<DashboardSummaryDTO | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await apiRequest<DashboardSummaryDTO>("/dashboard/summary")
    if (!res.success) {
      notifyError(res.error.message)
      setSummary(null)
    } else {
      setSummary(res.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const kpis: Kpi[] = useMemo(() => {
    if (!summary) return []
    const items: Kpi[] = [
      { label: "Active products", value: summary.productsActive, href: "/products" },
      { label: "Categories", value: summary.categoriesActive, href: "/categories" },
    ]
    if (me?.menu?.some((i) => i.id === "branches")) {
      items.push({
        label: "Active locations",
        value: summary.branchesActive,
        href: "/branches",
        hint: "Shops & warehouses",
      })
    }
    items.push(
      { label: "Customers", value: summary.customersActive, href: "/customers" },
      { label: "Suppliers", value: summary.suppliersActive, href: "/suppliers" },
      { label: "Inventory rows", value: summary.inventoryItems, href: "/inventory", hint: "Linked to products" },
      { label: "Draft invoices", value: summary.draftInvoices, href: "/invoices" },
      { label: "Completed invoices", value: summary.completedInvoices, href: "/invoices" },
      { label: "Pending refunds", value: summary.pendingRefunds, href: "/refunds" },
    )
    return items
  }, [summary, me?.menu])

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Live counts for your workspace — open a module to act."
        actions={
          <Button type="button" variant="outline" size="sm" className="border-border/80" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />
      <PageHeaderRule />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/80 shadow-elevate-sm transition-shadow duration-200 hover:shadow-elevate">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Business</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{me?.tenant.name}</p>
            <Badge variant="secondary" className="mt-2 capitalize">
              {me?.tenant.businessType}
            </Badge>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-elevate-sm transition-shadow duration-200 hover:shadow-elevate">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Your role</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold capitalize">{me?.user.role.replaceAll("_", " ")}</p>
          </CardContent>
        </Card>
        <Card className="border-border/80 shadow-elevate-sm transition-shadow duration-200 hover:shadow-elevate">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Permissions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{me?.permissions.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Effective after business-type filter</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Operational snapshot</h2>
        {loading && !summary ? (
          <DashboardKpiSkeletonGrid />
        ) : kpis.length === 0 ? (
          <Alert variant="destructive" className="border-destructive/40 shadow-elevate-sm">
            <AlertTitle>Metrics unavailable</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-destructive/90">The dashboard summary could not be loaded.</span>
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
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((k) => (
              <Card key={k.label} className="border-border/80 shadow-elevate-sm transition-shadow duration-200 hover:shadow-elevate">
                <CardHeader className="pb-1 pt-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground">{k.label}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 pb-4">
                  <p className="text-2xl font-semibold tabular-nums">{k.value}</p>
                  {k.hint ? <p className="text-xs text-muted-foreground">{k.hint}</p> : null}
                  <Button variant="secondary" size="sm" className="w-full sm:w-auto" asChild>
                    <Link href={k.href}>Open</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
