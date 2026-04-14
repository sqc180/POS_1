import mongoose from "mongoose"
import { getCreditPolicyForCapabilities, resolveVerticalCapabilities } from "@repo/business-type-engine"
import { canCreateUserOrSetPassword } from "@repo/permissions"
import type { UserRole } from "@repo/types"
import { BusinessSettingsModel } from "../models/business-settings.model.js"
import { InvoiceModel, type InvoiceDoc } from "../models/invoice.model.js"
import { ProductModel } from "../models/product.model.js"
import { TenantModel } from "../models/tenant.model.js"
import { auditService } from "./audit.service.js"
import { customerService } from "./customer.service.js"
import { numberingService } from "./numbering.service.js"
import { productSerialService } from "./product-serial.service.js"
import { stockBatchService } from "./stock-batch.service.js"
import { stockService } from "./stock.service.js"
import { taxService, type BuiltLine, type LineInput } from "./tax.service.js"

type InvoiceItemSub = {
  productId: mongoose.Types.ObjectId
  variantId?: mongoose.Types.ObjectId
  variantLabel?: string
  variantSku?: string
  batchId?: mongoose.Types.ObjectId
  batchCode?: string
  expiryDate?: Date
  serialNumbers?: string[]
  batchAllocations?: { batchId: mongoose.Types.ObjectId; qty: number }[]
  name: string
  sku: string
  qty: number
  unitPrice: number
  taxMode: string
  gstSlabId?: mongoose.Types.ObjectId
  cgstRate: number
  sgstRate: number
  igstRate: number
  taxableValue: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  lineTotal: number
}

const toPublic = (inv: InvoiceDoc) => ({
  id: inv._id.toString(),
  tenantId: inv.tenantId.toString(),
  invoiceNumber: inv.invoiceNumber ?? "",
  status: inv.status,
  documentType: (inv as { documentType?: string }).documentType ?? "tax_invoice",
  approvalState: (inv as { approvalState?: string }).approvalState ?? "none",
  customerId: inv.customerId?.toString() ?? null,
  cashierId: inv.cashierId.toString(),
  items: inv.items.map((i) => {
    const row = i as unknown as InvoiceItemSub
    return {
      productId: row.productId.toString(),
      variantId: row.variantId?.toString() ?? null,
      variantLabel: row.variantLabel ?? "",
      variantSku: row.variantSku ?? "",
      batchId: row.batchId?.toString() ?? null,
      batchCode: row.batchCode ?? "",
      expiryDate: row.expiryDate?.toISOString?.() ?? null,
      serialNumbers: row.serialNumbers ?? [],
      batchAllocations: (row.batchAllocations ?? []).map((b) => ({
        batchId: b.batchId.toString(),
        qty: b.qty,
      })),
      name: row.name,
      sku: row.sku,
      qty: row.qty,
      unitPrice: row.unitPrice,
      taxMode: row.taxMode,
      gstSlabId: row.gstSlabId?.toString() ?? null,
      cgstRate: row.cgstRate,
      sgstRate: row.sgstRate,
      igstRate: row.igstRate,
      taxableValue: row.taxableValue,
      cgstAmount: row.cgstAmount,
      sgstAmount: row.sgstAmount,
      igstAmount: row.igstAmount,
      lineTotal: row.lineTotal,
    }
  }),
  subtotal: inv.subtotal,
  cgstTotal: inv.cgstTotal,
  sgstTotal: inv.sgstTotal,
  igstTotal: inv.igstTotal,
  grandTotal: inv.grandTotal,
  amountPaid: inv.amountPaid,
  notes: inv.notes ?? "",
  receiptIssued: inv.receiptIssued ?? false,
  cancelledAt: inv.cancelledAt?.toISOString() ?? null,
  cancelReason: inv.cancelReason ?? "",
  createdAt: inv.createdAt?.toISOString?.() ?? "",
  updatedAt: inv.updatedAt?.toISOString?.() ?? "",
})

const persistLines = (built: BuiltLine[]) =>
  built.map((l) => ({
    productId: l.productId,
    variantId: l.variantId,
    variantLabel: l.variantLabel ?? "",
    variantSku: l.variantSku ?? "",
    batchId: l.batchId,
    batchCode: l.batchCode ?? "",
    expiryDate: l.expiryDate,
    serialNumbers: l.serialNumbers ?? [],
    batchAllocations: (l.batchAllocations ?? []).map((b) => ({
      batchId: b.batchId,
      qty: b.qty,
    })),
    name: l.name,
    sku: l.sku,
    qty: l.qty,
    unitPrice: l.unitPrice,
    taxMode: l.taxMode,
    gstSlabId: l.gstSlabId,
    cgstRate: l.cgstRate,
    sgstRate: l.sgstRate,
    igstRate: l.igstRate,
    taxableValue: l.taxableValue,
    cgstAmount: l.cgstAmount,
    sgstAmount: l.sgstAmount,
    igstAmount: l.igstAmount,
    lineTotal: l.lineTotal,
  }))

export const invoiceService = {
  toPublic,

  async list(tenantId: string, status?: string) {
    const q: Record<string, unknown> = { tenantId: new mongoose.Types.ObjectId(tenantId) }
    if (status) q.status = status
    const rows = await InvoiceModel.find(q).sort({ createdAt: -1 }).limit(200)
    return rows.map(toPublic)
  },

  async getById(tenantId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null
    const inv = await InvoiceModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    return inv ? toPublic(inv) : null
  },

  async createDraft(
    tenantId: string,
    actorId: string,
    input: { customerId?: string; lines: LineInput[]; notes?: string },
  ) {
    const { lines: built } = await taxService.buildLinesFromProducts(tenantId, input.lines)
    const sums = taxService.summarize(built)
    const inv = await InvoiceModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: "draft",
      customerId:
        input.customerId && mongoose.Types.ObjectId.isValid(input.customerId)
          ? new mongoose.Types.ObjectId(input.customerId)
          : undefined,
      cashierId: new mongoose.Types.ObjectId(actorId),
      items: persistLines(built),
      ...sums,
      amountPaid: 0,
      notes: input.notes ?? "",
    })
    await auditService.log({
      tenantId,
      actorId,
      action: "invoice.create",
      entity: "Invoice",
      entityId: inv._id.toString(),
      metadata: { status: "draft" },
    })
    return toPublic(inv)
  },

  async updateDraft(
    tenantId: string,
    actorId: string,
    id: string,
    input: { customerId?: string | null; lines?: LineInput[]; notes?: string },
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid invoice")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const inv = await InvoiceModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!inv || inv.status !== "draft") {
      const err = new Error("Invoice not editable")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    if (input.customerId !== undefined) {
      inv.customerId =
        input.customerId && mongoose.Types.ObjectId.isValid(input.customerId)
          ? new mongoose.Types.ObjectId(input.customerId)
          : undefined
    }
    if (input.notes !== undefined) inv.notes = input.notes
    if (input.lines) {
      const { lines: built } = await taxService.buildLinesFromProducts(tenantId, input.lines)
      const sums = taxService.summarize(built)
      inv.items = persistLines(built) as typeof inv.items
      inv.subtotal = sums.subtotal
      inv.cgstTotal = sums.cgstTotal
      inv.sgstTotal = sums.sgstTotal
      inv.igstTotal = sums.igstTotal
      inv.grandTotal = sums.grandTotal
      ;(inv as { approvalState?: string }).approvalState = "none"
    }
    await inv.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "invoice.update_draft",
      entity: "Invoice",
      entityId: inv._id.toString(),
    })
    return toPublic(inv)
  },

  async complete(tenantId: string, actorId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid invoice")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const inv = await InvoiceModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!inv || inv.status !== "draft") {
      const err = new Error("Invoice cannot be completed")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    const approvalState = (inv as { approvalState?: string }).approvalState ?? "none"
    if (approvalState === "pending") {
      const err = new Error("Invoice is pending approval and cannot be completed yet")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    if (approvalState === "rejected") {
      const err = new Error("Invoice approval was rejected; update lines and resubmit for approval")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    const settings = await BusinessSettingsModel.findOne({ tenantId: new mongoose.Types.ObjectId(tenantId) })
    const branchId = settings?.defaultBranchId ?? "main"
    const lineInputs: LineInput[] = inv.items.map((i) => {
      const row = i as unknown as InvoiceItemSub
      return {
        productId: row.productId.toString(),
        qty: row.qty,
        variantId: row.variantId?.toString(),
        batchId: row.batchId?.toString(),
        serialNumbers: row.serialNumbers?.length ? [...row.serialNumbers] : undefined,
      }
    })
    const { lines: built } = await taxService.buildLinesFromProducts(tenantId, lineInputs)

    let lineIndex = 0
    for (const l of built) {
      const p = await ProductModel.findById(l.productId)
      if (p?.serialTracking) {
        const serials = l.serialNumbers ?? []
        await productSerialService.assertAvailableForSale(
          tenantId,
          l.productId.toString(),
          l.variantId?.toString(),
          serials,
          l.qty,
        )
        await productSerialService.markSold(
          tenantId,
          inv._id.toString(),
          l.productId.toString(),
          l.variantId?.toString(),
          serials,
          lineIndex,
        )
      }
      if (p?.batchTracking) {
        const alloc = await stockBatchService.allocateConsumption(
          tenantId,
          l.productId.toString(),
          l.variantId?.toString(),
          branchId,
          l.qty,
          l.batchId?.toString(),
        )
        l.batchId = alloc.primaryBatchId
        l.batchCode = alloc.batchCode
        l.expiryDate = alloc.expiryDate
        l.batchAllocations = alloc.consumption
        await stockBatchService.applyConsumption(tenantId, alloc.consumption)
      }
      lineIndex += 1
    }

    const sums = taxService.summarize(built)
    inv.items = persistLines(built) as typeof inv.items
    inv.subtotal = sums.subtotal
    inv.cgstTotal = sums.cgstTotal
    inv.sgstTotal = sums.sgstTotal
    inv.igstTotal = sums.igstTotal
    inv.grandTotal = sums.grandTotal

    const tenantRow = await TenantModel.findById(new mongoose.Types.ObjectId(tenantId))
    const pilotRaw = (tenantRow as { pilotVertical?: string | null } | null)?.pilotVertical ?? null
    const caps = resolveVerticalCapabilities(pilotRaw)
    const creditHint = getCreditPolicyForCapabilities(caps)
    if (creditHint.atComplete === "audit_over_limit" && inv.customerId) {
      const snap = await customerService.getReceivableSnapshot(tenantId, inv.customerId.toString())
      const limit = snap.creditLimit
      if (limit > 0 && snap.outstanding + sums.grandTotal > limit) {
        await auditService.log({
          tenantId,
          actorId,
          action: "invoice.complete_credit_advisory",
          entity: "Invoice",
          entityId: inv._id.toString(),
          metadata: {
            customerId: inv.customerId.toString(),
            creditLimit: limit,
            outstandingBefore: snap.outstanding,
            proposedTotal: sums.grandTotal,
          },
        })
      }
    }

    const { number } = await numberingService.nextInvoiceNumber(tenantId)
    inv.invoiceNumber = number
    inv.status = "completed"

    for (const line of inv.items) {
      const row = line as unknown as InvoiceItemSub
      const p = await ProductModel.findById(row.productId)
      if (p?.trackStock) {
        await stockService.applyForProduct(
          tenantId,
          actorId,
          row.productId.toString(),
          branchId,
          "out",
          row.qty,
          "invoice",
          inv._id.toString(),
          {
            variantId: row.variantId?.toString(),
            primaryBatchId: row.batchId?.toString(),
          },
        )
      }
    }
    await inv.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "invoice.complete",
      entity: "Invoice",
      entityId: inv._id.toString(),
      metadata: { invoiceNumber: number, grandTotal: inv.grandTotal },
    })
    return toPublic(inv)
  },

  async cancel(tenantId: string, actorId: string, id: string, reason?: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid invoice")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const inv = await InvoiceModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!inv) {
      const err = new Error("Not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    if (inv.status === "cancelled") {
      const err = new Error("Already cancelled")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    if (inv.status === "draft") {
      inv.status = "cancelled"
      inv.cancelledAt = new Date()
      inv.cancelReason = reason ?? ""
      await inv.save()
      await auditService.log({
        tenantId,
        actorId,
        action: "invoice.cancel",
        entity: "Invoice",
        entityId: inv._id.toString(),
        metadata: { wasDraft: true },
      })
      return toPublic(inv)
    }
    if (inv.amountPaid > 0) {
      const err = new Error("Cannot cancel invoice with payments; refund first")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    const settings = await BusinessSettingsModel.findOne({ tenantId: new mongoose.Types.ObjectId(tenantId) })
    const branchId = settings?.defaultBranchId ?? "main"
    for (const line of inv.items) {
      const row = line as unknown as InvoiceItemSub
      const p = await ProductModel.findById(row.productId)
      if (p?.trackStock) {
        await stockService.applyForProduct(
          tenantId,
          actorId,
          row.productId.toString(),
          branchId,
          "in",
          row.qty,
          "invoice_cancel",
          inv._id.toString(),
          {
            variantId: row.variantId?.toString(),
            primaryBatchId: row.batchId?.toString(),
          },
        )
      }
      const bals = row.batchAllocations ?? []
      if (bals.length > 0) {
        await stockBatchService.restoreConsumption(
          tenantId,
          bals.map((b) => ({ batchId: b.batchId, qty: b.qty })),
        )
      } else if (row.batchId && p?.batchTracking) {
        await stockBatchService.restoreConsumption(tenantId, [{ batchId: row.batchId, qty: row.qty }])
      }
      if (row.serialNumbers?.length) {
        await productSerialService.markAvailableAfterCancel(
          tenantId,
          inv._id.toString(),
          row.productId.toString(),
          row.serialNumbers,
        )
      }
    }
    inv.status = "cancelled"
    inv.cancelledAt = new Date()
    inv.cancelReason = reason ?? ""
    await inv.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "invoice.cancel",
      entity: "Invoice",
      entityId: inv._id.toString(),
      metadata: { hadStockRestore: true },
    })
    return toPublic(inv)
  },

  async addAmountPaid(tenantId: string, invoiceId: string, delta: number) {
    const inv = await InvoiceModel.findOne({
      _id: new mongoose.Types.ObjectId(invoiceId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!inv) return
    inv.amountPaid = Math.round((inv.amountPaid + delta) * 100) / 100
    await inv.save()
  },

  async submitApprovalForInvoice(tenantId: string, actorId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid invoice")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const inv = await InvoiceModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!inv || inv.status !== "draft") {
      const err = new Error("Only draft invoices can be submitted for approval")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    const cur = ((inv as { approvalState?: string }).approvalState ?? "none") as string
    if (cur !== "none" && cur !== "rejected") {
      const err = new Error("Invoice is not in a state that allows submit for approval")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    ;(inv as { approvalState?: string }).approvalState = "pending"
    await inv.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "invoice.submit_approval",
      entity: "Invoice",
      entityId: inv._id.toString(),
    })
    return toPublic(inv)
  },

  async approveInvoice(tenantId: string, actorId: string, actorRole: UserRole, id: string) {
    if (!canCreateUserOrSetPassword(actorRole)) {
      const err = new Error("Only owner or admin can approve invoices")
      ;(err as Error & { statusCode?: number }).statusCode = 403
      throw err
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid invoice")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const inv = await InvoiceModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!inv || inv.status !== "draft") {
      const err = new Error("Invoice not found or not a draft")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    if (((inv as { approvalState?: string }).approvalState ?? "none") !== "pending") {
      const err = new Error("Invoice is not pending approval")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    ;(inv as { approvalState?: string }).approvalState = "approved"
    await inv.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "invoice.approve",
      entity: "Invoice",
      entityId: inv._id.toString(),
    })
    return toPublic(inv)
  },

  async rejectInvoiceApproval(tenantId: string, actorId: string, actorRole: UserRole, id: string) {
    if (!canCreateUserOrSetPassword(actorRole)) {
      const err = new Error("Only owner or admin can reject invoice approvals")
      ;(err as Error & { statusCode?: number }).statusCode = 403
      throw err
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid invoice")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const inv = await InvoiceModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!inv || inv.status !== "draft") {
      const err = new Error("Invoice not found or not a draft")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    if (((inv as { approvalState?: string }).approvalState ?? "none") !== "pending") {
      const err = new Error("Invoice is not pending approval")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    ;(inv as { approvalState?: string }).approvalState = "rejected"
    await inv.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "invoice.reject_approval",
      entity: "Invoice",
      entityId: inv._id.toString(),
    })
    return toPublic(inv)
  },
}
