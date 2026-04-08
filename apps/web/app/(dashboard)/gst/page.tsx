"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
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
} from "@repo/ui"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { apiRequest } from "@/lib/api"
import { notifyError, notifySuccess } from "@/lib/notify"

type Slab = {
  id: string
  name: string
  cgstRate: number
  sgstRate: number
  igstRate: number
  status: string
}

const schema = z.object({
  name: z.string().min(1),
  cgstRate: z.coerce.number().min(0).max(100),
  sgstRate: z.coerce.number().min(0).max(100),
  igstRate: z.coerce.number().min(0).max(100),
})

type FormValues = z.infer<typeof schema>

const defaultForm: FormValues = { name: "", cgstRate: 0, sgstRate: 0, igstRate: 0 }

export default function GstPage() {
  const [rows, setRows] = useState<Slab[]>([])
  const [open, setOpen] = useState(false)
  const [editSlab, setEditSlab] = useState<Slab | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultForm,
  })

  const load = useCallback(async () => {
    const res = await apiRequest<Slab[]>("/gst-slabs")
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
    if (!next) {
      setEditSlab(null)
      form.reset(defaultForm)
      form.clearErrors("root")
    }
  }

  useEffect(() => {
    if (!open) return
    if (editSlab) {
      form.reset({
        name: editSlab.name,
        cgstRate: editSlab.cgstRate,
        sgstRate: editSlab.sgstRate,
        igstRate: editSlab.igstRate,
      })
    } else {
      form.reset(defaultForm)
    }
  }, [open, editSlab, form])

  const openCreate = () => {
    setEditSlab(null)
    setOpen(true)
  }

  const openEdit = (s: Slab) => {
    setEditSlab(s)
    setOpen(true)
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    if (editSlab) {
      const res = await apiRequest<Slab>(`/gst-slabs/${editSlab.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: values.name,
          cgstRate: values.cgstRate,
          sgstRate: values.sgstRate,
          igstRate: values.igstRate,
        }),
      })
      if (!res.success) {
        form.setError("root", { message: res.error.message })
        notifyError(res.error.message)
        return
      }
      notifySuccess("GST slab updated")
    } else {
      const res = await apiRequest<Slab>("/gst-slabs", { method: "POST", body: JSON.stringify(values) })
      if (!res.success) {
        form.setError("root", { message: res.error.message })
        notifyError(res.error.message)
        return
      }
      notifySuccess("GST slab created")
    }
    handleOpenChange(false)
    await load()
  })

  const patchStatus = async (s: Slab, status: "active" | "inactive") => {
    const res = await apiRequest<Slab>(`/gst-slabs/${s.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    })
    if (!res.success) {
      notifyError(res.error.message)
      return
    }
    notifySuccess(status === "active" ? "Slab activated" : "Slab deactivated")
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">GST slabs</h1>
          <p className="text-sm text-muted-foreground">Define CGST, SGST, and IGST percentages used by products and tax lines.</p>
        </div>
        <Button type="button" onClick={openCreate}>
          New slab
        </Button>
      </div>
      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load GST slabs</AlertTitle>
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
            <SheetTitle>{editSlab ? "Edit GST slab" : "New GST slab"}</SheetTitle>
            <SheetDescription>
              Typical intra-state split: CGST + SGST = total GST (e.g. 9% + 9% = 18%). IGST is usually their sum for inter-state supply.
            </SheetDescription>
          </SheetHeader>
          <Form {...form}>
            <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
              {form.formState.errors.root ? (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
                </Alert>
              ) : null}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Label</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. "GST 18%" or "Exempt"' {...field} />
                    </FormControl>
                    <FormDescription>Shown when picking a slab on products and in tax breakdowns.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cgstRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CGST %</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="e.g. 9" {...field} />
                    </FormControl>
                    <FormDescription>Central GST component for intra-state sales.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sgstRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SGST %</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="e.g. 9" {...field} />
                    </FormControl>
                    <FormDescription>State GST component; often matches CGST for standard rates.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="igstRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IGST %</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="e.g. 18" {...field} />
                    </FormControl>
                    <FormDescription>Integrated GST for inter-state supply; commonly CGST + SGST.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <SheetFooter className="mt-auto gap-2 sm:justify-end">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Saving…" : editSlab ? "Save changes" : "Create"}
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
              <TableHead>CGST</TableHead>
              <TableHead>SGST</TableHead>
              <TableHead>IGST</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.cgstRate}%</TableCell>
                <TableCell>{s.sgstRate}%</TableCell>
                <TableCell>{s.igstRate}%</TableCell>
                <TableCell>
                  <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" aria-label={`Actions for ${s.name}`}>
                        Actions
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">GST slab</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => openEdit(s)}>Edit rates and label</DropdownMenuItem>
                      {s.status === "active" ? (
                        <DropdownMenuItem onClick={() => void patchStatus(s, "inactive")}>Deactivate</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => void patchStatus(s, "active")}>Activate</DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => {
                          void navigator.clipboard.writeText(s.id).then(() => notifySuccess("ID copied to clipboard"))
                        }}
                      >
                        Copy slab ID
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
