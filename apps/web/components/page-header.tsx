"use client"

import { Separator, cn } from "@repo/ui"
import type { ReactNode } from "react"

/**
 * Consistent page title band for dashboard modules (shadcn-only layout).
 */
export const PageHeader = ({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) => {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{title}</h1>
        {description ? <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-[0.9375rem]">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}

export const PageHeaderRule = ({ className }: { className?: string }) => (
  <Separator className={cn("my-2 bg-border/60", className)} />
)
