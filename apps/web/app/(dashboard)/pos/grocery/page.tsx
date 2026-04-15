"use client"

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui"
import Link from "next/link"
import { PageHeader, PageHeaderRule } from "@/components/page-header"

export default function GroceryPosShellPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Grocery POS"
        description="High-throughput counter mode for weight, loose SKUs, and break-bulk — built on the shared billing engine."
        actions={
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/pos">Standard POS</Link>
          </Button>
        }
      />
      <PageHeaderRule />
      <Card className="max-w-2xl border-border/80 shadow-elevate-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">Grocery pack shell</CardTitle>
            <Badge variant="secondary">weight_break_bulk</Badge>
          </div>
          <CardDescription>
            This route is the grocery-specific POS entry point. Use standard POS for mixed carts until pack-specific flows are expanded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/pos">Open standard POS</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
