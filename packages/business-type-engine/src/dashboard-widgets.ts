import type { VerticalCapability } from "./vertical-capability-codes"
import { hasVerticalCapability } from "./vertical-capabilities"

export interface DashboardWidgetSpec {
  id: string
  title: string
  description: string
  href: string
  /** When set, widget is shown only if capability is present. */
  requiredCapability?: VerticalCapability
}

const catalog: readonly DashboardWidgetSpec[] = [
  {
    id: "near_expiry",
    title: "Near expiry",
    description: "Batch lines approaching expiry — pharmacy and medical workflows.",
    href: "/inventory",
    requiredCapability: "batch_expiry",
  },
  {
    id: "inter_branch_transfer",
    title: "Inter-branch transfer",
    description: "Move stock between locations with an audit trail.",
    href: "/stock#inter-branch-transfer",
    requiredCapability: "inter_store_transfer",
  },
  {
    id: "fast_moving_loose",
    title: "Loose / weight items",
    description: "Highlights grocery-style units and loose sales.",
    href: "/products",
    requiredCapability: "weight_break_bulk",
  },
  {
    id: "credit_ageing",
    title: "Credit & receivables",
    description: "Wholesale-style credit signals and ageing focus.",
    href: "/customers",
    requiredCapability: "credit_policy_strict",
  },
  {
    id: "consolidated_branch",
    title: "Branch comparison",
    description: "Mixed-branch reporting and consolidated KPIs.",
    href: "/branches",
    requiredCapability: "consolidated_reporting",
  },
] as const

export const listAllDashboardWidgetSpecs = (): readonly DashboardWidgetSpec[] => catalog

export const getDashboardWidgetsForCapabilities = (capabilities: readonly string[] | null | undefined): DashboardWidgetSpec[] => {
  return catalog.filter((w) => !w.requiredCapability || hasVerticalCapability(capabilities, w.requiredCapability))
}
