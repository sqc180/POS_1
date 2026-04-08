import mongoose from "mongoose"
import { BusinessSettingsModel } from "../models/business-settings.model.js"
import { auditService } from "./audit.service.js"

export const businessSettingsService = {
  async get(tenantId: string) {
    const s = await BusinessSettingsModel.findOne({ tenantId: new mongoose.Types.ObjectId(tenantId) })
    if (!s) return null
    return {
      id: s._id.toString(),
      tenantId: s.tenantId.toString(),
      defaultBranchId: s.defaultBranchId,
      allowNegativeStock: s.allowNegativeStock,
      invoiceNumberPrefix: s.invoiceNumberPrefix,
      receiptNumberPrefix: s.receiptNumberPrefix,
      refundNumberPrefix: s.refundNumberPrefix ?? "REF",
      defaultTaxMode: s.defaultTaxMode,
      posDefaultPaymentMode: s.posDefaultPaymentMode,
      intraStateDefault: s.intraStateDefault ?? true,
      placeOfSupplyState: s.placeOfSupplyState ?? "",
      updatedAt: s.updatedAt?.toISOString?.() ?? "",
    }
  },

  async update(
    tenantId: string,
    actorId: string,
    input: Partial<{
      allowNegativeStock: boolean
      invoiceNumberPrefix: string
      receiptNumberPrefix: string
      refundNumberPrefix: string
      defaultTaxMode: string
      posDefaultPaymentMode: string
      defaultBranchId: string
      intraStateDefault: boolean
      placeOfSupplyState: string
    }>,
  ) {
    const s = await BusinessSettingsModel.findOne({ tenantId: new mongoose.Types.ObjectId(tenantId) })
    if (!s) {
      const err = new Error("Settings not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    if (input.allowNegativeStock !== undefined) s.allowNegativeStock = input.allowNegativeStock
    if (input.invoiceNumberPrefix !== undefined) s.invoiceNumberPrefix = input.invoiceNumberPrefix
    if (input.receiptNumberPrefix !== undefined) s.receiptNumberPrefix = input.receiptNumberPrefix
    if (input.refundNumberPrefix !== undefined) s.refundNumberPrefix = input.refundNumberPrefix
    if (input.defaultTaxMode !== undefined) s.defaultTaxMode = input.defaultTaxMode as "inclusive" | "exclusive"
    if (input.posDefaultPaymentMode !== undefined) s.posDefaultPaymentMode = input.posDefaultPaymentMode
    if (input.defaultBranchId !== undefined) s.defaultBranchId = input.defaultBranchId
    if (input.intraStateDefault !== undefined) s.intraStateDefault = input.intraStateDefault
    if (input.placeOfSupplyState !== undefined) s.placeOfSupplyState = input.placeOfSupplyState
    await s.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "business_settings.update",
      entity: "BusinessSettings",
      entityId: s._id.toString(),
      metadata: { fields: Object.keys(input) },
    })
    return businessSettingsService.get(tenantId)
  },
}
