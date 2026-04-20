import { Suspense } from "react"

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading POS…</div>}>{children}</Suspense>
}
