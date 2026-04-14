import { mkdir, writeFile, unlink } from "fs/promises"
import { join } from "path"
import type { FastifyInstance } from "fastify"
import mongoose from "mongoose"
import { z } from "zod"
import type { ApiEnv } from "@repo/config"
import { Permission, hasPermission } from "@repo/permissions"
import {
  buildProductFieldHintsFromCaps,
  isPilotVerticalSlug,
  validateProductFieldsAgainstTenantCaps,
} from "@repo/business-type-engine"
import type { FileAssetDocumentType, UserRole, UserStatus } from "@repo/types"
import { createRequireAuth } from "../hooks/require-auth.js"
import { requirePermission } from "../hooks/require-perm.js"
import { isMongoDuplicateKeyError } from "../lib/mongo-errors.js"
import { buildProductPatchSchema, buildProductRequestSchema } from "../lib/schemaFactory.js"
import { loadResolvedTenantRules } from "../lib/ruleResolver.js"
import { sendError } from "../lib/reply.js"
import { authService, normalizeEmail } from "../services/auth.service.js"
import { businessSettingsService } from "../services/business-settings.service.js"
import { branchService } from "../services/branch.service.js"
import { categoryService } from "../services/category.service.js"
import { customerService } from "../services/customer.service.js"
import { gstSlabService } from "../services/gst-slab.service.js"
import { inventoryLocationService } from "../services/inventory-location.service.js"
import { inventoryService } from "../services/inventory.service.js"
import { meService, userService } from "../services/user.service.js"
import { productService } from "../services/product.service.js"
import { productVariantService } from "../services/product-variant.service.js"
import { productSerialService } from "../services/product-serial.service.js"
import { stockBatchService } from "../services/stock-batch.service.js"
import { stockService } from "../services/stock.service.js"
import { tenantService } from "../services/tenant.service.js"
import { supplierService } from "../services/supplier.service.js"
import { permissionForDocumentType } from "../lib/document-permission.js"
import { resolveStorageRoot } from "../lib/storage-root.js"
import { createStorageFromEnv } from "../storage/factory.js"
import { createStoredDocumentService } from "../services/stored-document.service.js"
import { gatewayService } from "../services/gateway.service.js"
import { gstSummaryService } from "../services/gst-summary.service.js"
import { billingOrchestratorService } from "../modules/rules/billing-orchestrator.js"
import { invoiceService } from "../services/invoice.service.js"
import { jobService } from "../services/job.service.js"
import { paymentService } from "../services/payment.service.js"
import { posService } from "../services/pos.service.js"
import { qrSessionService } from "../services/qr-session.service.js"
import { razorpayPosService } from "../services/razorpay-pos.service.js"
import { razorpayWebhookService } from "../services/razorpay-webhook.service.js"
import { receiptService } from "../services/receipt.service.js"
import { refundService } from "../services/refund.service.js"
import { auditService } from "../services/audit.service.js"
import { dashboardSummaryService } from "../services/dashboard-summary.service.js"

const onboardingSchema = z.object({
  businessName: z.string().min(1),
  businessType: z.enum(["retail", "supermart"]),
  /** Optional industry pack (roadmap slug); drives capabilities after signup. */
  pilotVertical: z
    .string()
    .max(64)
    .optional()
    .nullable()
    .transform((v) => (v === null || v === undefined ? undefined : String(v).trim() === "" ? undefined : String(v).trim()))
    .refine((v) => v === undefined || isPilotVerticalSlug(v), { message: "Invalid industry vertical" }),
  enabledPackIds: z
    .array(z.string().max(64))
    .max(20)
    .optional()
    .refine((a) => !a || a.every((id) => isPilotVerticalSlug(id)), { message: "Invalid pack id" }),
  ownerEmail: z.preprocess(
    (v) => (v == null ? "" : String(v)),
    z
      .string()
      .transform((s) => normalizeEmail(s))
      .pipe(z.string().email("Invalid owner email")),
  ),
  ownerPassword: z.preprocess(
    (v) => (v == null ? "" : String(v)),
    z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(8, "Password must be at least 8 characters")),
  ),
  ownerName: z.string().min(1),
})

const loginSchema = z.object({
  email: z.preprocess(
    (v) => (v == null ? "" : String(v)),
    z
      .string()
      .transform((s) => normalizeEmail(s))
      .pipe(z.string().min(1, "Email required").email("Invalid email")),
  ),
  password: z.preprocess((v) => (v == null ? "" : String(v)), z.string().min(1, "Password required")),
  tenantId: z.preprocess((v) => {
    if (v == null || v === "") return undefined
    const t = String(v).trim()
    return t === "" ? undefined : t
  }, z.string().optional()),
})

export const registerRoutes = async (app: FastifyInstance, env: ApiEnv) => {
  const requireAuth = createRequireAuth(env)
  const storage = createStorageFromEnv(env)
  const storedDocumentService = createStoredDocumentService(storage, {
    pdfPathPrefix: env.PDF_STORAGE_PATH,
  })

  await app.register(
    async (whApp) => {
      whApp.removeAllContentTypeParsers()
      whApp.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
        done(null, body)
      })
      whApp.post("/razorpay", async (request, reply) => {
        const buf = request.body as Buffer
        const raw = buf.toString("utf8")
        const sigHdr = request.headers["x-razorpay-signature"]
        const signature = Array.isArray(sigHdr) ? sigHdr[0] : sigHdr
        try {
          const data = await razorpayWebhookService.handle(env, raw, signature)
          return reply.send({ success: true, data })
        } catch (e: unknown) {
          const status = (e as Error & { statusCode?: number }).statusCode ?? 500
          const msg = e instanceof Error ? e.message : "Webhook failed"
          return sendError(reply, status, "webhook_error", msg)
        }
      })
    },
    { prefix: "/webhooks" },
  )

  app.get("/health", async () => ({ ok: true, liveness: "up" }))

  /** Readiness: MongoDB ping + local storage root writable (when STORAGE_PROVIDER=local). */
  app.get("/ready", async (_req, reply) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        return reply.status(503).send({ ok: false, checks: { mongodb: "disconnected" } })
      }
      await mongoose.connection.db?.admin().command({ ping: 1 })

      if (env.STORAGE_PROVIDER === "local") {
        const root = resolveStorageRoot(env)
        const probeDir = join(root, ".ready-probe")
        await mkdir(probeDir, { recursive: true })
        const probeFile = join(probeDir, "ping.tmp")
        await writeFile(probeFile, `${Date.now()}`, "utf8")
        await unlink(probeFile)
      }

      return { ok: true, checks: { mongodb: "ok", storage: env.STORAGE_PROVIDER === "local" ? "writable" : "skipped" } }
    } catch {
      return reply.status(503).send({ ok: false, checks: { readiness: "failed" } })
    }
  })

  // Future: @fastify/rate-limit on auth, /webhooks, and heavy document routes (see docs/DEPLOYMENT.md).

  app.post("/auth/onboarding", async (request, reply) => {
    const parsed = onboardingSchema.safeParse(request.body)
    if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
    try {
      const result = await authService.registerOnboarding(env, parsed.data)
      return reply.send({ success: true, data: result })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Onboarding failed"
      if (String(msg).includes("duplicate")) return sendError(reply, 409, "duplicate", "Email already registered")
      return sendError(reply, 400, "onboarding_failed", msg)
    }
  })

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
    const result = await authService.login(env, parsed.data)
    if (!result) return sendError(reply, 401, "invalid_credentials", "Invalid email or password")
    return reply.send({ success: true, data: result })
  })

  app.get(
    "/me",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const auth = request.auth!
      const q = request.query as { branchCode?: string }
      const me = await meService.getMe(auth.tenantId, auth.userId, { branchCode: q.branchCode })
      if (!me) return sendError(reply, 404, "not_found", "User or tenant not found")
      return reply.send({ success: true, data: me })
    },
  )

  app.get("/tenant/product-field-presets", { preHandler: [requireAuth] }, async (request, reply) => {
    const auth = request.auth!
    const rules = await loadResolvedTenantRules(auth.tenantId)
    const hints = buildProductFieldHintsFromCaps(rules.capabilities).map((h) => ({
      key: h.key,
      visible: h.visible,
      section: h.section,
    }))
    return reply.send({ success: true, data: { hints } })
  })

  const tenantRoutes = async (app: FastifyInstance) => {
    app.addHook("preHandler", requireAuth)

    app.get("/audit-logs", { preHandler: [requirePermission(Permission.audit)] }, async (request, reply) => {
      const auth = request.auth!
      const q = request.query as { limit?: string }
      const n = parseInt(String(q.limit ?? "50"), 10)
      const limit = Number.isFinite(n) ? n : 50
      const data = await auditService.list(auth.tenantId, { limit })
      return reply.send({ success: true, data })
    })

    const jobEnqueueSchema = z.object({
      type: z.enum(["gst_summary_export"]),
      payload: z.object({ from: z.string().optional(), to: z.string().optional() }).optional(),
    })

    app.post("/jobs", { preHandler: [requirePermission(Permission.gst)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = jobEnqueueSchema.safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await jobService.enqueue(auth.tenantId, auth.userId, {
          type: parsed.data.type,
          payload: parsed.data.payload ?? {},
        })
        return reply.status(201).send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/jobs/:id", { preHandler: [requirePermission(Permission.gst)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const row = await jobService.getById(auth.tenantId, id)
      if (!row) return sendError(reply, 404, "not_found", "Not found")
      return reply.send({ success: true, data: row })
    })

    app.get("/dashboard/summary", { preHandler: [requirePermission(Permission.dashboard)] }, async (request, reply) => {
      const auth = request.auth!
      const data = await dashboardSummaryService.get(auth.tenantId)
      return reply.send({ success: true, data })
    })

    app.get("/users", { preHandler: [requirePermission(Permission.users)] }, async (request, reply) => {
      const auth = request.auth!
      const q = request.query as {
        q?: string
        role?: string
        status?: string
        branch?: string
        limit?: string
        skip?: string
        paged?: string
      }
      if (q.paged === "true" || q.limit !== undefined || q.skip !== undefined) {
        const data = await userService.listPaged(auth.tenantId, {
          q: q.q,
          role: q.role as UserRole | undefined,
          status: q.status as UserStatus | undefined,
          branchCode: q.branch,
          limit: q.limit !== undefined ? Number.parseInt(String(q.limit), 10) : undefined,
          skip: q.skip !== undefined ? Number.parseInt(String(q.skip), 10) : undefined,
        })
        return reply.send({ success: true, data })
      }
      const data = await userService.list(auth.tenantId)
      return reply.send({ success: true, data })
    })

    app.get("/users/:id", { preHandler: [requirePermission(Permission.users)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const u = await userService.getById(auth.tenantId, id)
      if (!u) return sendError(reply, 404, "not_found", "User not found")
      return reply.send({ success: true, data: u })
    })

    const createUserSchema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(1),
      phone: z.string().optional(),
      role: z.enum([
        "admin",
        "manager",
        "cashier",
        "billing_staff",
        "inventory_staff",
        "accountant",
        "viewer",
      ]),
    })

    app.post("/users", { preHandler: [requirePermission(Permission.users)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = createUserSchema.safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await userService.create(env, auth.tenantId, auth.userId, auth.role, {
          email: parsed.data.email,
          password: parsed.data.password,
          name: parsed.data.name,
          phone: parsed.data.phone,
          role: parsed.data.role,
        })
        return reply.status(201).send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        const msg = e instanceof Error ? e.message : "Failed"
        return sendError(reply, status, "user_error", msg)
      }
    })

    const updateUserSchema = z.object({
      name: z.string().optional(),
      phone: z.string().optional(),
      role: z
        .enum([
          "owner",
          "admin",
          "manager",
          "cashier",
          "billing_staff",
          "inventory_staff",
          "accountant",
          "viewer",
        ])
        .optional(),
      status: z
        .enum(["active", "inactive", "invited", "suspended", "deactivated", "archived"])
        .optional(),
    })

    const branchAccessSchema = z.object({
      branchCodes: z.array(z.string().min(1)).max(64),
    })

    app.patch(
      "/users/:id/branch-access",
      { preHandler: [requirePermission(Permission.users)] },
      async (request, reply) => {
        const auth = request.auth!
        const { id } = request.params as { id: string }
        const parsed = branchAccessSchema.safeParse(request.body)
        if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
        try {
          const data = await userService.setBranchAccess(auth.tenantId, auth.userId, auth.role, id, parsed.data.branchCodes)
          return reply.send({ success: true, data })
        } catch (e: unknown) {
          const status = (e as Error & { statusCode?: number }).statusCode ?? 400
          return sendError(reply, status, "user_error", e instanceof Error ? e.message : "Failed")
        }
      },
    )

    app.patch("/users/:id", { preHandler: [requirePermission(Permission.users)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const parsed = updateUserSchema.safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await userService.update(auth.tenantId, auth.userId, auth.role, id, parsed.data)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        const msg = e instanceof Error ? e.message : "Failed"
        return sendError(reply, status, "user_error", msg)
      }
    })

    const resetPasswordSchema = z.object({ password: z.string().min(8) })

    app.post("/users/:id/reset-password", { preHandler: [requirePermission(Permission.users)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const parsed = resetPasswordSchema.safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        await userService.resetPassword(env, auth.tenantId, auth.userId, auth.role, id, parsed.data.password)
        return reply.send({ success: true, data: { ok: true } })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        const msg = e instanceof Error ? e.message : "Failed"
        return sendError(reply, status, "user_error", msg)
      }
    })

    app.get("/categories", { preHandler: [requirePermission(Permission.categories)] }, async (request, reply) => {
      const auth = request.auth!
      const data = await categoryService.list(auth.tenantId)
      return reply.send({ success: true, data })
    })

    const catSchema = z.object({
      name: z.string().min(1),
      parentId: z.string().nullable().optional(),
      sortOrder: z.number().optional(),
    })

    app.post("/categories", { preHandler: [requirePermission(Permission.categories)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = catSchema.safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      const data = await categoryService.create(auth.tenantId, auth.userId, parsed.data)
      return reply.status(201).send({ success: true, data })
    })

    app.patch("/categories/:id", { preHandler: [requirePermission(Permission.categories)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const parsed = catSchema.partial().extend({ status: z.enum(["active", "inactive"]).optional() }).safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await categoryService.update(auth.tenantId, auth.userId, id, parsed.data)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/branches", { preHandler: [requirePermission(Permission.inventory, Permission.pos)] }, async (request, reply) => {
      const auth = request.auth!
      const data = await branchService.list(auth.tenantId)
      return reply.send({ success: true, data })
    })

    app.get("/branches/:id", { preHandler: [requirePermission(Permission.inventory, Permission.pos)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const row = await branchService.getById(auth.tenantId, id)
      if (!row) return sendError(reply, 404, "not_found", "Not found")
      return reply.send({ success: true, data: row })
    })

    const branchCreateSchema = z.object({
      code: z.string().min(1).max(64),
      name: z.string().min(1),
      kind: z.enum(["shop", "warehouse", "other"]),
      address: z.string().optional(),
      notes: z.string().optional(),
      sortOrder: z.number().optional(),
    })

    app.post("/branches", { preHandler: [requirePermission(Permission.branches)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = branchCreateSchema.safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await branchService.create(auth.tenantId, auth.userId, parsed.data)
        return reply.status(201).send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    const branchPatchSchema = z.object({
      name: z.string().optional(),
      kind: z.enum(["shop", "warehouse", "other"]).optional(),
      address: z.string().optional(),
      notes: z.string().optional(),
      status: z.enum(["active", "inactive"]).optional(),
      sortOrder: z.number().optional(),
      businessTypeSlug: z
        .union([z.string().max(64), z.literal("")])
        .nullable()
        .optional()
        .transform((v) => (v === "" ? null : v))
        .refine((v) => v === null || v === undefined || isPilotVerticalSlug(v), {
          message: "Invalid branch business type slug",
        }),
      enabledPackIds: z
        .array(z.string().max(64))
        .max(20)
        .optional()
        .refine((a) => !a || a.every((id) => isPilotVerticalSlug(id)), { message: "Invalid pack id in enabledPackIds" }),
      posMode: z.enum(["standard", "high_volume", "table_service", "field"]).optional(),
    })

    app.patch("/branches/:id", { preHandler: [requirePermission(Permission.branches)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const parsed = branchPatchSchema.safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await branchService.update(auth.tenantId, auth.userId, id, parsed.data)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/products", { preHandler: [requirePermission(Permission.products)] }, async (request, reply) => {
      const auth = request.auth!
      const q = request.query as {
        q?: string
        paged?: string
        categoryId?: string
        sort?: string
        order?: string
        catalogLifecycle?: string
        limit?: string
        skip?: string
      }
      if (q.paged === "true") {
        const data = await productService.listPaged(auth.tenantId, {
          q: q.q,
          categoryId: q.categoryId,
          sort: q.sort as "updatedAt" | "name" | "sku" | "sellingPrice" | undefined,
          order: q.order as "asc" | "desc" | undefined,
          catalogLifecycle: q.catalogLifecycle as "active" | "discontinued" | "archived" | "all" | undefined,
          limit: q.limit !== undefined ? Number.parseInt(String(q.limit), 10) : undefined,
          skip: q.skip !== undefined ? Number.parseInt(String(q.skip), 10) : undefined,
        })
        return reply.send({ success: true, data })
      }
      const data = await productService.list(auth.tenantId, q.q)
      return reply.send({ success: true, data })
    })

    app.get(
      "/products/:productId/variants",
      { preHandler: [requirePermission(Permission.products)] },
      async (request, reply) => {
        const auth = request.auth!
        const { productId } = request.params as { productId: string }
        const data = await productVariantService.listByProduct(auth.tenantId, productId)
        return reply.send({ success: true, data })
      },
    )

    const variantCreateSchema = z.object({
      label: z.string().min(1),
      sku: z.string().min(1),
      barcode: z.string().optional(),
      sellingPrice: z.number().nonnegative().optional(),
      gstSlabId: z.string().optional(),
      taxMode: z.enum(["inclusive", "exclusive"]).optional(),
    })

    app.post(
      "/products/:productId/variants",
      { preHandler: [requirePermission(Permission.products)] },
      async (request, reply) => {
        const auth = request.auth!
        const { productId } = request.params as { productId: string }
        const parsed = variantCreateSchema.safeParse(request.body)
        if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
        try {
          const data = await productVariantService.create(auth.tenantId, auth.userId, productId, parsed.data)
          return reply.status(201).send({ success: true, data })
        } catch (e: unknown) {
          const status = (e as Error & { statusCode?: number }).statusCode ?? 400
          if (isMongoDuplicateKeyError(e)) {
            return sendError(reply, 409, "duplicate", "Variant SKU must be unique for this tenant")
          }
          return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
        }
      },
    )

    app.patch(
      "/products/:productId/variants/:variantId",
      { preHandler: [requirePermission(Permission.products)] },
      async (request, reply) => {
        const auth = request.auth!
        const { productId, variantId } = request.params as { productId: string; variantId: string }
        const parsed = variantCreateSchema.partial().extend({ status: z.enum(["active", "inactive"]).optional() }).safeParse(request.body)
        if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
        try {
          const data = await productVariantService.update(auth.tenantId, auth.userId, productId, variantId, parsed.data)
          return reply.send({ success: true, data })
        } catch (e: unknown) {
          const status = (e as Error & { statusCode?: number }).statusCode ?? 400
          return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
        }
      },
    )

    app.post(
      "/products/:productId/variants/:variantId/deactivate",
      { preHandler: [requirePermission(Permission.products)] },
      async (request, reply) => {
        const auth = request.auth!
        const { productId, variantId } = request.params as { productId: string; variantId: string }
        try {
          const data = await productVariantService.deactivateIfNoStock(auth.tenantId, auth.userId, productId, variantId)
          return reply.send({ success: true, data })
        } catch (e: unknown) {
          const status = (e as Error & { statusCode?: number }).statusCode ?? 400
          return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
        }
      },
    )

    const serialRegisterSchema = z.object({
      serialNumber: z.string().min(1),
      variantId: z.string().optional(),
    })

    app.get(
      "/products/:productId/serials",
      { preHandler: [requirePermission(Permission.products)] },
      async (request, reply) => {
        const auth = request.auth!
        const { productId } = request.params as { productId: string }
        const status = (request.query as { status?: string }).status
        const data = await productSerialService.listForProduct(auth.tenantId, productId, status)
        return reply.send({ success: true, data })
      },
    )

    app.post(
      "/products/:productId/serials",
      { preHandler: [requirePermission(Permission.products)] },
      async (request, reply) => {
        const auth = request.auth!
        const { productId } = request.params as { productId: string }
        const parsed = serialRegisterSchema.safeParse(request.body)
        if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
        try {
          const data = await productSerialService.register(auth.tenantId, auth.userId, {
            productId,
            variantId: parsed.data.variantId,
            serialNumber: parsed.data.serialNumber,
          })
          return reply.status(201).send({ success: true, data })
        } catch (e: unknown) {
          const status = (e as Error & { statusCode?: number }).statusCode ?? 400
          if (isMongoDuplicateKeyError(e)) {
            return sendError(reply, 409, "duplicate", "Serial number already exists")
          }
          return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
        }
      },
    )

    app.get("/products/:id", { preHandler: [requirePermission(Permission.products)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const p = await productService.getById(auth.tenantId, id)
      if (!p) return sendError(reply, 404, "not_found", "Product not found")
      return reply.send({ success: true, data: p })
    })

    app.post("/products", { preHandler: [requirePermission(Permission.products)] }, async (request, reply) => {
      const auth = request.auth!
      const tenantRules = await loadResolvedTenantRules(auth.tenantId)
      const parsed = buildProductRequestSchema(tenantRules.capabilities).safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      const fieldErr = validateProductFieldsAgainstTenantCaps(tenantRules.capabilities, {
        saleUom: parsed.data.saleUom,
        isLoose: parsed.data.isLoose,
        behaviorAugmentFlags: parsed.data.behaviorAugmentFlags,
      })
      if (fieldErr) return sendError(reply, 400, "validation_error", fieldErr)
      try {
        const data = await productService.create(auth.tenantId, auth.userId, parsed.data)
        return reply.status(201).send({ success: true, data })
      } catch (e: unknown) {
        if (isMongoDuplicateKeyError(e)) {
          return sendError(reply, 409, "duplicate", "SKU must be unique")
        }
        return sendError(reply, 400, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.patch("/products/:id", { preHandler: [requirePermission(Permission.products)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const tenantRules = await loadResolvedTenantRules(auth.tenantId)
      const existing = await productService.getById(auth.tenantId, id)
      if (!existing) return sendError(reply, 404, "not_found", "Product not found")
      const augmentBase = existing.behaviorProfile?.augmentFlags
      const parsed = buildProductPatchSchema(tenantRules.capabilities, augmentBase).safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      const nextAugment =
        parsed.data.behaviorAugmentFlags !== undefined
          ? parsed.data.behaviorAugmentFlags
          : existing.behaviorProfile?.augmentFlags
      const nextSaleUom = parsed.data.saleUom !== undefined ? parsed.data.saleUom : existing.saleUom
      const nextIsLoose = parsed.data.isLoose !== undefined ? parsed.data.isLoose : existing.isLoose === true
      const fieldErr = validateProductFieldsAgainstTenantCaps(tenantRules.capabilities, {
        saleUom: nextSaleUom,
        isLoose: nextIsLoose,
        behaviorAugmentFlags: nextAugment,
      })
      if (fieldErr) return sendError(reply, 400, "validation_error", fieldErr)
      try {
        const data = await productService.update(auth.tenantId, auth.userId, id, parsed.data)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/gst-slabs", { preHandler: [requirePermission(Permission.gst)] }, async (request, reply) => {
      const auth = request.auth!
      const data = await gstSlabService.list(auth.tenantId)
      return reply.send({ success: true, data })
    })

    app.get("/gst/summary", { preHandler: [requirePermission(Permission.gst)] }, async (request, reply) => {
      const auth = request.auth!
      const q = request.query as { from?: string; to?: string }
      const data = await gstSummaryService.summarizeCompleted(auth.tenantId, { from: q.from, to: q.to })
      return reply.send({ success: true, data })
    })

    const gstSchema = z.object({
      name: z.string().min(1),
      cgstRate: z.number().min(0).max(100),
      sgstRate: z.number().min(0).max(100),
      igstRate: z.number().min(0).max(100),
    })

    app.post("/gst-slabs", { preHandler: [requirePermission(Permission.gst)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = gstSchema.safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      const data = await gstSlabService.create(auth.tenantId, auth.userId, parsed.data)
      return reply.status(201).send({ success: true, data })
    })

    app.patch("/gst-slabs/:id", { preHandler: [requirePermission(Permission.gst)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const parsed = z
        .object({
          name: z.string().optional(),
          status: z.enum(["active", "inactive"]).optional(),
          cgstRate: z.number().min(0).max(100).optional(),
          sgstRate: z.number().min(0).max(100).optional(),
          igstRate: z.number().min(0).max(100).optional(),
        })
        .safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await gstSlabService.update(auth.tenantId, auth.userId, id, parsed.data)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/inventory", { preHandler: [requirePermission(Permission.inventory)] }, async (request, reply) => {
      const auth = request.auth!
      const data = await inventoryService.list(auth.tenantId)
      return reply.send({ success: true, data })
    })

    app.get("/inventory/locations", { preHandler: [requirePermission(Permission.inventory)] }, async (request, reply) => {
      const auth = request.auth!
      const q = request.query as { branchId?: string }
      const data = await inventoryLocationService.list(auth.tenantId, q.branchId)
      return reply.send({ success: true, data })
    })

    app.get("/inventory/:id", { preHandler: [requirePermission(Permission.inventory)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const row = await inventoryService.getById(auth.tenantId, id)
      if (!row) return sendError(reply, 404, "not_found", "Not found")
      return reply.send({ success: true, data: row })
    })

    app.patch("/inventory/:id", { preHandler: [requirePermission(Permission.inventory)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const parsed = z
        .object({
          reorderLevel: z.number().nonnegative().optional(),
          lowStockThreshold: z.number().nonnegative().optional(),
          openingStock: z.number().nonnegative().optional(),
        })
        .safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await inventoryService.updateLevels(auth.tenantId, id, parsed.data)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    const movementSchema = z.object({
      inventoryItemId: z.string(),
      type: z.enum([
        "in",
        "out",
        "adjustment",
        "correction",
        "transfer",
        "opening",
        "purchase",
        "purchase_return",
        "sale",
        "sale_return",
        "transfer_out",
        "transfer_in",
        "production_consumption",
        "production_output",
        "damage",
        "expiry_write_off",
      ]),
      quantity: z.number(),
      reason: z.string().optional(),
      referenceType: z.string().optional(),
      referenceId: z.string().optional(),
    })

    app.post("/stock/movements", { preHandler: [requirePermission(Permission.stock)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = movementSchema.safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await stockService.applyMovement(auth.tenantId, auth.userId, parsed.data)
        return reply.status(201).send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "stock_error", e instanceof Error ? e.message : "Failed")
      }
    })

    const interBranchTransferSchema = z.object({
      fromInventoryItemId: z.string().min(1),
      toBranchId: z.string().min(1),
      quantity: z.coerce.number().positive(),
      reason: z.string().optional(),
    })

    app.post("/stock/inter-branch-transfer", { preHandler: [requirePermission(Permission.stock)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = interBranchTransferSchema.safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await stockService.applyInterBranchTransfer(auth.tenantId, auth.userId, parsed.data)
        return reply.status(201).send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "stock_error", e instanceof Error ? e.message : "Failed")
      }
    })

    const batchReceiveSchema = z.object({
      productId: z.string(),
      variantId: z.string().optional(),
      branchId: z.string().optional(),
      batchCode: z.string().min(1),
      qty: z.number().positive(),
      mfgDate: z.string().optional(),
      expiryDate: z.string().optional(),
    })

    app.post("/stock/batches/receive", { preHandler: [requirePermission(Permission.stock)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = batchReceiveSchema.safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await stockBatchService.receive(auth.tenantId, auth.userId, {
          productId: parsed.data.productId,
          variantId: parsed.data.variantId,
          branchId: parsed.data.branchId ?? "main",
          batchCode: parsed.data.batchCode,
          qty: parsed.data.qty,
          mfgDate: parsed.data.mfgDate,
          expiryDate: parsed.data.expiryDate,
        })
        return reply.status(201).send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/stock/batches/near-expiry", { preHandler: [requirePermission(Permission.stock)] }, async (request, reply) => {
      const auth = request.auth!
      const within = Number.parseInt((request.query as { withinDays?: string }).withinDays ?? "30", 10)
      const withinDays = Number.isFinite(within) && within > 0 ? within : 30
      const data = await stockBatchService.listNearExpiry(auth.tenantId, withinDays)
      return reply.send({ success: true, data })
    })

    app.get("/stock/history", { preHandler: [requirePermission(Permission.stock)] }, async (request, reply) => {
      const auth = request.auth!
      const q = request.query as { inventoryItemId?: string }
      const data = await stockService.history(auth.tenantId, q.inventoryItemId)
      return reply.send({ success: true, data })
    })

    app.get("/customers", { preHandler: [requirePermission(Permission.customers)] }, async (request, reply) => {
      const auth = request.auth!
      const q = (request.query as { q?: string }).q
      const data = await customerService.list(auth.tenantId, q)
      return reply.send({ success: true, data })
    })

    app.get("/customers/:id", { preHandler: [requirePermission(Permission.customers)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const row = await customerService.getById(auth.tenantId, id)
      if (!row) return sendError(reply, 404, "not_found", "Not found")
      return reply.send({ success: true, data: row })
    })

    app.get("/customers/:id/receivable", { preHandler: [requirePermission(Permission.customers)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      try {
        const data = await customerService.getReceivableSnapshot(auth.tenantId, id)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    const customerSchema = z.object({
      name: z.string().min(1),
      phone: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      gstin: z.string().optional(),
      address: z.string().optional(),
      notes: z.string().optional(),
      creditLimit: z.number().nonnegative().optional(),
    })

    app.post("/customers", { preHandler: [requirePermission(Permission.customers)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = customerSchema.safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      const data = await customerService.create(auth.tenantId, auth.userId, {
        ...parsed.data,
        email: parsed.data.email || undefined,
      })
      return reply.status(201).send({ success: true, data })
    })

    app.patch("/customers/:id", { preHandler: [requirePermission(Permission.customers)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const parsed = customerSchema.partial().extend({ status: z.enum(["active", "inactive"]).optional() }).safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await customerService.update(auth.tenantId, auth.userId, id, parsed.data)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/suppliers", { preHandler: [requirePermission(Permission.suppliers)] }, async (request, reply) => {
      const auth = request.auth!
      const q = (request.query as { q?: string }).q
      const data = await supplierService.list(auth.tenantId, q)
      return reply.send({ success: true, data })
    })

    app.get("/suppliers/:id", { preHandler: [requirePermission(Permission.suppliers)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const row = await supplierService.getById(auth.tenantId, id)
      if (!row) return sendError(reply, 404, "not_found", "Not found")
      return reply.send({ success: true, data: row })
    })

    app.get("/suppliers/:id/payables", { preHandler: [requirePermission(Permission.suppliers)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const data = await supplierService.getPayablesSnapshot(auth.tenantId, id)
      return reply.send({ success: true, data })
    })

    const supplierSchema = z.object({
      name: z.string().min(1),
      phone: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      gstin: z.string().optional(),
      address: z.string().optional(),
      notes: z.string().optional(),
    })

    app.post("/suppliers", { preHandler: [requirePermission(Permission.suppliers)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = supplierSchema.safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      const data = await supplierService.create(auth.tenantId, auth.userId, {
        ...parsed.data,
        email: parsed.data.email || undefined,
      })
      return reply.status(201).send({ success: true, data })
    })

    app.patch("/suppliers/:id", { preHandler: [requirePermission(Permission.suppliers)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const parsed = supplierSchema.partial().extend({ status: z.enum(["active", "inactive"]).optional() }).safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await supplierService.update(auth.tenantId, auth.userId, id, parsed.data)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/settings/business", { preHandler: [requirePermission(Permission.settings)] }, async (request, reply) => {
      const auth = request.auth!
      const data = await businessSettingsService.get(auth.tenantId)
      return reply.send({ success: true, data })
    })

    app.patch("/settings/business", { preHandler: [requirePermission(Permission.settings)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = z
        .object({
          allowNegativeStock: z.boolean().optional(),
          invoiceNumberPrefix: z.string().optional(),
          receiptNumberPrefix: z.string().optional(),
          refundNumberPrefix: z.string().optional(),
          defaultTaxMode: z.enum(["inclusive", "exclusive"]).optional(),
          posDefaultPaymentMode: z.string().optional(),
          defaultBranchId: z.string().optional(),
          intraStateDefault: z.boolean().optional(),
          placeOfSupplyState: z.string().optional(),
        })
        .safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await businessSettingsService.update(auth.tenantId, auth.userId, parsed.data)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    const pilotVerticalBodySchema = z
      .object({
        pilotVertical: z.union([z.string(), z.null()]).transform((v) => {
          if (v === null) return null
          const s = String(v).trim()
          return s === "" ? null : s
        }),
      })
      .superRefine((data, ctx) => {
        if (data.pilotVertical !== null && !isPilotVerticalSlug(data.pilotVertical)) {
          ctx.addIssue({ code: "custom", message: "Invalid pilot vertical", path: ["pilotVertical"] })
        }
      })

    app.patch("/settings/pilot-vertical", { preHandler: [requirePermission(Permission.settings)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = pilotVerticalBodySchema.safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await tenantService.updatePilotVertical(auth.tenantId, auth.userId, auth.role, parsed.data.pilotVertical)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/settings/gateway", { preHandler: [requirePermission(Permission.gateway)] }, async (request, reply) => {
      const auth = request.auth!
      const data = await gatewayService.getOrCreate(auth.tenantId)
      return reply.send({
        success: true,
        data: {
          ...data,
          secretHint: "Razorpay key secret and webhook secret are read from server environment only.",
        },
      })
    })

    app.patch("/settings/gateway", { preHandler: [requirePermission(Permission.gateway)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = z
        .object({
          provider: z.enum(["noop", "razorpay"]),
          razorpayKeyId: z.string().optional(),
          upiVpa: z.string().optional(),
        })
        .safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await gatewayService.update(auth.tenantId, auth.userId, parsed.data)
        return reply.send({
          success: true,
          data: {
            ...data,
            secretHint: "Razorpay key secret and webhook secret are read from server environment only.",
          },
        })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/settings/gateway/public-config", { preHandler: [requirePermission(Permission.pos)] }, async (request, reply) => {
      const auth = request.auth!
      const data = await gatewayService.publicConfig(auth.tenantId)
      return reply.send({ success: true, data })
    })

    const posLineSchema = z.object({
      productId: z.string(),
      qty: z.number().positive(),
      variantId: z.string().optional(),
      batchId: z.string().optional(),
      serialNumbers: z.array(z.string()).optional(),
    })

    app.post("/pos/preview", { preHandler: [requirePermission(Permission.pos)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = z
        .object({
          lines: z.array(posLineSchema).min(1),
        })
        .safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await posService.previewTotals(auth.tenantId, parsed.data.lines)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/invoices", { preHandler: [requirePermission(Permission.billing)] }, async (request, reply) => {
      const auth = request.auth!
      const status = (request.query as { status?: string }).status
      const data = await invoiceService.list(auth.tenantId, status)
      return reply.send({ success: true, data })
    })

    const invoiceDraftSchema = z.object({
      customerId: z.string().optional(),
      lines: z.array(posLineSchema).min(1),
      notes: z.string().optional(),
    })

    app.post("/invoices", { preHandler: [requirePermission(Permission.billing)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = invoiceDraftSchema.safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await invoiceService.createDraft(auth.tenantId, auth.userId, parsed.data)
        return reply.status(201).send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/invoices/:id", { preHandler: [requirePermission(Permission.billing)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const row = await invoiceService.getById(auth.tenantId, id)
      if (!row) return sendError(reply, 404, "not_found", "Not found")
      return reply.send({ success: true, data: row })
    })

    app.patch("/invoices/:id", { preHandler: [requirePermission(Permission.billing)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const parsed = invoiceDraftSchema.partial().safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const b = parsed.data
        const data = await invoiceService.updateDraft(auth.tenantId, auth.userId, id, {
          ...(b.customerId !== undefined ? { customerId: b.customerId } : {}),
          ...(b.lines !== undefined ? { lines: b.lines } : {}),
          ...(b.notes !== undefined ? { notes: b.notes } : {}),
        })
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.post("/invoices/:id/submit-approval", { preHandler: [requirePermission(Permission.billing)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      try {
        const data = await invoiceService.submitApprovalForInvoice(auth.tenantId, auth.userId, id)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.post("/invoices/:id/approve-approval", { preHandler: [requirePermission(Permission.billing)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      try {
        const data = await invoiceService.approveInvoice(auth.tenantId, auth.userId, auth.role, id)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.post("/invoices/:id/reject-approval", { preHandler: [requirePermission(Permission.billing)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      try {
        const data = await invoiceService.rejectInvoiceApproval(auth.tenantId, auth.userId, auth.role, id)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.post("/invoices/:id/complete", { preHandler: [requirePermission(Permission.billing)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      try {
        const data = await billingOrchestratorService.confirmInvoice(auth.tenantId, auth.userId, id)
        try {
          await storedDocumentService.invalidateInvoicePdfAssets(auth.tenantId, id)
        } catch {
          /* invalidation must not fail the business transaction */
        }
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.post("/invoices/:id/cancel", { preHandler: [requirePermission(Permission.billing)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const parsed = z.object({ reason: z.string().optional() }).safeParse(request.body ?? {})
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await invoiceService.cancel(auth.tenantId, auth.userId, id, parsed.data.reason)
        try {
          await storedDocumentService.invalidateInvoicePdfAssets(auth.tenantId, id)
        } catch {
          /* ignore */
        }
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/invoices/:id/pdf", { preHandler: [requirePermission(Permission.billing)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const q = request.query as { regenerate?: string }
      const force = q.regenerate === "1" || q.regenerate === "true"
      if (force && auth.role !== "owner" && auth.role !== "admin") {
        return sendError(reply, 403, "forbidden", "Only owner or admin can regenerate stored PDFs")
      }
      try {
        const { buffer, asset } = await storedDocumentService.ensureInvoicePdf(auth.tenantId, auth.userId, id, {
          forceRegenerate: force,
        })
        await storedDocumentService.logDownload(auth.tenantId, auth.userId, asset.id, asset.documentType)
        return reply
          .header("Content-Type", "application/pdf")
          .header("X-File-Asset-Id", asset.id)
          .header("Content-Disposition", `attachment; filename="${asset.originalFileName}"`)
          .send(buffer)
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/payments", { preHandler: [requirePermission(Permission.payments)] }, async (request, reply) => {
      const auth = request.auth!
      const invoiceId = (request.query as { invoiceId?: string }).invoiceId
      const data = await paymentService.list(auth.tenantId, invoiceId)
      return reply.send({ success: true, data })
    })

    app.post("/payments", { preHandler: [requirePermission(Permission.payments)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = z
        .object({
          invoiceId: z.string(),
          amount: z.number().positive(),
          method: z.enum(["cash", "card_offline", "qr", "razorpay"]),
          providerRef: z.string().optional(),
          idempotencyKey: z.string().optional(),
          forceComplete: z.boolean().optional(),
          meta: z.record(z.string(), z.unknown()).optional(),
        })
        .safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await paymentService.create(auth.tenantId, auth.userId, {
          ...parsed.data,
          meta: parsed.data.meta as Record<string, unknown> | undefined,
        })
        return reply.status(201).send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/payments/:id", { preHandler: [requirePermission(Permission.payments)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const row = await paymentService.getById(auth.tenantId, id)
      if (!row) return sendError(reply, 404, "not_found", "Not found")
      return reply.send({ success: true, data: row })
    })

    app.patch("/payments/:id", { preHandler: [requirePermission(Permission.payments)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const parsed = z.object({ status: z.enum(["pending", "completed", "failed"]) }).safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await paymentService.updateStatus(auth.tenantId, auth.userId, id, parsed.data.status)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.post("/qr-sessions", { preHandler: [requirePermission(Permission.payments)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = z.object({ invoiceId: z.string() }).safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await qrSessionService.create(auth.tenantId, auth.userId, parsed.data.invoiceId, env)
        return reply.status(201).send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.post("/payments/razorpay/checkout-session", { preHandler: [requirePermission(Permission.payments)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = z.object({ invoiceId: z.string() }).safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await razorpayPosService.createCheckoutSession(auth.tenantId, auth.userId, parsed.data.invoiceId, env)
        return reply.status(201).send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.post("/payments/razorpay/verify", { preHandler: [requirePermission(Permission.payments)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = z
        .object({
          sessionId: z.string(),
          razorpay_order_id: z.string(),
          razorpay_payment_id: z.string(),
          razorpay_signature: z.string(),
        })
        .safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await razorpayPosService.verifyCheckout(auth.tenantId, auth.userId, env, parsed.data)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/qr-sessions/:id", { preHandler: [requirePermission(Permission.payments)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const row = await qrSessionService.getById(auth.tenantId, id)
      if (!row) return sendError(reply, 404, "not_found", "Not found")
      return reply.send({ success: true, data: row })
    })

    app.post("/qr-sessions/:id/mark-paid", { preHandler: [requirePermission(Permission.payments)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const parsed = z.object({ paymentIdHint: z.string().optional() }).safeParse(request.body ?? {})
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await qrSessionService.markPaid(auth.tenantId, auth.userId, id, parsed.data.paymentIdHint)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/receipts", { preHandler: [requirePermission(Permission.receipts)] }, async (request, reply) => {
      const auth = request.auth!
      const data = await receiptService.list(auth.tenantId)
      return reply.send({ success: true, data })
    })

    app.post("/receipts", { preHandler: [requirePermission(Permission.receipts)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = z.object({ invoiceId: z.string() }).safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await receiptService.issueForInvoice(auth.tenantId, auth.userId, parsed.data.invoiceId)
        return reply.status(201).send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/receipts/:id", { preHandler: [requirePermission(Permission.receipts)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const row = await receiptService.getById(auth.tenantId, id)
      if (!row) return sendError(reply, 404, "not_found", "Not found")
      return reply.send({ success: true, data: row })
    })

    app.get("/receipts/:id/pdf", { preHandler: [requirePermission(Permission.receipts)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const q = request.query as { regenerate?: string }
      const force = q.regenerate === "1" || q.regenerate === "true"
      if (force && auth.role !== "owner" && auth.role !== "admin") {
        return sendError(reply, 403, "forbidden", "Only owner or admin can regenerate stored PDFs")
      }
      try {
        const { buffer, asset } = await storedDocumentService.ensureReceiptPdf(auth.tenantId, auth.userId, id, {
          forceRegenerate: force,
        })
        await storedDocumentService.logDownload(auth.tenantId, auth.userId, asset.id, asset.documentType)
        return reply
          .header("Content-Type", "application/pdf")
          .header("X-File-Asset-Id", asset.id)
          .header("Content-Disposition", `attachment; filename="${asset.originalFileName}"`)
          .send(buffer)
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/refunds", { preHandler: [requirePermission(Permission.refunds)] }, async (request, reply) => {
      const auth = request.auth!
      const data = await refundService.list(auth.tenantId)
      return reply.send({ success: true, data })
    })

    app.post("/refunds", { preHandler: [requirePermission(Permission.refunds)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = z
        .object({
          invoiceId: z.string(),
          paymentId: z.string().optional(),
          amount: z.number().positive(),
          reason: z.string().optional(),
        })
        .safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await refundService.create(auth.tenantId, auth.userId, parsed.data)
        return reply.status(201).send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/refunds/:id", { preHandler: [requirePermission(Permission.refunds)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const row = await refundService.getById(auth.tenantId, id)
      if (!row) return sendError(reply, 404, "not_found", "Not found")
      return reply.send({ success: true, data: row })
    })

    app.post("/refunds/:id/complete", { preHandler: [requirePermission(Permission.refunds)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const parsed = z.object({ providerRefundId: z.string().optional() }).safeParse(request.body ?? {})
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await refundService.complete(auth.tenantId, auth.userId, id, parsed.data.providerRefundId)
        return reply.send({ success: true, data })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/refunds/:id/pdf", { preHandler: [requirePermission(Permission.refunds)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const q = request.query as { regenerate?: string }
      const force = q.regenerate === "1" || q.regenerate === "true"
      if (force && auth.role !== "owner" && auth.role !== "admin") {
        return sendError(reply, 403, "forbidden", "Only owner or admin can regenerate stored PDFs")
      }
      try {
        const { buffer, asset } = await storedDocumentService.ensureRefundPdf(auth.tenantId, auth.userId, id, {
          forceRegenerate: force,
        })
        await storedDocumentService.logDownload(auth.tenantId, auth.userId, asset.id, asset.documentType)
        return reply
          .header("Content-Type", "application/pdf")
          .header("X-File-Asset-Id", asset.id)
          .header("Content-Disposition", `attachment; filename="${asset.originalFileName}"`)
          .send(buffer)
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    const ensureQuerySchema = z.object({
      documentType: z.enum(["invoice_pdf", "receipt_pdf", "refund_note_pdf"]),
      relatedEntityId: z.string().min(1),
    })

    app.get("/documents/ensure", { preHandler: [requireAuth] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = ensureQuerySchema.safeParse(request.query)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      const { documentType, relatedEntityId } = parsed.data
      const perm = permissionForDocumentType(documentType as FileAssetDocumentType)
      if (!hasPermission(auth.role, perm)) return sendError(reply, 403, "forbidden", "Insufficient permissions")
      try {
        if (documentType === "invoice_pdf") {
          const { asset } = await storedDocumentService.ensureInvoicePdf(auth.tenantId, auth.userId, relatedEntityId)
          return reply.send({ success: true, data: asset })
        }
        if (documentType === "receipt_pdf") {
          const { asset } = await storedDocumentService.ensureReceiptPdf(auth.tenantId, auth.userId, relatedEntityId)
          return reply.send({ success: true, data: asset })
        }
        const { asset } = await storedDocumentService.ensureRefundPdf(auth.tenantId, auth.userId, relatedEntityId)
        return reply.send({ success: true, data: asset })
      } catch (e: unknown) {
        const status = (e as Error & { statusCode?: number }).statusCode ?? 400
        return sendError(reply, status, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.get("/documents/files/:fileId/metadata", { preHandler: [requireAuth] }, async (request, reply) => {
      const auth = request.auth!
      const { fileId } = request.params as { fileId: string }
      const meta = await storedDocumentService.getMetadata(auth.tenantId, fileId)
      if (!meta) return sendError(reply, 404, "not_found", "File not found")
      if (!hasPermission(auth.role, permissionForDocumentType(meta.documentType))) {
        return sendError(reply, 403, "forbidden", "Insufficient permissions")
      }
      return reply.send({ success: true, data: meta })
    })

    app.get("/documents/files/:fileId/preview", { preHandler: [requireAuth] }, async (request, reply) => {
      const auth = request.auth!
      const { fileId } = request.params as { fileId: string }
      const meta = await storedDocumentService.getMetadata(auth.tenantId, fileId)
      if (!meta) return sendError(reply, 404, "not_found", "File not found")
      if (!hasPermission(auth.role, permissionForDocumentType(meta.documentType))) {
        return sendError(reply, 403, "forbidden", "Insufficient permissions")
      }
      const stream = await storedDocumentService.createReadStreamForAsset(auth.tenantId, fileId)
      if (!stream) return sendError(reply, 404, "not_found", "File content missing on storage")
      await storedDocumentService.logDownload(auth.tenantId, auth.userId, fileId, meta.documentType)
      return reply
        .header("Content-Type", meta.mimeType)
        .header("Content-Disposition", `inline; filename="${encodeURIComponent(meta.originalFileName)}"`)
        .send(stream)
    })

    app.get("/documents/files/:fileId/download", { preHandler: [requireAuth] }, async (request, reply) => {
      const auth = request.auth!
      const { fileId } = request.params as { fileId: string }
      const meta = await storedDocumentService.getMetadata(auth.tenantId, fileId)
      if (!meta) return sendError(reply, 404, "not_found", "File not found")
      if (!hasPermission(auth.role, permissionForDocumentType(meta.documentType))) {
        return sendError(reply, 403, "forbidden", "Insufficient permissions")
      }
      const stream = await storedDocumentService.createReadStreamForAsset(auth.tenantId, fileId)
      if (!stream) return sendError(reply, 404, "not_found", "File content missing on storage")
      await storedDocumentService.logDownload(auth.tenantId, auth.userId, fileId, meta.documentType)
      return reply
        .header("Content-Type", meta.mimeType)
        .header("Content-Disposition", `attachment; filename="${encodeURIComponent(meta.originalFileName)}"`)
        .send(stream)
    })

    app.post("/documents/files/:fileId/soft-delete", { preHandler: [requireAuth] }, async (request, reply) => {
      const auth = request.auth!
      if (auth.role !== "owner" && auth.role !== "admin") {
        return sendError(reply, 403, "forbidden", "Only owner or admin can archive stored files")
      }
      const { fileId } = request.params as { fileId: string }
      const meta = await storedDocumentService.getMetadata(auth.tenantId, fileId)
      if (!meta) return sendError(reply, 404, "not_found", "File not found")
      const ok = await storedDocumentService.deleteDocumentSoftPlaceholder(auth.tenantId, fileId, auth.userId)
      if (!ok) return sendError(reply, 404, "not_found", "File not found")
      return reply.send({ success: true, data: { ok: true } })
    })
  }

  await app.register(tenantRoutes, { prefix: "" })
}
