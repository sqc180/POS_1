import mongoose from "mongoose"
import type { ApiEnv } from "@repo/config"
import {
  filterPermissionsByBusinessType,
  getFeatureMap,
  getMenuForRole,
  resolveActiveBusinessType,
} from "@repo/business-type-engine"
import { canCreateUserOrSetPassword, permissionsForRole } from "@repo/permissions"
import type { BusinessTypeId, UserRole, UserStatus } from "@repo/types"
import { TenantModel } from "../models/tenant.model.js"
import { UserModel, type UserDoc } from "../models/user.model.js"
import { auditService } from "./audit.service.js"
import { authService } from "./auth.service.js"

const toPublic = (u: UserDoc) => ({
  id: u._id.toString(),
  email: u.email,
  name: u.name,
  role: u.role as UserRole,
  status: u.status as UserStatus,
  tenantId: u.tenantId.toString(),
  lastLoginAt: u.lastLoginAt?.toISOString(),
  createdAt: u.createdAt?.toISOString?.() ?? new Date().toISOString(),
  updatedAt: u.updatedAt?.toISOString?.() ?? new Date().toISOString(),
})

export const userService = {
  toPublic,

  async list(tenantId: string) {
    const users = await UserModel.find({ tenantId: new mongoose.Types.ObjectId(tenantId) }).sort({ createdAt: -1 })
    return users.map(toPublic)
  },

  async getById(tenantId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null
    const u = await UserModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    return u ? toPublic(u) : null
  },

  async create(
    env: ApiEnv,
    tenantId: string,
    actorId: string,
    actorRole: UserRole,
    input: { email: string; password: string; name: string; role: UserRole },
  ) {
    if (!canCreateUserOrSetPassword(actorRole)) {
      const err = new Error("Only owner or admin can create users")
      ;(err as Error & { statusCode?: number }).statusCode = 403
      throw err
    }
    if (input.role === "owner") {
      const err = new Error("Cannot create owner users")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const passwordPlain = String(input.password ?? "").trim()
    const passwordHash = await authService.hashPassword(passwordPlain, env)
    let user
    try {
      user = await UserModel.create({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        email: input.email.toLowerCase().trim(),
        passwordHash,
        name: input.name,
        role: input.role,
        status: "active",
      })
    } catch (e: unknown) {
      const o = typeof e === "object" && e !== null ? (e as { code?: number; message?: string }) : {}
      const dup = o.code === 11000 || (typeof o.message === "string" && o.message.includes("E11000"))
      if (dup) {
        const err = new Error("A user with this email already exists in your workspace")
        ;(err as Error & { statusCode?: number }).statusCode = 409
        throw err
      }
      throw e
    }
    await auditService.log({
      tenantId,
      actorId,
      action: "user.create",
      entity: "User",
      entityId: user._id.toString(),
      metadata: { email: user.email, role: user.role },
    })
    return toPublic(user)
  },

  async update(
    tenantId: string,
    actorId: string,
    actorRole: UserRole,
    id: string,
    input: Partial<{ name: string; role: UserRole; status: UserStatus }>,
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid user id")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const user = await UserModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!user) {
      const err = new Error("User not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    const roleChanged = input.role !== undefined && input.role !== user.role
    const statusChanged = input.status !== undefined && input.status !== user.status
    const isPrivilegedChange = roleChanged || statusChanged
    if (isPrivilegedChange && !canCreateUserOrSetPassword(actorRole)) {
      const err = new Error("Only owner or admin can change role or status")
      ;(err as Error & { statusCode?: number }).statusCode = 403
      throw err
    }
    if (input.role === "owner" && user.role !== "owner") {
      const err = new Error("Cannot promote to owner")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    if (user.role === "owner" && input.role && input.role !== "owner") {
      const err = new Error("Cannot demote owner")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    if (input.name !== undefined) user.name = input.name
    if (input.role !== undefined) user.role = input.role
    if (input.status !== undefined) user.status = input.status
    await user.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "user.update",
      entity: "User",
      entityId: user._id.toString(),
      metadata: { fields: Object.keys(input) },
    })
    return toPublic(user)
  },

  async resetPassword(env: ApiEnv, tenantId: string, actorId: string, actorRole: UserRole, id: string, newPassword: string) {
    if (!canCreateUserOrSetPassword(actorRole)) {
      const err = new Error("Only owner or admin can reset passwords")
      ;(err as Error & { statusCode?: number }).statusCode = 403
      throw err
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid user id")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const user = await UserModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!user) {
      const err = new Error("User not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    const plain = String(newPassword ?? "").trim()
    user.passwordHash = await authService.hashPassword(plain, env)
    await user.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "user.password_reset",
      entity: "User",
      entityId: user._id.toString(),
    })
    return { ok: true as const }
  },
}

export const meService = {
  async getMe(tenantId: string, userId: string) {
    const user = await UserModel.findOne({
      _id: new mongoose.Types.ObjectId(userId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!user) return null
    const tenant = await TenantModel.findById(tenantId)
    if (!tenant) return null
    const role = user.role as UserRole
    const businessType = resolveActiveBusinessType(String(tenant.businessType)) as BusinessTypeId
    const rawPerms = [...permissionsForRole(role)]
    const permissions = filterPermissionsByBusinessType(businessType, rawPerms)
    const menu = getMenuForRole(businessType, role)
    const features = getFeatureMap(businessType)
    return {
      user: userService.toPublic(user),
      tenant: {
        id: tenant._id.toString(),
        name: tenant.name,
        businessType: tenant.businessType,
        status: tenant.status,
        createdAt: tenant.createdAt?.toISOString?.() ?? "",
        updatedAt: tenant.updatedAt?.toISOString?.() ?? "",
      },
      permissions,
      menu,
      features: Object.fromEntries(Object.entries(features).map(([k, v]) => [k, v])) as Record<string, boolean>,
    }
  },
}
