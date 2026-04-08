"use client"

import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Label,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui"
import { cn } from "@repo/ui"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { DEFAULT_MODULE_HELP, MODULE_HELP, QUICK_START_STEPS } from "@/lib/guide-content"

export default function SettingsGuidePage() {
  const { me } = useAuth()
  const businessType = me?.tenant.businessType ?? "retail"
  const isSupermart = businessType === "supermart"

  const theme = isSupermart
    ? {
        hero: "border-2 border-foreground/20 bg-gradient-to-br from-muted/80 via-card to-background shadow-sm ring-2 ring-foreground/10",
        accent: "font-semibold text-foreground",
        badge: "border-2 border-foreground/35 bg-foreground/[0.06] text-foreground",
        ring: "ring-foreground/12",
        stepCircle: "border-2 border-foreground bg-background text-foreground",
      }
    : {
        hero: "border border-border bg-gradient-to-br from-muted/50 via-card to-card ring-1 ring-border",
        accent: "text-foreground",
        badge: "border border-border bg-muted text-foreground",
        ring: "ring-border/60",
        stepCircle: "bg-foreground text-background",
      }

  const menuItems = me?.menu ?? []

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1 h-8 px-2" asChild>
            <Link href="/settings">← Business settings</Link>
          </Button>
          <h1 className="text-3xl font-semibold tracking-tight">Guide & samples</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            What each area does, how to run a first sale, and a compact UI reference — same design system you use everywhere.
          </p>
        </div>
        <Badge variant="outline" className={cn("shrink-0 self-start px-3 py-1 text-xs font-medium uppercase tracking-wide", theme.badge)}>
          {businessType === "supermart" ? "Supermart workspace" : "Retail workspace"}
        </Badge>
      </div>

      <Card className={cn("overflow-hidden border-2 shadow-md ring-2", theme.hero, theme.ring)}>
        <CardHeader className="pb-2">
          <CardTitle className={cn("text-lg", theme.accent)}>Welcome to your console</CardTitle>
          <CardDescription>
            Layout, spacing, and components here match the rest of the app. Retail vs supermart uses border weight and contrast
            only — same monochrome system everywhere.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {QUICK_START_STEPS.map((step, i) => (
            <div key={step.title} className="rounded-lg border bg-background/80 p-4 shadow-sm backdrop-blur-sm">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    theme.stepCircle,
                  )}
                >
                  {i + 1}
                </span>
                <span className="font-medium">{step.title}</span>
              </div>
              <p className="text-sm text-muted-foreground">{step.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Tabs defaultValue="modules" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="modules">Your modules</TabsTrigger>
          <TabsTrigger value="samples">UI samples</TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="mt-6 space-y-4">
          <Alert>
            <AlertDescription>
              Below lists only routes you can open with your current role. Use <strong>Go to module</strong> to jump in.
            </AlertDescription>
          </Alert>
          <div className="grid gap-4 md:grid-cols-2">
            {menuItems.map((item) => {
              const help = MODULE_HELP[item.id] ?? DEFAULT_MODULE_HELP
              return (
                <Card key={item.id} className="flex flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{item.label}</CardTitle>
                      <Badge variant="secondary" className="shrink-0 font-mono text-[10px] uppercase">
                        {item.id}
                      </Badge>
                    </div>
                    <CardDescription className="text-sm leading-relaxed">{help.summary}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto flex flex-1 flex-col gap-3">
                    <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
                      {help.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                    <Button size="sm" variant="secondary" className="w-full sm:w-auto" asChild>
                      <Link href={item.href}>Go to module</Link>
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="samples" className="mt-6 space-y-6">
          <p className="text-sm text-muted-foreground">
            Static examples — not live data. Use them to recognize patterns (tables, badges, alerts) across the product.
          </p>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sample cart line</CardTitle>
              <CardDescription>POS and invoices use the same table density and typography.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Line total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>
                      <div className="font-medium">Demo malt drink 500ml</div>
                      <div className="text-xs text-muted-foreground">SKU-DEMO-01 · 5% GST</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">2</TableCell>
                    <TableCell className="text-right tabular-nums">₹45.00</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">₹94.50</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status badges</CardTitle>
              <CardDescription>Common states in lists and detail headers.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge>Draft</Badge>
              <Badge variant="secondary">Pending</Badge>
              <Badge variant="outline">Completed</Badge>
              <Badge className="bg-primary text-primary-foreground">Paid</Badge>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Alert>
              <AlertDescription>Neutral notice — settings saved, or background information.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertDescription>Destructive — validation errors or blocked actions from the API.</AlertDescription>
            </Alert>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Form row pattern</CardTitle>
              <CardDescription>Checkbox + label + helper text (same as Business settings).</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-row items-start gap-3 rounded-lg border p-4">
                <Checkbox checked disabled className="mt-0.5" aria-hidden />
                <div className="space-y-1 leading-none">
                  <Label className="text-sm font-medium">Sample option</Label>
                  <p className="text-xs text-muted-foreground">Helper copy sits under the label for clarity without cluttering the form.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator />

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="default">
              <Link href="/pos">Open POS</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/invoices">Invoices</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/settings/gateway">Gateway</Link>
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
