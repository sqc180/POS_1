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

export type UserStatus = "active" | "inactive"

export type TaxMode = "inclusive" | "exclusive"

export type StockMovementType = "in" | "out" | "adjustment" | "correction" | "transfer"

export interface UserPublic {
  id: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
  tenantId: string
  lastLoginAt?: string
  createdAt: string
  updatedAt: string
}

export interface TenantDTO {
  id: string
  name: string
  businessType: BusinessTypeId
  status: TenantStatus
  createdAt: string
  updatedAt: string
}

export interface MeResponse {
  user: UserPublic
  tenant: TenantDTO
  permissions: string[]
  menu: NavItemDTO[]
  features: Record<string, boolean>
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
