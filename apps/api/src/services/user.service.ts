import mongoose from "mongoose"
import type { ApiEnv } from "@repo/config"
import {
  applyNavPresentation,
  filterPermissionsByBusinessType,
  getFeatureMap,
  getMenuForRole,
  getPortalPageCopy,
  getPortalTheme,
  resolveActiveBusinessType,
  resolvePortalExperienceId,
} from "@repo/business-type-engine"
import { canCreateUserOrSetPassword, permissionsForRole } from "@repo/permissions"
import type { BusinessTypeId, UserPublic, UserRole, UserStatus } from "@repo/types"
import { BranchModel } from "../models/branch.model.js"
import { TenantModel } from "../models/tenant.model.js"
import { UserBranchAccessModel } from "../models/user-branch-access.model.js"
import { UserModel, type UserDoc } from "../models/user.model.js"
import { isMongoDuplicateKeyError } from "../lib/mongo-errors.js"
import { buildProductFieldHintsFromCaps } from "@repo/business-type-engine"
import { resolveRulesForTenantAndBranchDoc, resolveRulesForTenantDoc } from "../lib/ruleResolver.js"
import { auditService } from "./audit.service.js"
import { authService } from "./auth.service.js"

const toPublic = (u: UserDoc): UserPublic => ({
  id: u._id.toString(),
  email: u.email,
  name: u.name,
  phone: u.phone?.trim() ? u.phone.trim() : undefined,
  role: u.role as UserRole,
  status: (u.status as UserStatus) ?? "active",
  tenantId: u.tenantId.toString(),
  branchCodes: null,
  lastLoginAt: u.lastLoginAt?.toISOString(),
  createdAt: u.createdAt?.toISOString?.() ?? new Date().toISOString(),
  updatedAt: u.updatedAt?.toISOString?.() ?? new Date().toISOString(),
})

const attachBranchCodes = async (tenantId: string, rows: UserPublic[]): Promise<UserPublic[]> => {
  if (rows.length === 0) return rows
  const tenantOid = new mongoose.Types.ObjectId(tenantId)
  const userIds = rows.map((r) => new mongoose.Types.ObjectId(r.id))
  const accessRows = await UserBranchAccessModel.find({
    tenantId: tenantOid,
    userId: { $in: userIds },
  }).lean()
  const byUser = new Map<string, string[]>()
  for (const a of accessRows) {
    const uid = (a as { userId: mongoose.Types.ObjectId }).userId.toString()
    const codes = (a as { branchCodes?: string[] }).branchCodes ?? []
    if (codes.length > 0) byUser.set(uid, codes)
  }
  return rows.map((r) => {
    const codes = byUser.get(r.id)
    return codes ? { ...r, branchCodes: codes } : { ...r, branchCodes: null }
  })
}

export const userService = {
  toPublic,

  async list(tenantId: string) {
    const users = await UserModel.find({ tenantId: new mongoose.Types.ObjectId(tenantId) }).sort({ createdAt: -1 })
    return attachBranchCodes(tenantId, users.map(toPublic))
  },

  async listPaged(
    tenantId: string,
    opts: {
      q?: string
      role?: UserRole
      status?: UserStatus
      branchCode?: string
      limit?: number
      skip?: number
    },
  ): Promise<{ items: UserPublic[]; total: number; skip: number; limit: number }> {
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    const rawLimit = opts.limit ?? 25
    const rawSkip = opts.skip ?? 0
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 25, 1), 100)
    const skip = Math.max(Number.isFinite(rawSkip) ? rawSkip : 0, 0)
    const filter: Record<string, unknown> = { tenantId: tenantOid }
    if (opts.role) filter.role = opts.role
    if (opts.status) filter.status = opts.status
    if (opts.q?.trim()) {
      const rx = new RegExp(opts.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }]
    }
    if (opts.branchCode?.trim()) {
      const usersWithBranch = await UserBranchAccessModel.find({
        tenantId: tenantOid,
        branchCodes: opts.branchCode.trim(),
      }).distinct("userId")
      if (usersWithBranch.length === 0) {
        return { items: [], total: 0, skip, limit }
      }
      filter._id = { $in: usersWithBranch }
    }
    const [users, total] = await Promise.all([
      UserModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      UserModel.countDocuments(filter),
    ])
    const items = await attachBranchCodes(tenantId, users.map(toPublic))
    return { items, total, skip, limit }
  },

  async getById(tenantId: string, id: string): Promise<UserPublic | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null
    const u = await UserModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!u) return null
    const [row] = await attachBranchCodes(tenantId, [toPublic(u)])
    return row ?? null
  },

  async create(
    env: ApiEnv,
    tenantId: string,
    actorId: string,
    actorRole: UserRole,
    input: { email: string; password: string; name: string; role: UserRole; phone?: string },
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
    const emailNorm = input.email.toLowerCase().trim()
    const dupRow = await UserModel.exists({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      email: emailNorm,
    })
    if (dupRow) {
      const err = new Error("A user with this email already exists in your workspace")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    let user
    try {
      user = await UserModel.create({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        email: emailNorm,
        phone: input.phone?.trim(),
        passwordHash,
        name: input.name,
        role: input.role,
        status: "active",
      })
    } catch (e: unknown) {
      if (isMongoDuplicateKeyError(e)) {
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
    const [created] = await attachBranchCodes(tenantId, [toPublic(user)])
    return created!
  },

  async update(
    tenantId: string,
    actorId: string,
    actorRole: UserRole,
    id: string,
    input: Partial<{ name: string; phone: string; role: UserRole; status: UserStatus }>,
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
    if (input.phone !== undefined) user.phone = input.phone.trim() === "" ? undefined : input.phone.trim()
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
    const [updated] = await attachBranchCodes(tenantId, [toPublic(user)])
    return updated!
  },

  async setBranchAccess(
    tenantId: string,
    actorId: string,
    actorRole: UserRole,
    userId: string,
    branchCodes: string[],
  ): Promise<UserPublic> {
    if (!canCreateUserOrSetPassword(actorRole)) {
      const err = new Error("Only owner or admin can manage branch access")
      ;(err as Error & { statusCode?: number }).statusCode = 403
      throw err
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      const err = new Error("Invalid user id")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const user = await UserModel.findOne({
      _id: new mongoose.Types.ObjectId(userId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!user) {
      const err = new Error("User not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    if (user.role === "owner") {
      const err = new Error("Owner branch access is not restricted")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const normalized = [...new Set(branchCodes.map((c) => c.trim()).filter(Boolean))]
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    if (normalized.length > 0) {
      const found = await BranchModel.countDocuments({
        tenantId: tenantOid,
        code: { $in: normalized },
        status: "active",
      })
      if (found !== normalized.length) {
        const err = new Error("One or more branch codes are invalid for this tenant")
        ;(err as Error & { statusCode?: number }).statusCode = 400
        throw err
      }
    }
    if (normalized.length === 0) {
      await UserBranchAccessModel.deleteOne({ tenantId: tenantOid, userId: user._id })
    } else {
      await UserBranchAccessModel.findOneAndUpdate(
        { tenantId: tenantOid, userId: user._id },
        { $set: { branchCodes: normalized } },
        { upsert: true, new: true },
      )
    }
    await auditService.log({
      tenantId,
      actorId,
      action: "user.branch_access",
      entity: "User",
      entityId: user._id.toString(),
      metadata: { branchCodes: normalized },
    })
    const [row] = await attachBranchCodes(tenantId, [toPublic(user)])
    return row!
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
  async getMe(tenantId: string, userId: string, opts?: { branchCode?: string | null }) {
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
    const baseMenu = getMenuForRole(businessType, role)
    const features = getFeatureMap(businessType)
    const [userRow] = await attachBranchCodes(tenantId, [toPublic(user)])
    const pilotRaw = (tenant as { pilotVertical?: string | null }).pilotVertical ?? null
    const tenantPackIds = ((tenant as { enabledPackIds?: string[] }).enabledPackIds ?? []).filter(Boolean)
    const tenantLean = {
      businessType: tenant.businessType,
      pilotVertical: pilotRaw,
      enabledPackIds: tenantPackIds,
    }
    const tenantRules = resolveRulesForTenantDoc(tenantLean)
    const capabilities = [...tenantRules.capabilities]
    const behaviorHints = {
      defaultPosMode: tenantRules.hints.defaultPosMode,
      defaultInventoryMode: tenantRules.hints.defaultInventoryMode,
      gstProfileHint: tenantRules.hints.gstProfileHint,
      posShellRoute: tenantRules.hints.posShellRoute ?? null,
      dashboardAccent: tenantRules.hints.dashboardAccent ?? null,
    }
    const code = opts?.branchCode?.trim()
    let branchCapabilities: string[] | undefined
    let contextBranchCode: string | null | undefined
    let branchBehaviorHints: typeof behaviorHints | undefined
    let branchProductFieldHints: { key: string; visible: boolean; section: string }[] | undefined
    let branchVerticalSlug: string | null | undefined
    if (code) {
      const br = await BranchModel.findOne({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        code,
      }).lean()
      if (br) {
        const slug = String((br as { businessTypeSlug?: string }).businessTypeSlug ?? "").trim() || null
        branchVerticalSlug = slug || undefined
        const packIds = ((br as { enabledPackIds?: string[] }).enabledPackIds ?? []).filter(Boolean)
        const branchRules = resolveRulesForTenantAndBranchDoc(tenantLean, {
          businessTypeSlug: slug || undefined,
          enabledPackIds: packIds.length ? packIds : undefined,
          posMode: (br as { posMode?: string }).posMode,
        })
        branchCapabilities = [...branchRules.capabilities]
        branchBehaviorHints = {
          defaultPosMode: branchRules.hints.defaultPosMode,
          defaultInventoryMode: branchRules.hints.defaultInventoryMode,
          gstProfileHint: branchRules.hints.gstProfileHint,
          posShellRoute: branchRules.hints.posShellRoute ?? null,
          dashboardAccent: branchRules.hints.dashboardAccent ?? null,
        }
        contextBranchCode = code
        branchProductFieldHints = buildProductFieldHintsFromCaps(branchRules.capabilities).map((h) => ({
          key: h.key,
          visible: h.visible,
          section: h.section,
        }))
      }
    }
    const productFieldHints = buildProductFieldHintsFromCaps(tenantRules.capabilities).map((h) => ({
      key: h.key,
      visible: h.visible,
      section: h.section,
    }))
    const portalExperienceId = resolvePortalExperienceId({
      businessType,
      pilotVertical: pilotRaw,
      branchBusinessTypeSlug: branchVerticalSlug,
    })
    const { menu, navGroups } = applyNavPresentation(portalExperienceId, baseMenu)
    const portalTheme = getPortalTheme(portalExperienceId)
    const portalPageCopy = getPortalPageCopy(portalExperienceId)
    return {
      user: userRow!,
      tenant: {
        id: tenant._id.toString(),
        name: tenant.name,
        businessType: tenant.businessType,
        pilotVertical: pilotRaw,
        enabledPackIds: tenantPackIds,
        capabilities,
        behaviorHints,
        portalExperienceId,
        portalTheme,
        status: tenant.status,
        createdAt: tenant.createdAt?.toISOString?.() ?? "",
        updatedAt: tenant.updatedAt?.toISOString?.() ?? "",
      },
      permissions,
      menu,
      navGroups: navGroups.map((g) => ({ key: g.key, label: g.label, ids: [...g.ids] })),
      portalPageCopy,
      features: Object.fromEntries(Object.entries(features).map(([k, v]) => [k, v])) as Record<string, boolean>,
      productFieldHints,
      ...(branchCapabilities !== undefined ? { branchCapabilities } : {}),
      ...(contextBranchCode !== undefined ? { contextBranchCode } : {}),
      ...(branchBehaviorHints !== undefined ? { branchBehaviorHints } : {}),
      ...(branchProductFieldHints !== undefined ? { branchProductFieldHints } : {}),
    }
  },
}
