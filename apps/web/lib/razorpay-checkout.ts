"use client"

type RazorpaySuccess = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

type RazorpayDismiss = () => void

export const loadRazorpayScript = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      resolve()
      return
    }
    const w = window as unknown as { Razorpay?: unknown }
    if (w.Razorpay) {
      resolve()
      return
    }
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("Razorpay script failed")), { once: true })
      return
    }
    const s = document.createElement("script")
    s.src = "https://checkout.razorpay.com/v1/checkout.js"
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error("Razorpay script failed"))
    document.body.appendChild(s)
  })

export const openRazorpayCheckout = (opts: {
  keyId: string
  orderId: string
  amountPaise: number
  currency: string
  businessName: string
  description: string
  onSuccess: (res: RazorpaySuccess) => void
  onDismiss?: RazorpayDismiss
}): void => {
  const w = window as unknown as {
    Razorpay?: new (config: Record<string, unknown>) => { open: () => void }
  }
  const Razorpay = w.Razorpay
  if (!Razorpay) {
    throw new Error("Razorpay is not loaded")
  }
  const rzp = new Razorpay({
    key: opts.keyId,
    order_id: opts.orderId,
    amount: opts.amountPaise,
    currency: opts.currency,
    name: opts.businessName,
    description: opts.description,
    handler: (response: RazorpaySuccess) => {
      opts.onSuccess(response)
    },
    modal: {
      ondismiss: () => {
        opts.onDismiss?.()
      },
    },
  })
  rzp.open()
}
