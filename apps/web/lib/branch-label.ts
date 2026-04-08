/** Row shape from GET /branches (code is what inventory rows store as branchId). */
export type BranchDirectoryRow = { code: string; name: string; status?: string }

export function branchLabelMap(rows: readonly BranchDirectoryRow[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const r of rows) {
    const label = r.status === "inactive" ? `${r.name} (inactive)` : r.name
    m.set(r.code, label)
  }
  return m
}

/** Human-readable branch label; pass label map from GET /branches when available. */
export function formatBranchLabel(branchId: string, labels?: ReadonlyMap<string, string>): string {
  const fromApi = labels?.get(branchId)
  if (fromApi) return fromApi
  if (branchId === "main") return "Main branch"
  const t = branchId.trim()
  if (!t) return "—"
  return t
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}
