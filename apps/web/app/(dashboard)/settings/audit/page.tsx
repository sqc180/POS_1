"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui"
import type { AuditLogEntryDTO } from "@repo/types"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/components/auth-provider"
import { apiRequest } from "@/lib/api"
import { notifyError } from "@/lib/notify"

const formatMeta = (m: Record<string, unknown> | null): string => {
  if (!m || Object.keys(m).length === 0) return "—"
  try {
    return JSON.stringify(m)
  } catch {
    return "—"
  }
}

const AUDIT_SKELETON_ROWS = 8

const AuditTableSkeleton = () => (
  <div className="rounded-md border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[180px]">When</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Entity</TableHead>
          <TableHead className="hidden md:table-cell">Entity id</TableHead>
          <TableHead className="hidden lg:table-cell">Actor</TableHead>
          <TableHead className="hidden xl:table-cell">Metadata</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: AUDIT_SKELETON_ROWS }, (_, i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton className="h-4 w-28" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-6 w-24 rounded-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-20" />
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <Skeleton className="h-4 w-24" />
            </TableCell>
            <TableCell className="hidden lg:table-cell">
              <Skeleton className="h-4 w-20" />
            </TableCell>
            <TableCell className="hidden xl:table-cell">
              <Skeleton className="h-4 w-32" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
)

export default function AuditLogPage() {
  const { me } = useAuth()
  const [rows, setRows] = useState<AuditLogEntryDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const canView = Boolean(me?.permissions.includes("audit.view"))

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    const res = await apiRequest<AuditLogEntryDTO[]>("/audit-logs?limit=100")
    if (!res.success) {
      notifyError(res.error.message)
      setRows([])
      setLoadError(res.error.message)
    } else {
      setRows(res.data)
    }
    setLoading(false)
  }, [canView])

  useEffect(() => {
    void load()
  }, [load])

  if (!canView) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <Alert variant="destructive">
          <AlertTitle>Access denied</AlertTitle>
          <AlertDescription>You don&apos;t have permission to view audit events.</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link href="/settings">Back to settings</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">
            Immutable trail of sensitive actions (tenant-scoped). Newest first.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings">Business settings</Link>
          </Button>
          <Button size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {loadError && !loading ? (
        <Alert variant="destructive" className="border-destructive/40 shadow-elevate-sm">
          <AlertTitle>Could not load audit log</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-destructive/90">{loadError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-destructive/30 sm:w-auto"
              onClick={() => void load()}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Alert className="border-primary/25 bg-primary/5">
        <AlertDescription className="text-sm">
          Actor IDs reference users in your workspace. Metadata is stored as structured JSON for investigations — never includes raw passwords.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent events</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <AuditTableSkeleton />
          ) : loadError ? (
            <p className="text-sm text-muted-foreground">Resolve the error above, then retry.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit entries yet. Actions will appear as you use the system.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead className="hidden md:table-cell">Entity id</TableHead>
                    <TableHead className="hidden lg:table-cell">Actor</TableHead>
                    <TableHead className="hidden xl:table-cell">Metadata</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {r.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{r.entity}</TableCell>
                      <TableCell className="hidden font-mono text-xs md:table-cell">{r.entityId ?? "—"}</TableCell>
                      <TableCell className="hidden font-mono text-xs lg:table-cell">{r.actorId}</TableCell>
                      <TableCell className="hidden max-w-xs truncate text-xs text-muted-foreground xl:table-cell" title={formatMeta(r.metadata)}>
                        {formatMeta(r.metadata)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
