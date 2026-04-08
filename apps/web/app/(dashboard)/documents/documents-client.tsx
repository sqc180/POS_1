"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui"
import type { FileAssetDocumentType, FileAssetPublic } from "@repo/types"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { apiBlob, apiRequest } from "@/lib/api"
import { notifyError } from "@/lib/notify"

const entityDocType = (type: string): FileAssetDocumentType | null => {
  if (type === "invoice") return "invoice_pdf"
  if (type === "receipt") return "receipt_pdf"
  if (type === "refund") return "refund_note_pdf"
  return null
}

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export const DocumentsClient = () => {
  const searchParams = useSearchParams()
  const type = searchParams.get("type") ?? "invoice"
  const id = searchParams.get("id") ?? ""
  const [open, setOpen] = useState(false)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [meta, setMeta] = useState<FileAssetPublic | null>(null)
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(false)

  const loadPdf = useCallback(async () => {
    const dt = entityDocType(type)
    if (!dt || !id.trim()) {
      setErr("")
      setMeta(null)
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return
    }
    setLoading(true)
    setErr("")
    const ensured = await apiRequest<FileAssetPublic>(`/documents/ensure?documentType=${dt}&relatedEntityId=${encodeURIComponent(id)}`)
    if (!ensured.success) {
      setLoading(false)
      setErr(ensured.error.message)
      notifyError(ensured.error.message)
      setMeta(null)
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return
    }
    setMeta(ensured.data)
    const r = await apiBlob(`/documents/files/${ensured.data.id}/preview`)
    setLoading(false)
    if (!r.ok) {
      setErr(r.error.message)
      notifyError(r.error.message)
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return
    }
    const url = URL.createObjectURL(r.blob)
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
    setOpen(true)
  }, [type, id])

  useEffect(() => {
    if (!id.trim()) return
    void loadPdf()
  }, [id, type, loadPdf])

  const handleDownload = async () => {
    if (!meta) return
    const r = await apiBlob(`/documents/files/${meta.id}/download`)
    if (!r.ok) {
      setErr(r.error.message)
      notifyError(r.error.message)
      return
    }
    const url = URL.createObjectURL(r.blob)
    const a = document.createElement("a")
    a.href = url
    a.download = meta.originalFileName || `${type}-${id}.pdf`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground">
          Open stored PDFs via <code className="text-xs">?type=invoice|receipt|refund&id=…</code>. Files are served only through authenticated
          API routes — no raw disk paths are exposed.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>PDF stream from secure storage (inline preview).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Current: type={type || "—"}, id={id || "—"}
            </p>
            {err ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{err}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => void loadPdf()} disabled={!id || loading}>
                {loading ? "Loading…" : "Reload PDF"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void handleDownload()} disabled={!meta}>
                Download
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={!objectUrl}>
                Open sheet
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">File metadata</CardTitle>
            <CardDescription>Stored asset record (tenant-scoped).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {meta ? (
              <ul className="space-y-1.5 text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Type</span> {meta.documentType}
                </li>
                <li>
                  <span className="font-medium text-foreground">Original name</span> {meta.originalFileName}
                </li>
                <li>
                  <span className="font-medium text-foreground">Size</span> {formatBytes(meta.fileSize)}
                </li>
                <li className="break-all">
                  <span className="font-medium text-foreground">SHA-256</span> {meta.checksumSha256 ? `${meta.checksumSha256.slice(0, 16)}…` : "—"}
                </li>
                <li>
                  <span className="font-medium text-foreground">Storage</span> {meta.storageProvider}
                </li>
                <Separator className="my-2" />
                <li className="break-all text-xs">
                  <span className="font-medium text-foreground">Asset id</span> {meta.id}
                </li>
              </ul>
            ) : (
              <p className="text-muted-foreground">Load a document to see metadata.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <SheetHeader className="border-b px-6 py-4 text-left">
            <SheetTitle>Document preview</SheetTitle>
            <SheetDescription>PDF from secure backend storage (not a public folder).</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 p-4">
            {objectUrl ? (
              <iframe title="PDF preview" src={objectUrl} className="h-[calc(100vh-8rem)] w-full rounded-md border bg-muted" />
            ) : (
              <p className="text-sm text-muted-foreground">No PDF loaded.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
