import mongoose from "mongoose"
import type { ResolvedBusinessRules } from "@repo/business-type-engine"
import { loadResolvedRulesWithOptionalBranch } from "../../lib/ruleResolver.js"
import { BusinessSettingsModel } from "../../models/business-settings.model.js"
import { invoiceService } from "../../services/invoice.service.js"
import type { BillingStrategyKey } from "./strategy-types.js"

/**
 * Thin facade over invoice completion so billing can later inject strategy selection without forking handlers.
 */
export const billingOrchestratorService = {
  /**
   * Resolve once per confirm using the same default branch as `invoiceService.complete` (BusinessSettings).
   */
  async loadRulesForDefaultBranch(tenantId: string): Promise<ResolvedBusinessRules> {
    const settings = await BusinessSettingsModel.findOne({ tenantId: new mongoose.Types.ObjectId(tenantId) })
    const branchCode = settings?.defaultBranchId ?? "main"
    return loadResolvedRulesWithOptionalBranch(tenantId, branchCode)
  },

  resolveBillingStrategyKey(rules: ResolvedBusinessRules): BillingStrategyKey {
    void rules
    return "standard_retail_complete"
  },

  async confirmInvoice(
    tenantId: string,
    actorId: string,
    invoiceId: string,
  ): Promise<Awaited<ReturnType<typeof invoiceService.complete>>> {
    const rules = await billingOrchestratorService.loadRulesForDefaultBranch(tenantId)
    const strategy = billingOrchestratorService.resolveBillingStrategyKey(rules)
    void strategy
    return invoiceService.complete(tenantId, actorId, invoiceId)
  },
}
