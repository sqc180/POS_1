import mongoose from "mongoose"
import type { InvoiceDoc } from "../models/invoice.model.js"
import { InvoiceModel } from "../models/invoice.model.js"
import { PaymentModel } from "../models/payment.model.js"
import { ProductModel } from "../models/product.model.js"
import { RefundModel, type RefundDoc } from "../models/refund.model.js"
import { BusinessSettingsModel } from "../models/business-settings.model.js"
import { auditService } from "./audit.service.js"
import { numberingService } from "./numbering.service.js"
import { productSerialService } from "./product-serial.service.js"
import { stockBatchService } from "./stock-batch.service.js"
import { stockService } from "./stock.service.js"

type InvoiceItemRow = {
  productId: mongoose.Types.ObjectId
  variantId?: mongoose.Types.ObjectId
  qty: number
  lineTotal: number
  batchAllocations?: { batchId: mongoose.Types.ObjectId; qty: number }[]
  batchId?: mongoose.Types.ObjectId
  serialNumbers?: string[]
}

const roundMoney = (n: number) => Math.round(n * 100) / 100

const proratedLineTotal = (line: InvoiceItemRow, returnQty: number) => {
  if (line.qty <= 0) return 0
  return roundMoney((returnQty / line.qty) * line.lineTotal)
}

const sumReturnAmount = (inv: InvoiceDoc, returnLines: { lineIndex: number; qty: number }[]) => {
  let s = 0
  for (const rl of returnLines) {
    const row = inv.items[rl.lineIndex] as unknown as InvoiceItemRow | undefined
    if (!row) {
      const err = new Error("Invalid return line index")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    s += proratedLineTotal(row, rl.qty)
  }
  return roundMoney(s)
}

const sumCompletedReturnQtyByLine = async (
  tenantId: string,
  invoiceId: mongoose.Types.ObjectId,
): Promise<Map<number, number>> => {
  const tid = new mongoose.Types.ObjectId(tenantId)
  const agg = await RefundModel.aggregate<{ _id: number; qty: number }>([
    {
      $match: {
        tenantId: tid,
        invoiceId,
        status: "completed",
        returnLines: { $exists: true, $not: { $size: 0 } },
      },
    },
    { $unwind: "$returnLines" },
    { $group: { _id: "$returnLines.lineIndex", qty: { $sum: "$returnLines.qty" } } },
  ])
  return new Map(agg.map((x) => [x._id, x.qty]))
}

const applyStockForSaleReturn = async (
  tenantId: string,
  actorId: string,
  inv: InvoiceDoc,
  returnLines: { lineIndex: number; qty: number }[],
  refundId: string,
) => {
  const settings = await BusinessSettingsModel.findOne({ tenantId: new mongoose.Types.ObjectId(tenantId) })
  const branchId = settings?.defaultBranchId ?? "main"

  for (const rl of returnLines) {
    const row = inv.items[rl.lineIndex] as unknown as InvoiceItemRow
    if (!row) {
      const err = new Error("Invalid invoice line for stock return")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const rq = rl.qty
    const p = await ProductModel.findById(row.productId)
    const frac = rq / row.qty

    if (p?.trackStock) {
      await stockService.applySaleReturnQty(
        tenantId,
        actorId,
        row.productId.toString(),
        branchId,
        rq,
        {
          variantId: row.variantId?.toString(),
          primaryBatchId: row.batchId?.toString(),
        },
        refundId,
      )
    }

    const bals = row.batchAllocations ?? []
    if (bals.length > 0) {
      const scaled = bals.map((b) => ({
        batchId: b.batchId,
        qty: roundMoney(b.qty * frac),
      }))
      await stockBatchService.restoreConsumption(tenantId, scaled)
    } else if (row.batchId && p?.batchTracking) {
      await stockBatchService.restoreConsumption(tenantId, [{ batchId: row.batchId, qty: rq }])
    }

    const serials = row.serialNumbers ?? []
    if (serials.length > 0 && rq === row.qty) {
      await productSerialService.markAvailableAfterCancel(
        tenantId,
        inv._id.toString(),
        row.productId.toString(),
        serials,
      )
    }
  }
}

const toPublic = (r: RefundDoc) => {
  const raw = r as RefundDoc & {
    returnLines?: { lineIndex: number; qty: number }[]
  }
  return {
    id: r._id.toString(),
    tenantId: r.tenantId.toString(),
    refundNumber: r.refundNumber ?? "",
    invoiceId: r.invoiceId.toString(),
    paymentId: r.paymentId?.toString() ?? null,
    amount: r.amount,
    status: r.status,
    reason: r.reason ?? "",
    providerRefundId: r.providerRefundId ?? "",
    returnLines: raw.returnLines?.length ? raw.returnLines.map((x) => ({ lineIndex: x.lineIndex, qty: x.qty })) : null,
    createdBy: r.createdBy.toString(),
    createdAt: r.createdAt?.toISOString?.() ?? "",
  }
}

export const refundService = {
  toPublic,

  async list(tenantId: string) {
    const rows = await RefundModel.find({ tenantId: new mongoose.Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .limit(200)
    return rows.map(toPublic)
  },

  async getById(tenantId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null
    const r = await RefundModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    return r ? toPublic(r) : null
  },

  async create(
    tenantId: string,
    actorId: string,
    input: {
      invoiceId: string
      paymentId?: string
      amount: number
      reason?: string
      returnLines?: { lineIndex: number; qty: number }[]
    },
  ) {
    if (!mongoose.Types.ObjectId.isValid(input.invoiceId)) {
      const err = new Error("Invalid invoice")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const inv = await InvoiceModel.findOne({
      _id: new mongoose.Types.ObjectId(input.invoiceId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!inv || inv.status !== "completed") {
      const err = new Error("Invoice not eligible for refund")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }

    const returnLines = input.returnLines?.filter((x) => x.qty > 0) ?? []
    const useLineValidation = returnLines.length > 0

    if (useLineValidation) {
      const seen = new Set<number>()
      for (const rl of returnLines) {
        if (!Number.isInteger(rl.lineIndex) || rl.lineIndex < 0 || rl.lineIndex >= inv.items.length) {
          const err = new Error("Invalid return line index")
          ;(err as Error & { statusCode?: number }).statusCode = 400
          throw err
        }
        if (seen.has(rl.lineIndex)) {
          const err = new Error("Duplicate lineIndex in return lines; merge quantities into one row")
          ;(err as Error & { statusCode?: number }).statusCode = 400
          throw err
        }
        seen.add(rl.lineIndex)
        const row = inv.items[rl.lineIndex] as unknown as InvoiceItemRow
        const serials = row.serialNumbers ?? []
        if (serials.length > 0 && rl.qty !== row.qty) {
          const err = new Error("Serial-tracked lines require a full line return")
          ;(err as Error & { statusCode?: number }).statusCode = 400
          throw err
        }
        const prev = await sumCompletedReturnQtyByLine(tenantId, inv._id)
        const already = prev.get(rl.lineIndex) ?? 0
        if (rl.qty + already > row.qty + 0.0001) {
          const err = new Error("Return quantity exceeds remaining billable quantity on line")
          ;(err as Error & { statusCode?: number }).statusCode = 400
          throw err
        }
      }
      const expected = sumReturnAmount(inv, returnLines)
      if (Math.abs(expected - input.amount) > 0.02) {
        const err = new Error("Refund amount must match prorated line totals for return lines")
        ;(err as Error & { statusCode?: number }).statusCode = 400
        throw err
      }
    }

    const refundedAgg = await RefundModel.aggregate<{ s: number }>([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          invoiceId: new mongoose.Types.ObjectId(input.invoiceId),
          status: "completed",
        },
      },
      { $group: { _id: null, s: { $sum: "$amount" } } },
    ])
    const alreadyRefunded = refundedAgg[0]?.s ?? 0
    const maxRefundable = Math.round((inv.amountPaid - alreadyRefunded) * 100) / 100
    if (input.amount <= 0 || input.amount > maxRefundable + 0.0001) {
      const err = new Error("Invalid refund amount")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    if (input.paymentId && mongoose.Types.ObjectId.isValid(input.paymentId)) {
      const pay = await PaymentModel.findOne({
        _id: new mongoose.Types.ObjectId(input.paymentId),
        tenantId: new mongoose.Types.ObjectId(tenantId),
        invoiceId: inv._id,
        status: "completed",
      })
      if (!pay) {
        const err = new Error("Payment not found for invoice")
        ;(err as Error & { statusCode?: number }).statusCode = 400
        throw err
      }
    }
    const { number } = await numberingService.nextRefundNumber(tenantId)
    const r = await RefundModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      refundNumber: number,
      invoiceId: inv._id,
      paymentId:
        input.paymentId && mongoose.Types.ObjectId.isValid(input.paymentId)
          ? new mongoose.Types.ObjectId(input.paymentId)
          : undefined,
      amount: input.amount,
      status: "pending",
      reason: input.reason ?? "",
      createdBy: new mongoose.Types.ObjectId(actorId),
      ...(useLineValidation ? { returnLines } : {}),
    })
    await auditService.log({
      tenantId,
      actorId,
      action: "refund.create",
      entity: "Refund",
      entityId: r._id.toString(),
      metadata: { amount: input.amount, hasReturnLines: useLineValidation },
    })
    return toPublic(r)
  },

  async complete(tenantId: string, actorId: string, id: string, providerRefundId?: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid refund")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const r = await RefundModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!r || r.status !== "pending") {
      const err = new Error("Refund not completable")
      ;(err as Error & { statusCode?: number }).statusCode = 409
      throw err
    }
    const raw = r as RefundDoc & { returnLines?: { lineIndex: number; qty: number }[] }
    const lines = raw.returnLines?.filter((x) => x.qty > 0) ?? []

    const invFresh = await InvoiceModel.findById(r.invoiceId)
    if (!invFresh) {
      const err = new Error("Invoice missing")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }

    if (lines.length > 0) {
      await applyStockForSaleReturn(tenantId, actorId, invFresh, lines, r._id.toString())
    }

    r.status = "completed"
    if (providerRefundId) r.providerRefundId = providerRefundId
    await r.save()
    const inv = await InvoiceModel.findById(r.invoiceId)
    if (inv) {
      inv.amountPaid = Math.round((inv.amountPaid - r.amount) * 100) / 100
      if (inv.amountPaid < 0) inv.amountPaid = 0
      await inv.save()
    }
    await auditService.log({
      tenantId,
      actorId,
      action: "refund.complete",
      entity: "Refund",
      entityId: r._id.toString(),
    })
    return toPublic(r)
  },
}
