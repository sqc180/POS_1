"use client"

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui"
import Link from "next/link"
import { PageHeader, PageHeaderRule } from "@/components/page-header"

export default function PharmacyPosShellPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Pharmacy POS"
        description="Batch, expiry, and FEFO-aware selling — uses the same invoice completion path with pharmacy capability gates."
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
            <CardTitle className="text-lg">Pharmacy pack shell</CardTitle>
            <Badge variant="secondary">batch_expiry</Badge>
            <Badge variant="outline">rx_schedule_h</Badge>
          </div>
          <CardDescription>
            Prescription attach points and controlled-sale prompts will layer here; stock receive enforces expiry when this pack is active.
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
