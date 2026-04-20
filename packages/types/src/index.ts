export type BusinessTypeId = "retail" | "supermart"

export type UserRole =
  | "owner"
  | "admin"
  | "manager"
  | "cashier"
  | "billing_staff"
  | "inventory_staff"
  | "accountant"
  | "viewer"

export type TenantStatus = "active" | "suspended"

export type UserStatus =
  | "active"
  | "inactive"
  | "invited"
  | "suspended"
  | "deactivated"
  | "archived"

export type TaxMode = "inclusive" | "exclusive"

export type StockMovementType =
  | "in"
  | "out"
  | "adjustment"
  | "correction"
  | "transfer"
  | "opening"
  | "purchase"
  | "purchase_return"
  | "sale"
  | "sale_return"
  | "transfer_out"
  | "transfer_in"
  | "production_consumption"
  | "production_output"
  | "damage"
  | "expiry_write_off"

export interface UserPublic {
  id: string
  email: string
  name: string
  phone?: string
  role: UserRole
  status: UserStatus
  tenantId: string
  /** Omitted or null = all branches; non-empty = restricted to these branch codes. */
  branchCodes?: string[] | null
  lastLoginAt?: string
  createdAt: string
  updatedAt: string
}

/** Pack-derived hints for shells (POS, dashboard). Source of truth for flags remains `capabilities`. */
export interface TenantBehaviorHintsDTO {
  defaultPosMode: string
  defaultInventoryMode: string
  gstProfileHint: string
  posShellRoute?: string | null
  dashboardAccent?: string | null
}

/** Full-shell background theming from `portalExperienceId` (public asset paths). */
export interface PortalThemeDTO {
  backgroundImageLight: string
  backgroundImageDark: string
  overlayClassName: string
  /** Mirrors capability pack `uiRules.dashboardAccent` when experience maps to a pack. */
  dashboardAccent?: string | null
}

/** Sidebar section config from server (matches business-type-engine portal groups). */
export interface PortalNavGroupDTO {
  key: string
  label: string
  ids: string[]
}

/** Page chrome titles for POS / billing / receipts screens. */
export interface PortalPageCopyDTO {
  posScreenTitle: string
  billingScreenTitle: string
  receiptsScreenTitle: string
}

export interface TenantDTO {
  id: string
  name: string
  businessType: BusinessTypeId
  status: TenantStatus
  /** Optional pilot vertical (e.g. pharmacy); set at onboarding or settings. */
  pilotVertical?: string | null
  /** Tenant-level extra pack ids (roadmap slugs), unioned with pilot capabilities. */
  enabledPackIds?: string[]
  /** Derived from pilot + tenant/branch packs; empty when no pilot and no packs. */
  capabilities: string[]
  /** Resolved UI/service hints — prefer over raw businessType for industry shells. */
  behaviorHints?: TenantBehaviorHintsDTO
  /** Shell identity: `core_retail`, `core_supermart`, or a pilot vertical slug. */
  portalExperienceId: string
  portalTheme: PortalThemeDTO
  createdAt: string
  updatedAt: string
}

/** Capability-driven product form hints (matches engine `ProductFieldHintRow`). */
export interface ProductFieldHintDTO {
  key: string
  visible: boolean
  section: string
}

export interface MeResponse {
  user: UserPublic
  tenant: TenantDTO
  permissions: string[]
  menu: NavItemDTO[]
  /** Sidebar grouping for the signed-in portal experience (server-resolved). */
  navGroups: PortalNavGroupDTO[]
  /** Page titles for key commerce routes (aligned with menu terminology). */
  portalPageCopy: PortalPageCopyDTO
  features: Record<string, boolean>
  /** Declarative product field visibility from resolved capabilities (tenant scope). */
  productFieldHints?: ProductFieldHintDTO[]
  /** Present when GET /me was called with `branchCode` and the branch exists. */
  branchCapabilities?: string[]
  /** Echo of the branch code used for `branchCapabilities`, if any. */
  contextBranchCode?: string | null
  /** Pack hints when `branchCode` was supplied and branch exists (branch-scoped resolution). */
  branchBehaviorHints?: TenantBehaviorHintsDTO
  /** Branch-scoped field hints when `branchCode` was supplied and branch exists. */
  branchProductFieldHints?: ProductFieldHintDTO[]
}

export interface NavItemDTO {
  id: string
  label: string
  href: string
  icon?: string
  children?: NavItemDTO[]
}

export interface AuditLogEntryDTO {
  id: string
  actorId: string
  action: string
  entity: string
  entityId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

/** Tenant-scoped counts for dashboard KPIs (read-only aggregates). */
export interface DashboardSummaryDTO {
  productsActive: number
  categoriesActive: number
  branchesActive: number
  customersActive: number
  suppliersActive: number
  inventoryItems: number
  draftInvoices: number
  completedInvoices: number
  pendingRefunds: number
  /** Active batches expiring within 60 days (0 when none). */
  batchesNearExpiry: number
}

export interface ApiSuccess<T> {
  success: true
  data: T
}

export interface ApiErrorBody {
  success: false
  error: { code: string; message: string }
}

export type FileAssetDocumentType =
  | "invoice_pdf"
  | "receipt_pdf"
  | "refund_note_pdf"
  | "business_logo"
  | "product_image"
  | "generic_document"

export type FileAssetModule = "documents" | "branding" | "products" | "temp"

export type FileAssetStatus = "active" | "deleted" | "archived"

export interface FileAssetPublic {
  id: string
  tenantId: string
  module: FileAssetModule
  documentType: FileAssetDocumentType
  relatedEntityType: string
  relatedEntityId: string
  originalFileName: string
  storedFileName: string
  relativePath: string
  mimeType: string
  extension: string
  fileSize: number
  checksumSha256: string
  storageProvider: string
  status: FileAssetStatus
  version: number
  createdBy: string
  createdAt: string
  updatedAt: string
}
