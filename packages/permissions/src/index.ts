import type { UserRole } from "@repo/types"

export const Permission = {
  dashboard: "dashboard.view",
  pos: "pos.use",
  products: "products.manage",
  categories: "categories.manage",
  inventory: "inventory.manage",
  branches: "branches.manage",
  stock: "stock.manage",
  customers: "customers.manage",
  suppliers: "suppliers.manage",
  billing: "billing.manage",
  payments: "payments.manage",
  receipts: "receipts.manage",
  refunds: "refunds.manage",
  gst: "gst.manage",
  users: "users.manage",
  users_password: "users.password",
  settings: "settings.manage",
  gateway: "gateway.manage",
  audit: "audit.view",
} as const

export type PermissionId = (typeof Permission)[keyof typeof Permission]

const all = Object.values(Permission) as PermissionId[]

export const ROLE_PERMISSIONS: Record<UserRole, readonly PermissionId[]> = {
  owner: all,
  admin: all,
  manager: [
    Permission.dashboard,
    Permission.pos,
    Permission.products,
    Permission.categories,
    Permission.branches,
    Permission.inventory,
    Permission.stock,
    Permission.customers,
    Permission.suppliers,
    Permission.billing,
    Permission.payments,
    Permission.receipts,
    Permission.refunds,
    Permission.gst,
    Permission.users,
    Permission.settings,
    Permission.audit,
  ],
  cashier: [
    Permission.dashboard,
    Permission.pos,
    Permission.customers,
    Permission.receipts,
    Permission.billing,
    Permission.payments,
  ],
  billing_staff: [
    Permission.dashboard,
    Permission.billing,
    Permission.payments,
    Permission.receipts,
    Permission.refunds,
    Permission.customers,
    Permission.gst,
  ],
  inventory_staff: [
    Permission.dashboard,
    Permission.branches,
    Permission.inventory,
    Permission.stock,
    Permission.products,
    Permission.categories,
    Permission.suppliers,
  ],
  accountant: [
    Permission.dashboard,
    Permission.billing,
    Permission.payments,
    Permission.receipts,
    Permission.refunds,
    Permission.gst,
    Permission.audit,
    Permission.customers,
    Permission.suppliers,
  ],
  viewer: [
    Permission.dashboard,
    Permission.audit,
    Permission.customers,
    Permission.suppliers,
    Permission.products,
    Permission.categories,
  ],
}

export const permissionsForRole = (role: UserRole): readonly PermissionId[] => ROLE_PERMISSIONS[role]

export const hasPermission = (role: UserRole, permission: PermissionId): boolean =>
  ROLE_PERMISSIONS[role].includes(permission)

export const assertPermission = (role: UserRole, permission: PermissionId): void => {
  if (!hasPermission(role, permission)) {
    const err = new Error(`Forbidden: missing ${permission}`)
    ;(err as Error & { statusCode?: number }).statusCode = 403
    throw err
  }
}

export const canManagePasswords = (role: UserRole): boolean =>
  role === "owner" || role === "admin"

export const canManageUsers = (role: UserRole): boolean =>
  role === "owner" || role === "admin" || role === "manager"

/** Create user or set initial password — owner/admin only */
export const canCreateUserOrSetPassword = (role: UserRole): boolean =>
  role === "owner" || role === "admin"
