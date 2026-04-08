import { z } from "zod"

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  WEB_ORIGIN: z
    .string()
    .default("http://localhost:3000")
    .refine(
      (val) =>
        val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .every((o) => /^https?:\/\/.+/i.test(o)),
      "WEB_ORIGIN must be comma-separated http(s) origins",
    ),
  BCRYPT_ROUNDS: z.coerce.number().min(8).max(14).default(11),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  /** Absolute or relative path for tenant file storage (PDFs, future uploads). Default: ./storage under process cwd. */
  STORAGE_ROOT: z.string().optional(),
})

export type ApiEnv = z.infer<typeof apiEnvSchema>

export const loadApiEnv = (env: Record<string, string | undefined>): ApiEnv =>
  apiEnvSchema.parse({
    NODE_ENV: env.NODE_ENV,
    PORT: env.PORT,
    MONGODB_URI: env.MONGODB_URI,
    JWT_SECRET: env.JWT_SECRET,
    WEB_ORIGIN: env.WEB_ORIGIN,
    BCRYPT_ROUNDS: env.BCRYPT_ROUNDS,
    RAZORPAY_KEY_ID: env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: env.RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: env.RAZORPAY_WEBHOOK_SECRET,
    STORAGE_ROOT: env.STORAGE_ROOT,
  })

export const webPublicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
})

export type WebPublicEnv = z.infer<typeof webPublicEnvSchema>
