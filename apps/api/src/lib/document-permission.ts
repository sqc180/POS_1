import { Permission, type PermissionId } from "@repo/permissions"
import type { FileAssetDocumentType } from "@repo/types"

export const permissionForDocumentType = (dt: FileAssetDocumentType): PermissionId => {
  switch (dt) {
    case "invoice_pdf":
      return Permission.billing
    case "receipt_pdf":
      return Permission.receipts
    case "refund_note_pdf":
      return Permission.refunds
    case "business_logo":
      return Permission.settings
    case "product_image":
      return Permission.products
    case "generic_document":
    default:
      return Permission.settings
  }
}
