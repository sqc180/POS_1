import mongoose from "mongoose"
import { CustomerModel, type CustomerDoc } from "../models/customer.model.js"
import { InvoiceModel } from "../models/invoice.model.js"
import { auditService } from "./audit.service.js"

const toPublic = (c: CustomerDoc) => ({
  id: c._id.toString(),
  tenantId: c.tenantId.toString(),
  name: c.name,
  phone: c.phone ?? "",
  email: c.email ?? "",
  gstin: c.gstin ?? "",
  address: c.address ?? "",
  notes: c.notes ?? "",
  creditLimit: (c as { creditLimit?: number }).creditLimit ?? 0,
  status: c.status,
  createdAt: c.createdAt?.toISOString?.() ?? "",
  updatedAt: c.updatedAt?.toISOString?.() ?? "",
})

export const customerService = {
  toPublic,

  async list(tenantId: string, q?: string) {
    const filter: Record<string, unknown> = { tenantId: new mongoose.Types.ObjectId(tenantId) }
    if (q?.trim()) {
      filter.$or = [{ name: new RegExp(q.trim(), "i") }, { phone: new RegExp(q.trim(), "i") }]
    }
    const rows = await CustomerModel.find(filter).sort({ updatedAt: -1 }).limit(200)
    return rows.map(toPublic)
  },

  async getById(tenantId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null
    const c = await CustomerModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    return c ? toPublic(c) : null
  },

  async create(
    tenantId: string,
    actorId: string,
    input: {
      name: string
      phone?: string
      email?: string
      gstin?: string
      address?: string
      notes?: string
    },
  ) {
    const c = await CustomerModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      ...input,
      status: "active",
    })
    await auditService.log({
      tenantId,
      actorId,
      action: "customer.create",
      entity: "Customer",
      entityId: c._id.toString(),
    })
    return toPublic(c)
  },

  async update(
    tenantId: string,
    actorId: string,
    id: string,
    input: Partial<{
      name: string
      phone: string
      email: string
      gstin: string
      address: string
      notes: string
      creditLimit: number
      status: string
    }>,
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error("Invalid id")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const c = await CustomerModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    if (!c) {
      const err = new Error("Not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    Object.assign(c, input)
    if (input.creditLimit !== undefined) {
      ;(c as { creditLimit?: number }).creditLimit = Math.max(0, input.creditLimit)
    }
    if (input.status !== undefined) c.status = input.status as "active" | "inactive"
    await c.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "customer.update",
      entity: "Customer",
      entityId: c._id.toString(),
    })
    return toPublic(c)
  },

  async getReceivableSnapshot(tenantId: string, customerId: string) {
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      const err = new Error("Invalid customer")
      ;(err as Error & { statusCode?: number }).statusCode = 400
      throw err
    }
    const custOid = new mongoose.Types.ObjectId(customerId)
    const tenantOid = new mongoose.Types.ObjectId(tenantId)
    const agg = await InvoiceModel.aggregate<{
      invoiced: number
      paid: number
      openCount: number
    }>([
      {
        $match: {
          tenantId: tenantOid,
          customerId: custOid,
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          invoiced: { $sum: "$grandTotal" },
          paid: { $sum: "$amountPaid" },
          openCount: {
            $sum: {
              $cond: [{ $lt: ["$amountPaid", "$grandTotal"] }, 1, 0],
            },
          },
        },
      },
    ])
    const row = agg[0]
    const invoiced = row?.invoiced ?? 0
    const paid = row?.paid ?? 0
    const outstanding = Math.round((invoiced - paid) * 100) / 100
    const c = await CustomerModel.findOne({ _id: custOid, tenantId: tenantOid })
    const creditLimit = (c as { creditLimit?: number } | null)?.creditLimit ?? 0
    return {
      invoicedTotal: invoiced,
      amountPaidTotal: paid,
      outstanding,
      creditLimit,
      openInvoiceCount: row?.openCount ?? 0,
      creditExceeded: creditLimit > 0 && outstanding > creditLimit,
    }
  },
}
