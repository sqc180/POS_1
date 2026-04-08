import mongoose from "mongoose"
import type { ApiEnv } from "@repo/config"
import { PaymentGatewayConfigModel } from "../models/payment-gateway-config.model.js"
import { auditService } from "./audit.service.js"

export const gatewayService = {
  async getOrCreate(tenantId: string) {
    let c = await PaymentGatewayConfigModel.findOne({ tenantId: new mongoose.Types.ObjectId(tenantId) })
    if (!c) {
      c = await PaymentGatewayConfigModel.create({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        provider: "noop",
        razorpayKeyId: "",
      })
    }
    return {
      provider: c.provider as "noop" | "razorpay",
      razorpayKeyId: c.razorpayKeyId ?? "",
      upiVpa: c.upiVpa ?? "",
      updatedAt: c.updatedAt?.toISOString?.() ?? "",
    }
  },

  publicConfig(tenantId: string) {
    return gatewayService.getOrCreate(tenantId).then((c) => ({
      provider: c.provider,
      razorpayKeyId: c.razorpayKeyId || undefined,
    }))
  },

  async update(
    tenantId: string,
    actorId: string,
    input: { provider: "noop" | "razorpay"; razorpayKeyId?: string; upiVpa?: string },
  ) {
    const c = await PaymentGatewayConfigModel.findOneAndUpdate(
      { tenantId: new mongoose.Types.ObjectId(tenantId) },
      {
        $set: {
          provider: input.provider,
          razorpayKeyId: input.razorpayKeyId ?? "",
          upiVpa: input.upiVpa ?? "",
        },
      },
      { new: true, upsert: true },
    )
    await auditService.log({
      tenantId,
      actorId,
      action: "gateway.update",
      entity: "PaymentGatewayConfig",
      entityId: c._id.toString(),
      metadata: { provider: input.provider },
    })
    return {
      provider: c.provider as "noop" | "razorpay",
      razorpayKeyId: c.razorpayKeyId ?? "",
      upiVpa: c.upiVpa ?? "",
      updatedAt: c.updatedAt?.toISOString?.() ?? "",
    }
  },

  envCreds(env: ApiEnv) {
    return {
      keyId: env.RAZORPAY_KEY_ID,
      keySecret: env.RAZORPAY_KEY_SECRET,
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
    }
  },
}
