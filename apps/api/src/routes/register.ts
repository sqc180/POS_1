import type { FastifyInstance } from "fastify"
import { z } from "zod"
import type { ApiEnv } from "@repo/config"
import { Permission, hasPermission } from "@repo/permissions"
import type { FileAssetDocumentType } from "@repo/types"
import { createRequireAuth } from "../hooks/require-auth.js"
import { requirePermission } from "../hooks/require-perm.js"
import { sendError } from "../lib/reply.js"
import { authService, normalizeEmail } from "../services/auth.service.js"
import { businessSettingsService } from "../services/business-settings.service.js"
import { branchService } from "../services/branch.service.js"
import { categoryService } from "../services/category.service.js"
import { customerService } from "../services/customer.service.js"
import { gstSlabService } from "../services/gst-slab.service.js"
import { inventoryService } from "../services/inventory.service.js"
import { meService, userService } from "../services/user.service.js"
import { productService } from "../services/product.service.js"
import { stockService } from "../services/stock.service.js"
import { supplierService } from "../services/supplier.service.js"
import { permissionForDocumentType } from "../lib/document-permission.js"
import { resolveStorageRoot } from "../lib/storage-root.js"
import { createLocalFilesystemProvider } from "../storage/local-filesystem.provider.js"
import { createStoredDocumentService } from "../services/stored-document.service.js"
import { gatewayService } from "../services/gateway.service.js"
import { invoiceService } from "../services/invoice.service.js"
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
  const storage = createLocalFilesystemProvider(resolveStorageRoot(env))
  const storedDocumentService = createStoredDocumentService(storage)

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

  app.get("/health", async () => ({ ok: true }))

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
      const me = await meService.getMe(auth.tenantId, auth.userId)
      if (!me) return sendError(reply, 404, "not_found", "User or tenant not found")
      return reply.send({ success: true, data: me })
    },
  )

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

    app.get("/dashboard/summary", { preHandler: [requirePermission(Permission.dashboard)] }, async (request, reply) => {
      const auth = request.auth!
      const data = await dashboardSummaryService.get(auth.tenantId)
      return reply.send({ success: true, data })
    })

    app.get("/users", { preHandler: [requirePermission(Permission.users)] }, async (request, reply) => {
      const auth = request.auth!
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
          ...parsed.data,
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
      status: z.enum(["active", "inactive"]).optional(),
    })

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
      const q = (request.query as { q?: string }).q
      const data = await productService.list(auth.tenantId, q)
      return reply.send({ success: true, data })
    })

    app.get("/products/:id", { preHandler: [requirePermission(Permission.products)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const p = await productService.getById(auth.tenantId, id)
      if (!p) return sendError(reply, 404, "not_found", "Product not found")
      return reply.send({ success: true, data: p })
    })

    const productSchema = z.object({
      name: z.string().min(1),
      sku: z.string().min(1),
      barcode: z.string().optional(),
      categoryId: z.string().optional(),
      gstSlabId: z.string().optional(),
      taxMode: z.enum(["inclusive", "exclusive"]).optional(),
      sellingPrice: z.number().nonnegative(),
      costPrice: z.number().nonnegative().optional(),
      mrp: z.number().nonnegative().optional(),
      trackStock: z.boolean().optional(),
      brand: z.string().optional(),
      unit: z.string().optional(),
      imageUrl: z.string().optional(),
    })

    app.post("/products", { preHandler: [requirePermission(Permission.products)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = productSchema.safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
      try {
        const data = await productService.create(auth.tenantId, auth.userId, parsed.data)
        return reply.status(201).send({ success: true, data })
      } catch (e: unknown) {
        if (e && typeof e === "object" && "code" in e && (e as { code?: number }).code === 11000) {
          return sendError(reply, 409, "duplicate", "SKU must be unique")
        }
        return sendError(reply, 400, "error", e instanceof Error ? e.message : "Failed")
      }
    })

    app.patch("/products/:id", { preHandler: [requirePermission(Permission.products)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      const parsed = productSchema.partial().extend({ status: z.enum(["active", "inactive"]).optional() }).safeParse(request.body)
      if (!parsed.success) return sendError(reply, 400, "validation_error", parsed.error.message)
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
      type: z.enum(["in", "out", "adjustment", "correction", "transfer"]),
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

    const customerSchema = z.object({
      name: z.string().min(1),
      phone: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      gstin: z.string().optional(),
      address: z.string().optional(),
      notes: z.string().optional(),
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

    app.post("/pos/preview", { preHandler: [requirePermission(Permission.pos)] }, async (request, reply) => {
      const auth = request.auth!
      const parsed = z
        .object({
          lines: z.array(z.object({ productId: z.string(), qty: z.number().positive() })).min(1),
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
      lines: z.array(z.object({ productId: z.string(), qty: z.number().positive() })).min(1),
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

    app.post("/invoices/:id/complete", { preHandler: [requirePermission(Permission.billing)] }, async (request, reply) => {
      const auth = request.auth!
      const { id } = request.params as { id: string }
      try {
        const data = await invoiceService.complete(auth.tenantId, auth.userId, id)
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
