import { canCreateUserOrSetPassword } from "@repo/permissions"
import type { UserRole } from "@repo/types"
import { isPilotVerticalSlug } from "@repo/business-type-engine"
import { TenantModel } from "../models/tenant.model.js"
import { auditService } from "./audit.service.js"

export const tenantService = {
  async updatePilotVertical(
    tenantId: string,
    actorId: string,
    actorRole: UserRole,
    pilotVertical: string | null,
  ): Promise<{ pilotVertical: string | null }> {
    if (!canCreateUserOrSetPassword(actorRole)) {
      const err = new Error("Only owner or admin can change pilot vertical")
      ;(err as Error & { statusCode?: number }).statusCode = 403
      throw err
    }
    if (pilotVertical !== null && pilotVertical !== undefined && pilotVertical !== "") {
      const t = pilotVertical.trim()
      if (!isPilotVerticalSlug(t)) {
        const err = new Error("Invalid pilot vertical")
        ;(err as Error & { statusCode?: number }).statusCode = 400
        throw err
      }
    }
    const next = pilotVertical && String(pilotVertical).trim() !== "" ? String(pilotVertical).trim() : null
    const tenant = await TenantModel.findById(tenantId)
    if (!tenant) {
      const err = new Error("Tenant not found")
      ;(err as Error & { statusCode?: number }).statusCode = 404
      throw err
    }
    const prev = (tenant as { pilotVertical?: string | null }).pilotVertical ?? null
    ;(tenant as { pilotVertical?: string | null }).pilotVertical = next
    await tenant.save()
    await auditService.log({
      tenantId,
      actorId,
      action: "tenant.pilot_vertical",
      entity: "Tenant",
      entityId: tenant._id.toString(),
      metadata: { previous: prev, next },
    })
    return { pilotVertical: next }
  },
}
