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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@repo/ui"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { apiRequest } from "@/lib/api"
import { notifyError } from "@/lib/notify"

type GatewayDto = {
  provider: "noop" | "razorpay"
  razorpayKeyId: string
  upiVpa: string
  secretHint: string
  updatedAt: string
}

const schema = z.object({
  provider: z.enum(["noop", "razorpay"]),
  razorpayKeyId: z.string(),
  upiVpa: z.string(),
})

const GatewayFormSkeleton = () => (
  <div className="space-y-4">
    {Array.from({ length: 3 }, (_, i) => (
      <div key={i} className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    ))}
    <Skeleton className="h-9 w-24 rounded-md" />
  </div>
)

export default function GatewaySettingsPage() {
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { provider: "noop", razorpayKeyId: "", upiVpa: "" },
  })

  const load = useCallback(async () => {
    setLoadError(null)
    const res = await apiRequest<GatewayDto>("/settings/gateway")
    if (res.success) {
      form.reset({
        provider: res.data.provider,
        razorpayKeyId: res.data.razorpayKeyId ?? "",
        upiVpa: res.data.upiVpa ?? "",
      })
      setLoaded(true)
    } else {
      setLoaded(true)
      setLoadError(res.error.message)
      notifyError(res.error.message)
    }
  }, [form])

  useEffect(() => {
    void load()
  }, [load])

  const onSubmit = form.handleSubmit(async (values) => {
    const res = await apiRequest<GatewayDto>("/settings/gateway", {
      method: "PATCH",
      body: JSON.stringify(values),
    })
    if (res.success) {
      form.reset({
        provider: res.data.provider,
        razorpayKeyId: res.data.razorpayKeyId ?? "",
        upiVpa: res.data.upiVpa ?? "",
      })
    }
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Payment gateway</h1>
        <p className="text-sm text-muted-foreground">Owner/admin. Key secret and webhook secret stay in server environment.</p>
      </div>

      {loadError ? (
        <Alert variant="destructive" className="border-destructive/40 shadow-elevate-sm">
          <AlertTitle>Could not load gateway settings</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-destructive/90">{loadError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-destructive/30 sm:w-auto"
              onClick={() => void load()}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!loaded && !loadError ? (
            <GatewayFormSkeleton />
          ) : loadError ? (
            <p className="text-sm text-muted-foreground">Fix the error above to edit gateway settings.</p>
          ) : (
            <Form {...form}>
              <form onSubmit={onSubmit} className="space-y-4">
                <FormField
                  control={form.control}
                  name="provider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provider</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Provider" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="noop">Noop (offline / dev)</SelectItem>
                          <SelectItem value="razorpay">Razorpay</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="razorpayKeyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Razorpay key ID (public)</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="off" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="upiVpa"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>UPI VPA (fallback QR when Razorpay order unavailable)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="merchant@upi" autoComplete="off" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit">Save</Button>
              </form>
            </Form>
          )}
          <Alert>
            <AlertTitle>Environment</AlertTitle>
            <AlertDescription>
              Set <code className="text-xs">RAZORPAY_KEY_ID</code>, <code className="text-xs">RAZORPAY_KEY_SECRET</code>, and{" "}
              <code className="text-xs">RAZORPAY_WEBHOOK_SECRET</code> on the API server for live Razorpay and webhook verification.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
