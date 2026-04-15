"use client"

import type { PortalPageCopyDTO } from "@repo/types"
import { useAuth } from "@/components/auth-provider"

const defaultPortalPageCopy: PortalPageCopyDTO = {
  posScreenTitle: "Point of sale",
  billingScreenTitle: "Billing",
  receiptsScreenTitle: "Receipts",
}

/** Page titles for POS / billing / receipts from `/me` (portal experience). */
export const usePortalCopy = (): PortalPageCopyDTO => {
  const { me } = useAuth()
  return me?.portalPageCopy ?? defaultPortalPageCopy
}
