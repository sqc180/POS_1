import crypto from "node:crypto"

export type PaymentProviderId = "noop" | "razorpay"

export interface CreateOrderInput {
  tenantId: string
  amountMinor: bigint
  currency: string
  receipt: string
  notes?: Record<string, string>
}

export interface CreateOrderResult {
  providerOrderId: string
  raw: unknown
}

export interface RefundInput {
  tenantId: string
  paymentId: string
  amountMinor: bigint
  notes?: Record<string, string>
}

export interface RefundResult {
  providerRefundId: string
  raw: unknown
}

export interface PaymentProvider {
  readonly id: PaymentProviderId
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>
  verifyWebhookSignature?(payload: string, signature: string, secret: string): boolean
  parseWebhook?(payload: unknown): { event: string; orderId?: string; paymentId?: string; status?: string }
  createRefund?(input: RefundInput): Promise<RefundResult>
}

export class NoopPaymentProvider implements PaymentProvider {
  readonly id: PaymentProviderId = "noop"

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    return {
      providerOrderId: `noop_${input.tenantId}_${Date.now()}`,
      raw: { status: "created" },
    }
  }

  verifyWebhookSignature(): boolean {
    return true
  }

  parseWebhook(payload: unknown): { event: string; orderId?: string; paymentId?: string; status?: string } {
    const p = payload as Record<string, unknown>
    return { event: String(p.event ?? "unknown") }
  }
}

/** Razorpay Checkout success callback: HMAC_SHA256(order_id|payment_id, key_secret) */
export const verifyRazorpayPaymentSignature = (
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string,
): boolean => {
  const body = `${orderId}|${paymentId}`
  const expected = crypto.createHmac("sha256", keySecret).update(body).digest("hex")
  return expected === signature
}

export interface RazorpayCredentials {
  keyId: string
  keySecret: string
  webhookSecret?: string
}

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly id: PaymentProviderId = "razorpay"

  constructor(private readonly creds: RazorpayCredentials) {}

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const Razorpay = (await import("razorpay")).default
    const rzp = new Razorpay({ key_id: this.creds.keyId, key_secret: this.creds.keySecret })
    const amountPaise = Number(input.amountMinor)
    const order = await rzp.orders.create({
      amount: amountPaise,
      currency: input.currency || "INR",
      receipt: input.receipt.slice(0, 40),
      notes: input.notes as Record<string, string> | undefined,
    })
    return { providerOrderId: order.id, raw: order }
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex")
    return expected === signature
  }

  parseWebhook(payload: unknown): { event: string; orderId?: string; paymentId?: string; status?: string } {
    const body = payload as {
      event?: string
      payload?: {
        payment?: { entity?: { id?: string; order_id?: string; status?: string } }
        order?: { entity?: { id?: string; status?: string } }
      }
    }
    const event = body.event ?? "unknown"
    const pay = body.payload?.payment?.entity
    const ord = body.payload?.order?.entity
    return {
      event,
      orderId: pay?.order_id ?? ord?.id,
      paymentId: pay?.id,
      status: pay?.status ?? ord?.status,
    }
  }

  async createRefund(input: RefundInput): Promise<RefundResult> {
    const Razorpay = (await import("razorpay")).default
    const rzp = new Razorpay({ key_id: this.creds.keyId, key_secret: this.creds.keySecret })
    const refund = await rzp.payments.refund(input.paymentId, {
      amount: Number(input.amountMinor),
      notes: input.notes,
    })
    return { providerRefundId: refund.id, raw: refund }
  }
}

export type TenantGatewayMode = "noop" | "razorpay"

export interface TenantGatewayConfig {
  provider: TenantGatewayMode
  razorpayKeyId?: string
}

export const getProviderForTenant = (
  config: TenantGatewayConfig,
  envCreds?: { keyId?: string; keySecret?: string; webhookSecret?: string },
): PaymentProvider => {
  if (config.provider === "razorpay") {
    const keyId = config.razorpayKeyId || envCreds?.keyId
    const keySecret = envCreds?.keySecret
    if (!keyId || !keySecret) {
      return new NoopPaymentProvider()
    }
    return new RazorpayPaymentProvider({
      keyId,
      keySecret,
      webhookSecret: envCreds?.webhookSecret,
    })
  }
  return new NoopPaymentProvider()
}

export const getProvider = (id: PaymentProviderId): PaymentProvider => {
  if (id === "razorpay") return new NoopPaymentProvider()
  return new NoopPaymentProvider()
}
