import { toast } from "@repo/ui"

export const notifyError = (message: string, title = "Error"): void => {
  toast({ variant: "destructive", title, description: message })
}

export const notifySuccess = (message: string, title = "Done"): void => {
  toast({ title, description: message })
}
