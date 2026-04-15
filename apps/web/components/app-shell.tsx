"use client"

import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ScrollArea,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui"
import { cn } from "@repo/ui"
import type { PortalNavGroupDTO, PortalThemeDTO } from "@repo/types"
import { ChevronDown, ChevronLeft, ChevronRight, Menu } from "lucide-react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"
import { useAuth } from "@/components/auth-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  groupNavForShell,
  isNavItemActive,
  navIconForId,
  type NavItemLike,
  workspaceInitials,
  type NavGroupDefLike,
} from "@/lib/nav-shell-groups"

const SIDEBAR_COLLAPSED_KEY = "pos-erp-sidebar-collapsed"

const workspaceModeLabel = (portalExperienceId: string): string => {
  if (portalExperienceId === "core_retail") return "Retail"
  if (portalExperienceId === "core_supermart") return "Supermart"
  return portalExperienceId.replace(/_/g, " ")
}

export type ShellNavItem = { id: string; label: string; href: string }

const NavItemRow = ({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItemLike
  pathname: string
  collapsed: boolean
  onNavigate?: () => void
}) => {
  const active = isNavItemActive(pathname, item.href)
  const Icon = navIconForId(item.id)
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--sidebar))]",
        collapsed ? "justify-center px-2" : "",
        active
          ? "bg-sidebar-accent/95 text-sidebar-accent-foreground shadow-elevate-sm before:absolute before:left-0 before:top-1/2 before:h-7 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-sidebar-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/45 hover:text-sidebar-foreground",
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0", active ? "text-sidebar-accent-foreground" : "opacity-90")} aria-hidden />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </Link>
  )
  if (collapsed) {
    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="max-w-[14rem] border-border/80 font-medium shadow-elevate-sm">
          {item.label}
        </TooltipContent>
      </Tooltip>
    )
  }
  return link
}

const GroupedNav = ({
  pathname,
  grouped,
  openSections,
  setOpenSections,
  collapsed,
  onNavigate,
  variant,
}: {
  pathname: string
  grouped: ReturnType<typeof groupNavForShell>
  openSections: Record<string, boolean>
  setOpenSections: Dispatch<SetStateAction<Record<string, boolean>>>
  collapsed: boolean
  onNavigate?: () => void
  variant: "desktop" | "mobile"
}) => {
  if (collapsed && variant === "desktop") {
    return (
      <div className="flex flex-col gap-1 px-2 py-2">
        {grouped.map((g, gi) => (
          <div key={g.key}>
            {gi > 0 ? <Separator className="my-2 bg-sidebar-border/80" /> : null}
            <div className="flex flex-col gap-0.5">
              {g.items.map((item) => (
                <NavItemRow key={item.id} item={item} pathname={pathname} collapsed onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-1 px-2 py-2">
      {grouped.map((group) => (
        <Collapsible
          key={group.key}
          open={openSections[group.key] ?? true}
          onOpenChange={(o) => setOpenSections((s) => ({ ...s, [group.key]: o }))}
          className="group rounded-xl border border-transparent data-[state=open]:border-sidebar-border/50 data-[state=open]:bg-sidebar-accent/20 data-[state=open]:shadow-elevate-sm"
        >
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="flex h-10 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-[0.65rem] font-bold uppercase tracking-widest text-sidebar-foreground/60 hover:bg-sidebar-accent/35 hover:text-sidebar-foreground"
            >
              <span className="truncate">{group.label}</span>
              <ChevronDown
                className="h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 group-data-[state=open]:rotate-180"
                aria-hidden
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-0.5 pb-2 pt-0.5 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            {group.items.map((item) => (
              <NavItemRow key={item.id} item={item} pathname={pathname} collapsed={false} onNavigate={onNavigate} />
            ))}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  )
}

export const AppShell = ({
  nav,
  children,
  businessLabel,
  portalTheme,
  portalExperienceId,
  navGroupDefs,
}: {
  nav: ShellNavItem[]
  children: ReactNode
  businessLabel: string
  portalTheme: PortalThemeDTO
  portalExperienceId: string
  navGroupDefs: readonly PortalNavGroupDTO[]
}) => {
  const pathname = usePathname()
  const { me, logout } = useAuth()
  const { resolvedTheme } = useTheme()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [themeMounted, setThemeMounted] = useState(false)

  const shellGroupDefs = useMemo(
    (): readonly NavGroupDefLike[] => navGroupDefs.map((g) => ({ key: g.key, label: g.label, ids: g.ids })),
    [navGroupDefs],
  )

  const grouped = useMemo(() => groupNavForShell(nav, shellGroupDefs), [nav, shellGroupDefs])

  useEffect(() => {
    setThemeMounted(true)
  }, [])

  const portalBackdropUrl =
    themeMounted && resolvedTheme === "dark" ? portalTheme.backgroundImageDark : portalTheme.backgroundImageLight

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") {
        setSidebarCollapsed(true)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0")
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    setOpenSections((prev) => {
      const next = { ...prev }
      for (const g of grouped) {
        if (g.items.some((i) => isNavItemActive(pathname, i.href))) {
          next[g.key] = true
        }
      }
      return next
    })
  }, [pathname, grouped])

  useEffect(() => {
    const t = me?.tenant.businessType
    if (t === "retail" || t === "supermart") {
      document.documentElement.setAttribute("data-business", t)
    } else {
      document.documentElement.removeAttribute("data-business")
    }
    return () => {
      document.documentElement.removeAttribute("data-business")
    }
  }, [me?.tenant.businessType])

  useEffect(() => {
    document.documentElement.setAttribute("data-experience", portalExperienceId)
    return () => {
      document.documentElement.removeAttribute("data-experience")
    }
  }, [portalExperienceId])

  const DIRECTORY_HREFS = ["/categories", "/branches", "/suppliers", "/customers"] as const
  const directoryNav = DIRECTORY_HREFS.map((href) => nav.find((item) => item.href === href)).filter(
    (item): item is ShellNavItem => Boolean(item),
  )

  const modeLabel = workspaceModeLabel(portalExperienceId)
  const initials = useMemo(() => workspaceInitials(businessLabel), [businessLabel])

  const toggleCollapsed = useCallback(() => {
    setSidebarCollapsed((c) => !c)
  }, [])

  return (
    <TooltipProvider delayDuration={200}>
    <div className="relative flex min-h-screen w-full">
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${portalBackdropUrl})` }}
        />
        <div className={cn("absolute inset-0", portalTheme.overlayClassName)} />
      </div>
      <div className="relative z-[1] flex min-h-screen w-full bg-muted/30 dark:bg-muted/20">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh max-h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-shell transition-[width] duration-200 ease-out lg:flex",
          sidebarCollapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        {sidebarCollapsed ? (
          <div className="shrink-0 border-b border-sidebar-border px-2 py-3">
            <div className="flex flex-col items-center gap-2">
              <Avatar className="h-10 w-10 rounded-xl border border-sidebar-border/60 shadow-elevate-sm">
                <AvatarFallback className="rounded-xl bg-sidebar-accent/50 text-xs font-bold text-sidebar-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 border-sidebar-border/70 bg-sidebar-accent/25 text-sidebar-foreground hover:bg-sidebar-accent/45 hover:text-sidebar-foreground"
                onClick={toggleCollapsed}
                aria-label="Expand sidebar"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        ) : (
          <div className="shrink-0 border-b border-sidebar-border px-3 py-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-sidebar-foreground/60">
                  Workspace
                </p>
                <div className="text-sm font-semibold leading-snug tracking-tight text-sidebar-foreground">
                  {businessLabel}
                </div>
                <Badge
                  variant="outline"
                  className="w-fit border-sidebar-border/70 bg-sidebar-accent/30 text-[0.65rem] font-medium capitalize text-sidebar-foreground"
                >
                  {modeLabel}
                </Badge>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-0.5 h-8 w-8 shrink-0 text-sidebar-foreground/80 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                onClick={toggleCollapsed}
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        )}
        <ScrollArea className="min-h-0 flex-1">
          <GroupedNav
            pathname={pathname}
            grouped={grouped}
            openSections={openSections}
            setOpenSections={setOpenSections}
            collapsed={sidebarCollapsed}
            variant="desktop"
          />
        </ScrollArea>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border/80 bg-card/90 px-3 shadow-elevate-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/75 lg:px-6">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="border-border/80 lg:hidden" aria-label="Open menu">
                <span className="sr-only">Menu</span>
                <Menu className="h-5 w-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[min(100vw-1rem,20rem)] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-md"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Main menu</SheetTitle>
                <SheetDescription>Workspace navigation and module links for small screens.</SheetDescription>
              </SheetHeader>
              <div className="border-b border-sidebar-border px-4 py-4">
                <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-sidebar-foreground/60">
                  Workspace
                </p>
                <div className="mt-1 text-sm font-semibold text-sidebar-foreground">{businessLabel}</div>
                <Badge
                  variant="outline"
                  className="mt-2 w-fit border-sidebar-border/70 bg-sidebar-accent/30 text-[0.65rem] capitalize text-sidebar-foreground"
                >
                  {modeLabel}
                </Badge>
              </div>
              <ScrollArea className="max-h-[calc(100dvh-8rem)]">
                <GroupedNav
                  pathname={pathname}
                  grouped={grouped}
                  openSections={openSections}
                  setOpenSections={setOpenSections}
                  collapsed={false}
                  onNavigate={() => setSheetOpen(false)}
                  variant="mobile"
                />
              </ScrollArea>
            </SheetContent>
          </Sheet>
          <div className="flex flex-1 items-center justify-between gap-2">
            <div className="truncate text-sm font-medium text-muted-foreground lg:hidden">Navigation</div>
            <div className="ml-auto flex items-center gap-2">
              {directoryNav.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="border-border/80 shadow-none">
                      <span className="sm:hidden">Masters</span>
                      <span className="hidden sm:inline">Directory</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                      Catalog, locations &amp; partners
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {directoryNav.map((item) => (
                      <DropdownMenuItem key={item.id} asChild>
                        <Link href={item.href}>{item.label}</Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <ThemeToggle />
              <Button variant="outline" size="sm" className="hidden border-border/80 sm:inline-flex" asChild>
                <Link href="/settings/guide">Guide</Link>
              </Button>
              <Button variant="ghost" size="sm" className="sm:hidden" asChild>
                <Link href="/settings/guide" aria-label="Open guide and samples">
                  ?
                </Link>
              </Button>
              <span className="hidden max-w-[10rem] truncate text-sm text-muted-foreground sm:inline">{me?.user.name}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" className="shadow-elevate-sm">
                    Account
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                    {me?.user.role}
                  </DropdownMenuItem>
                  <Separator className="my-1" />
                  <DropdownMenuItem onClick={() => logout()}>Log out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>
        <main className="relative flex-1 bg-gradient-to-b from-background/40 via-background/55 to-background/70 p-4 backdrop-blur-[2px] sm:p-6 lg:p-8 dark:from-background/50 dark:via-background/65 dark:to-background/80">
          <div className="mx-auto w-full max-w-content">{children}</div>
        </main>
      </div>
      </div>
    </div>
    </TooltipProvider>
  )
}
