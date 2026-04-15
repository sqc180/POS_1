"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { FUTURE_BUSINESS_TYPE_ROADMAP, isPilotVerticalSlug } from "@repo/business-type-engine"
import { useAuth } from "@/components/auth-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { apiRequest } from "@/lib/api"
import { notifyError } from "@/lib/notify"

const parsePackIdsCsv = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)

const schema = z.object({
  businessName: z.string().min(1),
  businessType: z.enum(["retail", "supermart"]),
  industryVertical: z.string().max(64).optional(),
  extraPackIdsCsv: z.string().optional(),
  ownerName: z.string().min(1),
  ownerEmail: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().email()),
  ownerPassword: z.string().min(8),
})

type FormValues = z.infer<typeof schema>

export default function OnboardingPage() {
  const { login } = useAuth()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      businessName: "",
      businessType: "retail",
      industryVertical: "__none__",
      extraPackIdsCsv: "",
      ownerName: "",
      ownerEmail: "",
      ownerPassword: "",
    },
  })

  const handleSubmit = form.handleSubmit(async (values) => {
    setError(null)
    const email = String(values.ownerEmail)
      .trim()
      .toLowerCase()
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
    const pilotRaw = values.industryVertical === "__none__" ? undefined : values.industryVertical?.trim()
    if (pilotRaw && !isPilotVerticalSlug(pilotRaw)) {
      setError("Invalid industry vertical")
      notifyError("Invalid industry vertical")
      return
    }
    const extraIds = parsePackIdsCsv(values.extraPackIdsCsv)
    for (const id of extraIds) {
      if (!isPilotVerticalSlug(id)) {
        setError(`Invalid pack id: ${id}`)
        notifyError(`Invalid pack id: ${id}`)
        return
      }
    }
    const res = await apiRequest<{ token: string; tenantId?: string; userId?: string }>("/auth/onboarding", {
      method: "POST",
      body: JSON.stringify({
        businessName: values.businessName,
        businessType: values.businessType,
        ownerName: values.ownerName,
        ownerEmail: email,
        ownerPassword: String(values.ownerPassword).trim(),
        pilotVertical: pilotRaw ?? null,
        enabledPackIds: extraIds.length > 0 ? extraIds : undefined,
      }),
      skipAuth: true,
    })
    if (!res.success) {
      setError(res.error.message)
      notifyError(res.error.message)
      return
    }
    const token =
      typeof res.data === "object" && res.data !== null && "token" in res.data && typeof (res.data as { token: unknown }).token === "string"
        ? (res.data as { token: string }).token
        : ""
    if (!token) {
      const m = "Server did not return a sign-in token. Try signing in manually."
      setError(m)
      notifyError(m)
      return
    }
    await login(token)
  })

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-muted/50 via-background to-primary/[0.04] p-4 dark:from-muted/15 dark:via-background dark:to-primary/[0.06]">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-lg rounded-xl border border-border/80 shadow-elevate ring-1 ring-border/40">
        <CardHeader>
          <CardTitle className="text-2xl">Business setup</CardTitle>
          <p className="text-sm text-muted-foreground">Create your tenant, owner account, and default GST slabs.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not complete setup</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Form {...form}>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="businessName"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Business name</FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Stores" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="businessType"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Business type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="retail">Retail</SelectItem>
                        <SelectItem value="supermart">Supermart</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Core billing and feature map (retail vs supermart). Industry-specific POS and inventory rules use the industry vertical
                      below.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="industryVertical"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Industry vertical (optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? "__none__"}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="None — configure later in Settings" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">None — I will set this later</SelectItem>
                        {FUTURE_BUSINESS_TYPE_ROADMAP.map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            {row.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Sets your tenant&apos;s capability flags from day one (pharmacy, grocery, wholesale, etc.). You can change this anytime in
                      Settings.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="extraPackIdsCsv"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Extra capability packs (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. wholesale, multi_branch"
                        className="font-mono text-sm"
                        autoComplete="off"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription>Comma-separated pack ids to merge with your primary vertical — advanced mixed setups.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ownerName"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Your name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ownerEmail"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Owner email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ownerPassword"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Password (min 8)</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="sm:col-span-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" asChild>
                  <Link href="/login">Back to login</Link>
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Creating…" : "Create business"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
