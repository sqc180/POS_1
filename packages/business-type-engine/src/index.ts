import type { PermissionId } from "@repo/permissions"
import { Permission, hasPermission } from "@repo/permissions"
import type { BusinessTypeId, NavItemDTO, UserRole } from "@repo/types"

export {
  FUTURE_BUSINESS_TYPE_ROADMAP,
  type FutureBusinessTypeSlug,
  resolveActiveBusinessType,
} from "./future-registry"

export {
  VerticalCapability,
  assertPilotCapabilityMapComplete,
  getCreditPolicyForCapabilities,
  hasVerticalCapability,
  isPilotVerticalSlug,
  PILOT_VERTICAL_SLUGS,
  resolveVerticalCapabilities,
} from "./vertical-capabilities"

export type { CreditPolicyHint } from "./vertical-capabilities"

export const BUSINESS_TYPES = ["retail", "supermart"] as const satisfies readonly BusinessTypeId[]

export type FeatureKey =
  | "pos"
  | "products"
  | "categories"
  | "branches"
  | "inventory"
  | "stock"
  | "customers"
  | "suppliers"
  | "billing"
  | "payments"
  | "receipts"
  | "refunds"
  | "gst"
  | "users"
  | "settings"
  | "gateway"
  | "audit"

const retailFeatures: Record<FeatureKey, boolean> = {
  pos: true,
  products: true,
  categories: true,
  branches: true,
  inventory: true,
  stock: true,
  customers: true,
  suppliers: true,
  billing: true,
  payments: true,
  receipts: true,
  refunds: true,
  gst: true,
  users: true,
  settings: true,
  gateway: true,
  audit: true,
}

const supermartFeatures: Record<FeatureKey, boolean> = {
  ...retailFeatures,
}

const featureMaps: Record<BusinessTypeId, Record<FeatureKey, boolean>> = {
  retail: retailFeatures,
  supermart: supermartFeatures,
}

export const getFeatureMap = (businessType: BusinessTypeId): Record<FeatureKey, boolean> =>
  featureMaps[businessType] ?? retailFeatures

const featureToPermission: Partial<Record<FeatureKey, PermissionId>> = {
  pos: Permission.pos,
  products: Permission.products,
  categories: Permission.categories,
  branches: Permission.branches,
  inventory: Permission.inventory,
  stock: Permission.stock,
  customers: Permission.customers,
  suppliers: Permission.suppliers,
  billing: Permission.billing,
  payments: Permission.payments,
  receipts: Permission.receipts,
  refunds: Permission.refunds,
  gst: Permission.gst,
  users: Permission.users,
  settings: Permission.settings,
  gateway: Permission.gateway,
  audit: Permission.audit,
}

const baseMenu: Omit<NavItemDTO, "children">[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard" },
  { id: "pos", label: "POS", href: "/pos" },
  { id: "products", label: "Products", href: "/products" },
  { id: "categories", label: "Categories", href: "/categories" },
  { id: "branches", label: "Branches & locations", href: "/branches" },
  { id: "inventory", label: "Inventory", href: "/inventory" },
  { id: "stock", label: "Stock", href: "/stock" },
  { id: "customers", label: "Customers", href: "/customers" },
  { id: "suppliers", label: "Suppliers", href: "/suppliers" },
  { id: "billing", label: "Billing", href: "/invoices" },
  { id: "payments", label: "Payments", href: "/payments" },
  { id: "receipts", label: "Receipts", href: "/receipts" },
  { id: "refunds", label: "Refunds", href: "/refunds" },
  { id: "gst", label: "GST", href: "/gst" },
  { id: "users", label: "Users", href: "/users" },
  { id: "roles", label: "Roles", href: "/roles" },
  { id: "documents", label: "Documents", href: "/documents" },
  { id: "settings", label: "Settings", href: "/settings" },
  { id: "audit", label: "Audit log", href: "/settings/audit" },
  { id: "gateway", label: "Gateway", href: "/settings/gateway" },
]

export const filterPermissionsByBusinessType = (
  businessType: BusinessTypeId,
  permissions: readonly PermissionId[],
): PermissionId[] => {
  const fm = getFeatureMap(businessType)
  return permissions.filter((p) => {
    const entry = Object.entries(featureToPermission).find(([, perm]) => perm === p)
    if (!entry) return true
    const feature = entry[0] as FeatureKey
    return fm[feature] !== false
  })
}

export const getMenuForRole = (
  businessType: BusinessTypeId,
  role: UserRole,
): NavItemDTO[] => {
  const fm = getFeatureMap(businessType)
  return baseMenu
    .filter((item) => {
      if (item.id === "dashboard" || item.id === "documents") return hasPermission(role, Permission.dashboard)
      const key = item.id as FeatureKey
      if (key in fm && fm[key as FeatureKey] === false) return false
      if (item.id === "roles") return hasPermission(role, Permission.users)
      const perm = featureToPermission[item.id as FeatureKey]
      if (!perm) return true
      return hasPermission(role, perm)
    })
    .map((item) => ({ ...item }))
}

export const resolveProductFieldExtensions = (
  businessType: BusinessTypeId,
): { optionalFields: string[]; requiredFields: string[] } => {
  if (businessType === "supermart") {
    return {
      requiredFields: ["sku", "sellingPrice"],
      optionalFields: ["brand", "unit", "mrp", "barcode"],
    }
  }
  return {
    requiredFields: ["sku", "sellingPrice"],
    optionalFields: ["brand", "unit", "mrp", "barcode"],
  }
}

export const inventoryBehaviorHint = (
  businessType: BusinessTypeId,
): { allowNegativeDefault: boolean; batchReady: boolean; expiryReady: boolean } => ({
  allowNegativeDefault: false,
  batchReady: businessType === "supermart",
  expiryReady: businessType === "supermart",
})

export const posModeHint = (businessType: BusinessTypeId): "standard" | "high_volume" =>
  businessType === "supermart" ? "high_volume" : "standard"

export type InvoiceBehaviorHint = {
  allowDraftEdits: boolean
  requireCustomerForB2B: boolean
  defaultDueDays: number
}

export const invoiceBehaviorMap: Record<BusinessTypeId, InvoiceBehaviorHint> = {
  retail: { allowDraftEdits: true, requireCustomerForB2B: false, defaultDueDays: 0 },
  supermart: { allowDraftEdits: true, requireCustomerForB2B: false, defaultDueDays: 0 },
}

export const getInvoiceBehavior = (businessType: BusinessTypeId): InvoiceBehaviorHint =>
  invoiceBehaviorMap[businessType] ?? invoiceBehaviorMap.retail

export type TaxBehaviorHint = {
  defaultIntraState: boolean
  showHsnPlaceholder: boolean
}

export const taxBehaviorMap: Record<BusinessTypeId, TaxBehaviorHint> = {
  retail: { defaultIntraState: true, showHsnPlaceholder: false },
  supermart: { defaultIntraState: true, showHsnPlaceholder: true },
}

export const getTaxBehavior = (businessType: BusinessTypeId): TaxBehaviorHint =>
  taxBehaviorMap[businessType] ?? taxBehaviorMap.retail

export type DocumentBehaviorHint = {
  invoiceFooterNote: string
  receiptFooterNote: string
}

export const documentBehaviorMap: Record<BusinessTypeId, DocumentBehaviorHint> = {
  retail: {
    invoiceFooterNote: "Thank you for your business.",
    receiptFooterNote: "Payment received — thank you.",
  },
  supermart: {
    invoiceFooterNote: "Thank you — visit again.",
    receiptFooterNote: "Save this receipt for exchanges.",
  },
}

export const getDocumentBehavior = (businessType: BusinessTypeId): DocumentBehaviorHint =>
  documentBehaviorMap[businessType] ?? documentBehaviorMap.retail
