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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from "@repo/ui"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { useAuth } from "@/components/auth-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { apiRequest } from "@/lib/api"
import { notifyError } from "@/lib/notify"
import { clearLastTenantId, getLastTenantId, getToken, isLikelyMongoObjectId } from "@/lib/auth-storage"

const schema = z.object({
  email: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().email("Enter a valid email")),
  password: z.string().min(1, "Password is required"),
  workspaceId: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s === "" || isLikelyMongoObjectId(s), {
      message: "Workspace ID must be 24 hex characters (copy from Business settings)",
    }),
})

type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [showSignInHints, setShowSignInHints] = useState(false)
  const [useLastWorkspace, setUseLastWorkspace] = useState(false)
  const [showWorkspaceField, setShowWorkspaceField] = useState(false)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", workspaceId: "" },
  })

  useEffect(() => {
    if (getToken()) router.replace("/dashboard")
  }, [router])

  useEffect(() => {
    setUseLastWorkspace(Boolean(getLastTenantId()))
  }, [])

  const handleDifferentWorkspace = () => {
    clearLastTenantId()
    setUseLastWorkspace(false)
  }

  const handleToggleWorkspaceField = () => {
    setShowWorkspaceField((open) => {
      if (open) form.setValue("workspaceId", "")
      return !open
    })
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    setError(null)
    setShowSignInHints(false)
    const email = String(values.email)
      .trim()
      .toLowerCase()
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
    const password = String(values.password).replace(/[\u200B-\u200D\uFEFF]/g, "")

    const manualRaw = showWorkspaceField ? values.workspaceId.trim() : ""
    const manualOk = manualRaw && isLikelyMongoObjectId(manualRaw) ? manualRaw : null
    const lastId = useLastWorkspace ? getLastTenantId() : null
    const lastOk = lastId && isLikelyMongoObjectId(lastId) ? lastId : null
    const tenantOk = manualOk ?? lastOk

    const body =
      tenantOk !== null
        ? { email, password, tenantId: tenantOk }
        : { email, password }

    const res = await apiRequest<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
      skipAuth: true,
    })

    if (!res.success) {
      const hint =
        res.error.code === "network_error"
          ? " Check that the API is running and NEXT_PUBLIC_API_BASE_URL (or NEXT_PUBLIC_API_URL) in .env matches its URL."
          : ""
      setError(`${res.error.message}${hint}`)
      setShowSignInHints(res.error.code === "invalid_credentials")
      notifyError(res.error.message)
      return
    }
    await login(res.data.token)
  })

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-muted/50 via-background to-primary/[0.04] p-4 dark:from-muted/15 dark:via-background dark:to-primary/[0.06]">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md rounded-xl border border-border/80 shadow-elevate ring-1 ring-border/40">
        <CardHeader>
          <CardTitle className="text-2xl">Sign in</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {useLastWorkspace ? (
            <Alert>
              <AlertTitle>Last workspace</AlertTitle>
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground">
                  We&apos;ll try this email against your most recent business first (helps when you use the same address on multiple tenants).
                </span>
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={handleDifferentWorkspace}>
                  Different workspace
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{error}</p>
                {showSignInHints ? (
                  <ul className="list-disc space-y-1 pl-4 text-sm text-destructive/95">
                    <li>Use the exact email stored for that user (typos and dots in Gmail addresses matter).</li>
                    <li>
                      If you use one email on more than one business: click <strong>Different workspace</strong> or paste the
                      24-character workspace ID from <strong>Settings → Workspace ID</strong> (owner/admin).
                    </li>
                    <li>Invited users must use the password an owner/admin set; ask them to reset it if unsure.</li>
                    <li>Accounts set to <strong>Inactive</strong> in Users cannot sign in.</li>
                    <li>Confirm the API uses the same database as where the user was created (<code className="rounded bg-background/60 px-1">MONGODB_URI</code>).</li>
                  </ul>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          <Form {...form}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-sm text-muted-foreground underline-offset-4 hover:text-foreground"
                  onClick={handleToggleWorkspaceField}
                >
                  {showWorkspaceField ? "Hide workspace ID" : "Sign in to a specific workspace"}
                </Button>
                {showWorkspaceField ? (
                  <FormField
                    control={form.control}
                    name="workspaceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Workspace ID</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="Paste from Business settings"
                            {...field}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Overrides “last workspace” for this sign-in. Same email on multiple businesses? Use this or clear last workspace above.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </div>
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </Form>
          <p className="text-center text-sm text-muted-foreground">
            New business?{" "}
            <Link href="/onboarding" className="font-medium text-primary underline-offset-4 hover:underline">
              Create tenant
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
