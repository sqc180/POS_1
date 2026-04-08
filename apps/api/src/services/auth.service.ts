import bcrypt from "bcryptjs"
import mongoose, { type HydratedDocument } from "mongoose"
import type { ApiEnv } from "@repo/config"
import type { BusinessTypeId } from "@repo/types"
import { signAccessToken } from "../lib/jwt.js"
import { BranchModel } from "../models/branch.model.js"
import { BusinessSettingsModel } from "../models/business-settings.model.js"
import { GstSlabModel } from "../models/gst-slab.model.js"
import { TenantModel } from "../models/tenant.model.js"
import { UserModel, type UserDoc } from "../models/user.model.js"
import { auditService } from "./audit.service.js"

export const normalizeEmail = (raw: string): string =>
  String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

type LoginUserDoc = HydratedDocument<UserDoc>

/** Find active users for login: exact email first, then case-insensitive match for legacy rows. */
const findActiveUsersByLoginEmail = async (
  email: string,
  tenantOid: mongoose.Types.ObjectId | undefined,
): Promise<LoginUserDoc[]> => {
  const base: Record<string, unknown> = { status: "active" }
  if (tenantOid) base.tenantId = tenantOid

  let rows = await UserModel.find({ ...base, email }).sort({ createdAt: -1 }).exec()
  if (rows.length > 0) return rows

  const rx = new RegExp(`^${escapeRegExp(email)}$`, "i")
  rows = await UserModel.find({ ...base, email: { $regex: rx } }).sort({ createdAt: -1 }).exec()
  return rows.filter((u) => normalizeEmail(u.email) === email)
}

/**
 * Common login failures come from invisible Unicode in pasted passwords (zero-width, BOM)
 * or leading/trailing whitespace vs how the hash was created.
 */
const passwordCandidates = (raw: string): string[] => {
  const s = String(raw ?? "")
  const stripped = s.replace(/[\u200B-\u200D\uFEFF]/g, "")
  const t = stripped.trim()
  const ordered = [t, stripped, s].filter((x) => x.length > 0)
  return [...new Set(ordered)]
}

const defaultGstSlabs = [
  { name: "Exempt", cgstRate: 0, sgstRate: 0, igstRate: 0 },
  { name: "5%", cgstRate: 2.5, sgstRate: 2.5, igstRate: 5 },
  { name: "12%", cgstRate: 6, sgstRate: 6, igstRate: 12 },
  { name: "18%", cgstRate: 9, sgstRate: 9, igstRate: 18 },
  { name: "28%", cgstRate: 14, sgstRate: 14, igstRate: 28 },
]

export const authService = {
  async hashPassword(plain: string, env: ApiEnv): Promise<string> {
    return bcrypt.hash(plain, env.BCRYPT_ROUNDS)
  },

  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash)
  },

  async registerOnboarding(
    env: ApiEnv,
    input: {
      businessName: string
      businessType: BusinessTypeId
      ownerEmail: string
      ownerPassword: string
      ownerName: string
    },
  ): Promise<{ token: string; tenantId: string; userId: string }> {
    // No mongoose transaction: standalone MongoDB (typical local dev) does not support
    // transactions unless the server is a replica set or mongos. Use ordered writes + rollback.
    const email = normalizeEmail(input.ownerEmail)
    let tenantId: mongoose.Types.ObjectId | null = null
    let token = ""
    let tid = ""
    let userId = ""
    try {
      const tenant = await TenantModel.create({
        name: input.businessName.trim(),
        businessType: input.businessType,
        status: "active",
      })
      tenantId = tenant._id

      await BusinessSettingsModel.create({
        tenantId: tenant._id,
        defaultBranchId: "main",
        allowNegativeStock: false,
      })

      const passwordPlain = String(input.ownerPassword ?? "").trim()
      const passwordHash = await authService.hashPassword(passwordPlain, env)
      const user = await UserModel.create({
        tenantId: tenant._id,
        email,
        passwordHash,
        name: input.ownerName.trim(),
        role: "owner",
        status: "active",
      })

      const defaultBranch = await BranchModel.create({
        tenantId: tenant._id,
        code: "main",
        name: "Main branch",
        kind: "shop",
        address: "",
        notes: "",
        status: "active",
        sortOrder: 0,
      })

      await GstSlabModel.insertMany(
        defaultGstSlabs.map((slab) => ({
          tenantId: tenant._id,
          name: slab.name,
          cgstRate: slab.cgstRate,
          sgstRate: slab.sgstRate,
          igstRate: slab.igstRate,
          status: "active" as const,
        })),
        { ordered: true },
      )

      tid = tenant._id.toString()
      userId = user._id.toString()
      token = signAccessToken(env, {
        sub: userId,
        tid,
        role: "owner",
      })

      try {
        await auditService.log({
          tenantId: tid,
          actorId: userId,
          action: "branch.create",
          entity: "Branch",
          entityId: defaultBranch._id.toString(),
          metadata: { code: "main", source: "onboarding" },
        })
      } catch {
        /* audit failure must not roll back onboarding */
      }
    } catch (e) {
      if (tenantId) {
        await UserModel.deleteMany({ tenantId })
        await BranchModel.deleteMany({ tenantId })
        await GstSlabModel.deleteMany({ tenantId })
        await BusinessSettingsModel.deleteMany({ tenantId })
        await TenantModel.deleteOne({ _id: tenantId })
      }
      throw e
    }

    try {
      await auditService.log({
        tenantId: tid,
        actorId: userId,
        action: "tenant.onboarding",
        entity: "Tenant",
        entityId: tid,
        metadata: { businessType: input.businessType },
      })
    } catch {
      /* audit failure must not roll back a successful tenant */
    }

    return { token, tenantId: tid, userId }
  },

  async login(
    env: ApiEnv,
    input: { email: string; password: string; tenantId?: string },
  ): Promise<{ token: string } | null> {
    const email = normalizeEmail(input.email)
    const pwds = passwordCandidates(input.password)

    const tryPassword = async (user: LoginUserDoc): Promise<boolean> => {
      for (const p of pwds) {
        if (await authService.verifyPassword(p, user.passwordHash)) return true
      }
      return false
    }

    const completeLogin = async (user: LoginUserDoc): Promise<{ token: string }> => {
      if (user.email !== email) user.email = email
      user.lastLoginAt = new Date()
      await user.save()
      return {
        token: signAccessToken(env, {
          sub: user._id.toString(),
          tid: user.tenantId.toString(),
          role: user.role as import("@repo/types").UserRole,
        }),
      }
    }

    if (input.tenantId && mongoose.Types.ObjectId.isValid(input.tenantId)) {
      const tenantOid = new mongoose.Types.ObjectId(input.tenantId)
      const scoped = await findActiveUsersByLoginEmail(email, tenantOid)
      const scopedUser = scoped[0]
      if (scopedUser && (await tryPassword(scopedUser))) return completeLogin(scopedUser)
      // Wrong/stale workspace id or password mismatch for that tenant: still try other workspaces
      // for this email so one request can succeed (same as client retry without tenantId).
    }

    const candidates = await findActiveUsersByLoginEmail(email, undefined)
    for (const user of candidates) {
      if (await tryPassword(user)) return completeLogin(user)
    }
    return null
  },
}
