import { invoiceService } from "../../services/invoice.service.js"
import type { BillingStrategyKey } from "./strategy-types.js"

/**
 * Thin facade over invoice completion so billing can later inject strategy selection without forking handlers.
 */
export const billingOrchestratorService = {
  resolveBillingStrategyKey(): BillingStrategyKey {
    return "standard_retail_complete"
  },

  async confirmInvoice(
    tenantId: string,
    actorId: string,
    invoiceId: string,
  ): Promise<Awaited<ReturnType<typeof invoiceService.complete>>> {
    return invoiceService.complete(tenantId, actorId, invoiceId)
  },
}
