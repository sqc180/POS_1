"use client"

import { AppShell, type ShellNavItem } from "@/components/app-shell"
import { ModuleHintBanner } from "@/components/module-hint-banner"
import { useAuth } from "@/components/auth-provider"
import { Skeleton } from "@repo/ui"
import { useRouter } from "next/navigation"
import { useEffect, type ReactNode } from "react"
import { getToken } from "@/lib/auth-storage"
import { applyPosBehaviorToNav } from "@/lib/resolve-pos-nav"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !getToken()) router.replace("/login")
  }, [loading, router])

  if (loading || !me) {
    return (
      <div className="flex min-h-screen flex-col gap-6 bg-muted/30 p-6 sm:p-8">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-4 w-full max-w-md rounded-md" />
        <Skeleton className="h-72 w-full max-w-content rounded-xl" />
      </div>
    )
  }

  const menuPos = me.menu.find((m) => m.id === "pos")
  const hintsForPos =
    me.contextBranchCode && me.branchBehaviorHints ? me.branchBehaviorHints : me.tenant.behaviorHints
  const baseNav = applyPosBehaviorToNav(
    me.menu.map((m) => ({ id: m.id, label: m.label, href: m.href })),
    hintsForPos,
    menuPos?.href ?? "/pos",
  )
  const hasGuide = baseNav.some((n) => n.id === "guide")
  const nav: ShellNavItem[] = hasGuide
    ? baseNav
    : [...baseNav, { id: "guide", label: "Guide & samples", href: "/settings/guide" }]

  return (
    <AppShell
      nav={nav}
      businessLabel={me.tenant.name}
      portalTheme={me.tenant.portalTheme}
      portalExperienceId={me.tenant.portalExperienceId}
      navGroupDefs={me.navGroups}
    >
      <div className="flex w-full flex-col gap-6">
        <ModuleHintBanner />
        {children}
      </div>
    </AppShell>
  )
}
