import type { LucideIcon } from "lucide-react"
import {
  ArrowLeftRight,
  BookOpen,
  Building2,
  Circle,
  CreditCard,
  FileText,
  Files,
  FolderTree,
  LayoutDashboard,
  Package,
  Percent,
  Receipt,
  RotateCcw,
  ScanLine,
  ScrollText,
  Settings,
  Shield,
  Truck,
  UserCog,
  Users,
  WalletCards,
  Warehouse,
} from "lucide-react"

export type NavItemLike = { id: string; label: string; href: string }

export const groupNavForShell = (nav: NavItemLike[]) => {
  const defs = [
    { key: "overview", label: "Overview", ids: ["dashboard", "documents"] },
    { key: "sales", label: "Sales & payments", ids: ["pos", "billing", "payments", "receipts", "refunds"] },
    { key: "catalog", label: "Catalog & inventory", ids: ["products", "categories", "branches", "inventory", "stock"] },
    { key: "partners", label: "Customers & suppliers", ids: ["customers", "suppliers"] },
    { key: "tax", label: "Tax", ids: ["gst"] },
    { key: "team", label: "Team & access", ids: ["users", "roles"] },
    { key: "system", label: "Settings & system", ids: ["settings", "audit", "gateway", "guide"] },
  ] as const

  const byId = new Map(nav.map((i) => [i.id, i]))
  const used = new Set<string>()
  const groups: { key: string; label: string; items: NavItemLike[] }[] = []

  for (const d of defs) {
    const items: NavItemLike[] = []
    for (const id of d.ids) {
      const it = byId.get(id)
      if (it) {
        items.push(it)
        used.add(id)
      }
    }
    if (items.length > 0) groups.push({ key: d.key, label: d.label, items })
  }
  const orphans = nav.filter((i) => !used.has(i.id))
  if (orphans.length > 0) groups.push({ key: "more", label: "More", items: orphans })
  return groups
}

const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  pos: ScanLine,
  products: Package,
  categories: FolderTree,
  branches: Building2,
  inventory: Warehouse,
  stock: ArrowLeftRight,
  customers: Users,
  suppliers: Truck,
  billing: FileText,
  payments: CreditCard,
  receipts: Receipt,
  refunds: RotateCcw,
  gst: Percent,
  users: UserCog,
  roles: Shield,
  documents: Files,
  settings: Settings,
  audit: ScrollText,
  gateway: WalletCards,
  guide: BookOpen,
}

export const navIconForId = (id: string): LucideIcon => iconMap[id] ?? Circle

export const isNavItemActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`)

export const workspaceInitials = (businessLabel: string): string => {
  const parts = businessLabel.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]!.slice(0, 1) + parts[1]!.slice(0, 1)).toUpperCase()
  const w = businessLabel.trim().slice(0, 2).toUpperCase()
  return w || "?"
}
