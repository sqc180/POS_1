import { z } from "zod"

const commaSeparatedOriginsSchema = z
  .string()
  .min(1)
  .refine(
    (val) =>
      val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .every((o) => /^https?:\/\/.+/i.test(o)),
    "Origins must be comma-separated absolute http(s) URLs",
  )

const trustProxySchema = z.preprocess((val) => {
  if (val === undefined || val === "") return false
  if (typeof val === "boolean") return val
  const s = String(val).toLowerCase()
  return s === "1" || s === "true" || s === "yes"
}, z.boolean())

export const appEnvValues = ["local", "development", "staging", "production"] as const
export type AppEnvName = (typeof appEnvValues)[number]

export const logLevelValues = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const
export type LogLevelName = (typeof logLevelValues)[number]

export const storageProviderValues = ["local"] as const
export type StorageProviderId = (typeof storageProviderValues)[number]

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_ENV: z.enum(appEnvValues).default("local"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1),
  MONGODB_CONNECT_RETRIES: z.coerce.number().int().min(1).max(60).default(5),
  MONGODB_CONNECT_RETRY_MS: z.coerce.number().int().min(50).max(120_000).default(2000),
  JWT_SECRET: z.string().min(16),
  /** Effective CORS allowlist (set via CORS_ALLOWED_ORIGINS or legacy WEB_ORIGIN in loader). */
  WEB_ORIGIN: commaSeparatedOriginsSchema,
  APP_BASE_URL: z.string().url().optional(),
  API_BASE_URL: z.string().url().optional(),
  BCRYPT_ROUNDS: z.coerce.number().min(8).max(14).default(11),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  STORAGE_PROVIDER: z.enum(storageProviderValues).default("local"),
  /** Preferred storage root path (alias: STORAGE_ROOT). */
  STORAGE_ROOT_PATH: z.string().optional(),
  /** @deprecated Use STORAGE_ROOT_PATH; kept in sync by env loader for backward compatibility. */
  STORAGE_ROOT: z.string().optional(),
  /** Optional subdirectory under the storage root for PDF assets (relative, no leading slash). */
  PDF_STORAGE_PATH: z.string().optional(),
  LOG_LEVEL: z.enum(logLevelValues).default("info"),
  TRUST_PROXY: trustProxySchema.default(false),
  /** Max JSON/raw body size in bytes (multipart limits can be raised separately later). */
  REQUEST_BODY_LIMIT: z.coerce.number().int().min(1024).default(10 * 1024 * 1024),
})

export type ApiEnv = z.infer<typeof apiEnvSchema>

export const loadApiEnv = (env: Record<string, string | undefined>): ApiEnv => {
  const corsMerged =
    env.CORS_ALLOWED_ORIGINS?.trim() ||
    env.WEB_ORIGIN?.trim() ||
    "http://localhost:3000"
  const storageMerged =
    env.STORAGE_ROOT_PATH?.trim() ||
    env.STORAGE_ROOT?.trim() ||
    undefined

  const result = apiEnvSchema.safeParse({
    NODE_ENV: env.NODE_ENV,
    APP_ENV: env.APP_ENV,
    HOST: env.HOST,
    PORT: env.PORT,
    MONGODB_URI: env.MONGODB_URI,
    MONGODB_CONNECT_RETRIES: env.MONGODB_CONNECT_RETRIES,
    MONGODB_CONNECT_RETRY_MS: env.MONGODB_CONNECT_RETRY_MS,
    JWT_SECRET: env.JWT_SECRET,
    WEB_ORIGIN: corsMerged,
    APP_BASE_URL: env.APP_BASE_URL?.trim() || undefined,
    API_BASE_URL: env.API_BASE_URL?.trim() || undefined,
    BCRYPT_ROUNDS: env.BCRYPT_ROUNDS,
    RAZORPAY_KEY_ID: env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: env.RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: env.RAZORPAY_WEBHOOK_SECRET,
    STORAGE_PROVIDER: env.STORAGE_PROVIDER,
    STORAGE_ROOT_PATH: storageMerged,
    STORAGE_ROOT: storageMerged,
    PDF_STORAGE_PATH: env.PDF_STORAGE_PATH?.trim() || undefined,
    LOG_LEVEL: env.LOG_LEVEL,
    TRUST_PROXY: env.TRUST_PROXY,
    REQUEST_BODY_LIMIT: env.REQUEST_BODY_LIMIT,
  })

  if (!result.success) {
    console.error("Invalid API environment configuration:")
    for (const issue of result.error.issues) {
      const path = issue.path.length ? issue.path.join(".") : "(root)"
      console.error(`  - ${path}: ${issue.message}`)
    }
    process.exit(1)
    throw new Error("Invalid API environment configuration")
  }

  return result.data
}

const webEnvNameValues = appEnvValues

export const webPublicEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("POS ERP"),
  NEXT_PUBLIC_ENV_NAME: z.enum(webEnvNameValues).default("local"),
})

export type WebPublicEnv = {
  NEXT_PUBLIC_API_BASE_URL: string
  NEXT_PUBLIC_API_URL: string
  NEXT_PUBLIC_APP_NAME: string
  NEXT_PUBLIC_ENV_NAME: AppEnvName
}

export const loadWebPublicEnv = (env: Record<string, string | undefined>): WebPublicEnv => {
  const baseRaw =
    env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://localhost:4000"
  const baseParsed = z.string().url().safeParse(baseRaw)
  if (!baseParsed.success) {
    console.error("Invalid NEXT_PUBLIC_API_BASE_URL / NEXT_PUBLIC_API_URL: must be a valid absolute URL")
    process.exit(1)
    throw new Error("Invalid public API URL")
  }
  const base = baseParsed.data

  const parsed = webPublicEnvSchema.safeParse({
    NEXT_PUBLIC_API_BASE_URL: env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_API_URL: env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_NAME: env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_ENV_NAME: env.NEXT_PUBLIC_ENV_NAME,
  })

  if (!parsed.success) {
    console.error("Invalid web public environment configuration:")
    for (const issue of parsed.error.issues) {
      const path = issue.path.length ? issue.path.join(".") : "(root)"
      console.error(`  - ${path}: ${issue.message}`)
    }
    process.exit(1)
    throw new Error("Invalid web public environment configuration")
  }

  const d = parsed.data
  return {
    NEXT_PUBLIC_API_BASE_URL: base,
    NEXT_PUBLIC_API_URL: base,
    NEXT_PUBLIC_APP_NAME: d.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_ENV_NAME: d.NEXT_PUBLIC_ENV_NAME,
  }
}
