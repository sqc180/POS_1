import { createHash, randomUUID } from "crypto"
import type { Readable } from "stream"
import mongoose from "mongoose"
import type { FileAssetDocumentType, FileAssetModule, FileAssetPublic } from "@repo/types"
import { assertSafeRelativePath, buildDocumentRelativePath } from "../storage/path-utils.js"
import type { StorageProvider } from "../storage/storage-provider.types.js"
import { FileAssetModel, type FileAssetDoc } from "../models/file-asset.model.js"
import { InvoiceModel } from "../models/invoice.model.js"
import { ReceiptModel } from "../models/receipt.model.js"
import { RefundModel } from "../models/refund.model.js"
import { documentPdfService } from "./document-pdf.service.js"
import { auditService } from "./audit.service.js"

const toPublic = (d: FileAssetDoc): FileAssetPublic => ({
  id: d._id.toString(),
  tenantId: d.tenantId.toString(),
  module: d.module as FileAssetModule,
  documentType: d.documentType as FileAssetDocumentType,
  relatedEntityType: d.relatedEntityType,
  relatedEntityId: d.relatedEntityId.toString(),
  originalFileName: d.originalFileName,
  storedFileName: d.storedFileName,
  relativePath: d.relativePath,
  mimeType: d.mimeType,
  extension: d.extension,
  fileSize: d.fileSize,
  checksumSha256: d.checksumSha256 ?? "",
  storageProvider: d.storageProvider,
  status: d.status as FileAssetPublic["status"],
  version: d.version,
  createdBy: d.createdBy.toString(),
  createdAt: d.createdAt?.toISOString?.() ?? new Date().toISOString(),
  updatedAt: d.updatedAt?.toISOString?.() ?? new Date().toISOString(),
})

const isDupKey = (e: unknown): boolean => {
  const o = typeof e === "object" && e !== null ? (e as { code?: number; message?: string }) : {}
  return o.code === 11000 || (typeof o.message === "string" && o.message.includes("E11000"))
}

type DocFolder = "invoices" | "receipts" | "refunds"

export type StoredDocumentServiceOptions = {
  /** Optional prefix under storage root (e.g. PDF_STORAGE_PATH). */
  pdfPathPrefix?: string
}

export const createStoredDocumentService = (
  storage: StorageProvider,
  opts: StoredDocumentServiceOptions = {},
) => {
  void opts.pdfPathPrefix
  const persistNewAsset = async (input: {
    tenantId: string
    actorId: string
    documentType: FileAssetDocumentType
    relatedEntityType: string
    relatedEntityId: string
    module: FileAssetModule
    folder: DocFolder
    buffer: Buffer
    originalFileName: string
    mimeType: string
    extension: string
    storageProviderId: string
  }): Promise<FileAssetDoc> => {
    const checksumSha256 = createHash("sha256").update(input.buffer).digest("hex")
    const storedFileName = `${randomUUID()}.${input.extension}`
    const relativePath = buildDocumentRelativePath(input.tenantId, input.folder, storedFileName)
    assertSafeRelativePath(relativePath)
    await storage.saveFile({
      relativePath,
      buffer: input.buffer,
      mimeType: input.mimeType,
    })
    try {
      const doc = await FileAssetModel.create({
        tenantId: new mongoose.Types.ObjectId(input.tenantId),
        module: input.module,
        documentType: input.documentType,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: new mongoose.Types.ObjectId(input.relatedEntityId),
        originalFileName: input.originalFileName,
        storedFileName,
        relativePath,
        mimeType: input.mimeType,
        extension: input.extension,
        fileSize: input.buffer.byteLength,
        checksumSha256,
        storageProvider: input.storageProviderId,
        status: "active",
        version: 1,
        createdBy: new mongoose.Types.ObjectId(input.actorId),
      })
      return doc
    } catch (e) {
      await storage.deleteFile(relativePath)
      throw e
    }
  }

  const softDeleteAsset = async (doc: FileAssetDoc): Promise<void> => {
    await storage.deleteFile(doc.relativePath)
    await FileAssetModel.updateOne({ _id: doc._id }, { $set: { status: "deleted" } })
  }

  const findActive = async (
    tenantId: string,
    relatedEntityType: string,
    relatedEntityId: string,
    documentType: FileAssetDocumentType,
  ): Promise<FileAssetDoc | null> =>
    FileAssetModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      relatedEntityType,
      relatedEntityId: new mongoose.Types.ObjectId(relatedEntityId),
      documentType,
      status: "active",
    })

  const ensureInvoicePdf = async (
    tenantId: string,
    actorId: string,
    invoiceId: string,
    opts?: { forceRegenerate?: boolean },
  ): Promise<{ buffer: Buffer; asset: FileAssetPublic }> => {
    let existing = await findActive(tenantId, "Invoice", invoiceId, "invoice_pdf")
    if (existing && opts?.forceRegenerate) {
      await softDeleteAsset(existing)
      existing = null
    }
    if (existing) {
      const onDisk = await storage.exists(existing.relativePath)
      if (onDisk) {
        const buffer = await storage.readFile(existing.relativePath)
        return { buffer, asset: toPublic(existing) }
      }
      await softDeleteAsset(existing)
    }
    const buffer = await documentPdfService.invoicePdfBuffer(tenantId, invoiceId)
    const inv = await InvoiceModel.findOne({
      _id: new mongoose.Types.ObjectId(invoiceId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    const invNum = inv?.invoiceNumber ?? invoiceId
    const originalFileName = `invoice-${String(invNum).replace(/[^\w.-]+/g, "_")}.pdf`
    let doc: FileAssetDoc
    try {
      doc = await persistNewAsset({
        tenantId,
        actorId,
        documentType: "invoice_pdf",
        relatedEntityType: "Invoice",
        relatedEntityId: invoiceId,
        module: "documents",
        folder: "invoices",
        buffer,
        originalFileName,
        mimeType: "application/pdf",
        extension: "pdf",
        storageProviderId: storage.providerId,
      })
    } catch (e) {
      if (isDupKey(e)) {
        const again = await findActive(tenantId, "Invoice", invoiceId, "invoice_pdf")
        if (again && (await storage.exists(again.relativePath))) {
          const b = await storage.readFile(again.relativePath)
          return { buffer: b, asset: toPublic(again) }
        }
      }
      throw e
    }
    try {
      await auditService.log({
        tenantId,
        actorId,
        action: "document.generated",
        entity: "FileAsset",
        entityId: doc._id.toString(),
        metadata: { documentType: "invoice_pdf", relatedEntityId: invoiceId },
      })
    } catch {
      /* audit must not break generation */
    }
    return { buffer, asset: toPublic(doc) }
  }

  const ensureReceiptPdf = async (
    tenantId: string,
    actorId: string,
    receiptId: string,
    opts?: { forceRegenerate?: boolean },
  ): Promise<{ buffer: Buffer; asset: FileAssetPublic }> => {
    let existing = await findActive(tenantId, "Receipt", receiptId, "receipt_pdf")
    if (existing && opts?.forceRegenerate) {
      await softDeleteAsset(existing)
      existing = null
    }
    if (existing) {
      const onDisk = await storage.exists(existing.relativePath)
      if (onDisk) {
        const buffer = await storage.readFile(existing.relativePath)
        return { buffer, asset: toPublic(existing) }
      }
      await softDeleteAsset(existing)
    }
    const buffer = await documentPdfService.receiptPdfBuffer(tenantId, receiptId)
    const r = await ReceiptModel.findOne({
      _id: new mongoose.Types.ObjectId(receiptId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    const num = r?.receiptNumber ?? receiptId
    const originalFileName = `receipt-${String(num).replace(/[^\w.-]+/g, "_")}.pdf`
    let doc: FileAssetDoc
    try {
      doc = await persistNewAsset({
        tenantId,
        actorId,
        documentType: "receipt_pdf",
        relatedEntityType: "Receipt",
        relatedEntityId: receiptId,
        module: "documents",
        folder: "receipts",
        buffer,
        originalFileName,
        mimeType: "application/pdf",
        extension: "pdf",
        storageProviderId: storage.providerId,
      })
    } catch (e) {
      if (isDupKey(e)) {
        const again = await findActive(tenantId, "Receipt", receiptId, "receipt_pdf")
        if (again && (await storage.exists(again.relativePath))) {
          const b = await storage.readFile(again.relativePath)
          return { buffer: b, asset: toPublic(again) }
        }
      }
      throw e
    }
    try {
      await auditService.log({
        tenantId,
        actorId,
        action: "document.generated",
        entity: "FileAsset",
        entityId: doc._id.toString(),
        metadata: { documentType: "receipt_pdf", relatedEntityId: receiptId },
      })
    } catch {
      /* ignore */
    }
    return { buffer, asset: toPublic(doc) }
  }

  const ensureRefundPdf = async (
    tenantId: string,
    actorId: string,
    refundId: string,
    opts?: { forceRegenerate?: boolean },
  ): Promise<{ buffer: Buffer; asset: FileAssetPublic }> => {
    let existing = await findActive(tenantId, "Refund", refundId, "refund_note_pdf")
    if (existing && opts?.forceRegenerate) {
      await softDeleteAsset(existing)
      existing = null
    }
    if (existing) {
      const onDisk = await storage.exists(existing.relativePath)
      if (onDisk) {
        const buffer = await storage.readFile(existing.relativePath)
        return { buffer, asset: toPublic(existing) }
      }
      await softDeleteAsset(existing)
    }
    const buffer = await documentPdfService.refundPdfBuffer(tenantId, refundId)
    const ref = await RefundModel.findOne({
      _id: new mongoose.Types.ObjectId(refundId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    })
    const num = ref?.refundNumber ?? refundId
    const originalFileName = `refund-${String(num).replace(/[^\w.-]+/g, "_")}.pdf`
    let doc: FileAssetDoc
    try {
      doc = await persistNewAsset({
        tenantId,
        actorId,
        documentType: "refund_note_pdf",
        relatedEntityType: "Refund",
        relatedEntityId: refundId,
        module: "documents",
        folder: "refunds",
        buffer,
        originalFileName,
        mimeType: "application/pdf",
        extension: "pdf",
        storageProviderId: storage.providerId,
      })
    } catch (e) {
      if (isDupKey(e)) {
        const again = await findActive(tenantId, "Refund", refundId, "refund_note_pdf")
        if (again && (await storage.exists(again.relativePath))) {
          const b = await storage.readFile(again.relativePath)
          return { buffer: b, asset: toPublic(again) }
        }
      }
      throw e
    }
    try {
      await auditService.log({
        tenantId,
        actorId,
        action: "document.generated",
        entity: "FileAsset",
        entityId: doc._id.toString(),
        metadata: { documentType: "refund_note_pdf", relatedEntityId: refundId },
      })
    } catch {
      /* ignore */
    }
    return { buffer, asset: toPublic(doc) }
  }

  const getByIdForTenant = async (tenantId: string, fileId: string): Promise<FileAssetDoc | null> => {
    if (!mongoose.Types.ObjectId.isValid(fileId)) return null
    return FileAssetModel.findOne({
      _id: new mongoose.Types.ObjectId(fileId),
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: "active",
    })
  }

  const getMetadata = async (tenantId: string, fileId: string): Promise<FileAssetPublic | null> => {
    const doc = await getByIdForTenant(tenantId, fileId)
    return doc ? toPublic(doc) : null
  }

  const createReadStreamForAsset = async (tenantId: string, fileId: string): Promise<Readable | null> => {
    const doc = await getByIdForTenant(tenantId, fileId)
    if (!doc) return null
    if (!(await storage.exists(doc.relativePath))) return null
    return storage.createReadStream(doc.relativePath)
  }

  const readBufferForAsset = async (tenantId: string, fileId: string): Promise<Buffer | null> => {
    const doc = await getByIdForTenant(tenantId, fileId)
    if (!doc) return null
    if (!(await storage.exists(doc.relativePath))) return null
    return storage.readFile(doc.relativePath)
  }

  const logDownload = async (tenantId: string, actorId: string, fileId: string, documentType: string): Promise<void> => {
    try {
      await auditService.log({
        tenantId,
        actorId,
        action: "document.downloaded",
        entity: "FileAsset",
        entityId: fileId,
        metadata: { documentType },
      })
    } catch {
      /* ignore */
    }
  }

  /** Placeholder: soft-delete + optional future version bump */
  const replaceDocumentVersionPlaceholder = async (_tenantId: string, _fileId: string): Promise<never> => {
    const err = new Error("Document version replace is not implemented — use regenerate on entity PDF endpoints")
    ;(err as Error & { statusCode?: number }).statusCode = 501
    throw err
  }

  const invalidateInvoicePdfAssets = async (tenantId: string, invoiceId: string): Promise<void> => {
    const docs = await FileAssetModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      relatedEntityType: "Invoice",
      relatedEntityId: new mongoose.Types.ObjectId(invoiceId),
      documentType: "invoice_pdf",
      status: "active",
    })
    for (const doc of docs) {
      await softDeleteAsset(doc)
    }
  }

  const deleteDocumentSoftPlaceholder = async (tenantId: string, fileId: string, actorId: string): Promise<boolean> => {
    const doc = await getByIdForTenant(tenantId, fileId)
    if (!doc) return false
    await softDeleteAsset(doc)
    try {
      await auditService.log({
        tenantId,
        actorId,
        action: "document.soft_deleted",
        entity: "FileAsset",
        entityId: fileId,
      })
    } catch {
      /* ignore */
    }
    return true
  }

  return {
    ensureInvoicePdf,
    ensureReceiptPdf,
    ensureRefundPdf,
    getMetadata,
    createReadStreamForAsset,
    readBufferForAsset,
    logDownload,
    replaceDocumentVersionPlaceholder,
    deleteDocumentSoftPlaceholder,
    invalidateInvoicePdfAssets,
    toPublic,
    getByIdForTenant,
  }
}

export type StoredDocumentService = ReturnType<typeof createStoredDocumentService>
