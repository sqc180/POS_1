"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
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
  Textarea,
} from "@repo/ui"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { apiRequest } from "@/lib/api"
import { optionalEmailSchema, partyFieldMeta, type PartyField } from "@/lib/directory-form-hints"
import { notifyError, notifySuccess } from "@/lib/notify"

type Supplier = {
  id: string
  name: string
  phone: string
  email: string
  gstin: string
  address: string
  notes: string
  status: string
}

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: optionalEmailSchema,
  gstin: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const INPUT_FIELDS: PartyField[] = ["name", "phone", "email", "gstin"]
const AREA_FIELDS: PartyField[] = ["address", "notes"]

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>()
  const [row, setRow] = useState<Supplier | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await apiRequest<Supplier>(`/suppliers/${params.id}`)
    if (res.success) {
      setRow(res.data)
      setLoadError(null)
    } else {
      setLoadError(res.error.message)
    }
  }, [params.id])

  useEffect(() => {
    void load()
  }, [load])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", email: undefined, gstin: "", address: "", notes: "" },
  })

  useEffect(() => {
    if (!row) return
    form.reset({
      name: row.name,
      phone: row.phone || "",
      email: row.email?.trim() ? row.email : undefined,
      gstin: row.gstin || "",
      address: row.address || "",
      notes: row.notes || "",
    })
  }, [row, form])

  const handleSave = form.handleSubmit(async (values) => {
    const res = await apiRequest<Supplier>(`/suppliers/${params.id}`, {
      method: "PATCH",
      body: JSON.stringify(values),
    })
    if (!res.success) {
      form.setError("root", { message: res.error.message })
      notifyError(res.error.message)
      return
    }
    setRow(res.data)
    notifySuccess("Supplier saved")
  })

  if (loadError && !row) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/suppliers">Back</Link>
        </Button>
        <Alert variant="destructive">
          <AlertTitle>Could not load supplier</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" size="sm" className="w-fit shrink-0" onClick={() => void load()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!row) return null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" asChild>
        <Link href="/suppliers">Back</Link>
      </Button>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>{row.name}</CardTitle>
            <CardDescription>Keep procurement contacts and tax IDs aligned with purchase documents.</CardDescription>
          </div>
          <Badge>{row.status}</Badge>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={handleSave} className="grid gap-4">
              {form.formState.errors.root ? (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
                </Alert>
              ) : null}
              {INPUT_FIELDS.map((name) => {
                const meta = partyFieldMeta(name, "supplier")
                return (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{meta.label}</FormLabel>
                        <FormControl>
                          <Input placeholder={meta.placeholder} {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormDescription>{meta.description}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )
              })}
              {AREA_FIELDS.map((name) => {
                const meta = partyFieldMeta(name, "supplier")
                return (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{meta.label}</FormLabel>
                        <FormControl>
                          <Textarea placeholder={meta.placeholder} className="min-h-[88px] resize-y" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormDescription>{meta.description}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )
              })}
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Save changes"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
