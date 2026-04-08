"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@repo/ui"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { apiRequest } from "@/lib/api"
import { optionalEmailSchema, partyFieldMeta, type PartyField } from "@/lib/directory-form-hints"
import { notifyError, notifySuccess } from "@/lib/notify"

type Row = { id: string; name: string; phone: string; status: string }

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

const defaultForm: FormValues = { name: "", phone: "", email: undefined, gstin: "", address: "", notes: "" }

export default function SuppliersPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [open, setOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultForm,
  })

  const load = useCallback(async () => {
    const res = await apiRequest<Row[]>("/suppliers")
    if (res.success) {
      setRows(res.data)
      setLoadError(null)
    } else {
      setLoadError(res.error.message)
      notifyError(res.error.message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      form.reset(defaultForm)
      form.clearErrors("root")
    }
  }

  const handleCreate = form.handleSubmit(async (values) => {
    const res = await apiRequest<Row>("/suppliers", { method: "POST", body: JSON.stringify(values) })
    if (!res.success) {
      form.setError("root", { message: res.error.message })
      notifyError(res.error.message)
      return
    }
    setOpen(false)
    form.reset(defaultForm)
    notifySuccess("Supplier created")
    await load()
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Suppliers</h1>
          <p className="text-sm text-muted-foreground">Purchase-ready master data with GST placeholders.</p>
        </div>
        <Button onClick={() => handleOpenChange(true)}>New supplier</Button>
      </div>
      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load suppliers</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" size="sm" className="w-fit shrink-0" onClick={() => void load()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent className="flex flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New supplier</SheetTitle>
            <SheetDescription>
              Record vendors for procurement and GRN. GSTIN helps match purchase tax with your catalog slabs.
            </SheetDescription>
          </SheetHeader>
          <Form {...form}>
            <form onSubmit={handleCreate} className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
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
              <SheetFooter className="mt-auto gap-2 sm:justify-end">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Creating…" : "Create"}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.phone || "—"}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" aria-label={`Actions for ${s.name}`}>
                        Actions
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Supplier</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href={`/suppliers/${s.id}`}>View details</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          void navigator.clipboard.writeText(s.id).then(() => notifySuccess("ID copied to clipboard"))
                        }}
                      >
                        Copy supplier ID
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
