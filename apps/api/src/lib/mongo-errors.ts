/** Walks Mongoose / driver error chains (e.g. `cause`) for duplicate key violations. */
export function isMongoDuplicateKeyError(e: unknown): boolean {
  const visited = new Set<unknown>()
  let cur: unknown = e
  for (let depth = 0; depth < 8 && cur && typeof cur === "object"; depth++) {
    if (visited.has(cur)) break
    visited.add(cur)
    const code = "code" in cur && typeof (cur as { code: unknown }).code === "number" ? (cur as { code: number }).code : undefined
    if (code === 11000) return true
    if (cur instanceof Error && cur.message.includes("E11000")) return true
    const next = "cause" in cur ? (cur as { cause: unknown }).cause : undefined
    cur = next
  }
  return false
}
