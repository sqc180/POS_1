"use client"

import { Alert, AlertDescription, AlertTitle } from "@repo/ui"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { cn } from "@repo/ui"
import { getModuleHint } from "@/lib/module-hints"

export const ModuleHintBanner = () => {
  const pathname = usePathname()
  const { me } = useAuth()
  const hint = getModuleHint(pathname)
  if (!hint) return null

  const isSupermart = me?.tenant.businessType === "supermart"

  return (
    <Alert
      className={cn(
        "rounded-xl border border-dashed bg-card/60 shadow-elevate-sm backdrop-blur-sm dark:bg-card/40",
        isSupermart ? "border-primary/25 dark:border-primary/30" : "border-border/80",
      )}
      role="region"
      aria-label="Tips for this page"
    >
      <AlertTitle className="text-sm font-semibold tracking-tight">{hint.title} — quick tips</AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        <ul className="list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
          {hint.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          <Link href="/settings/guide" className="font-medium text-foreground underline-offset-4 hover:underline">
            Full guide & UI samples
          </Link>
        </p>
      </AlertDescription>
    </Alert>
  )
}
