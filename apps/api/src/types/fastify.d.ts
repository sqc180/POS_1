import type { PermissionId } from "@repo/permissions"
import type { UserRole } from "@repo/types"

declare module "fastify" {
  interface FastifyRequest {
    auth?: {
      userId: string
      tenantId: string
      role: UserRole
    }
  }
}

export type AuthContext = {
  userId: string
  tenantId: string
  role: UserRole
}

export type { PermissionId }
