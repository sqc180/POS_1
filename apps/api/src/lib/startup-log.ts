import type { ApiEnv } from "@repo/config"
import { resolveStorageRoot } from "./storage-root.js"

/** Logs non-secret deployment context at startup. Never log secrets or full URIs. */
export const logSafePublicConfig = (env: ApiEnv): void => {
  const mongoHostHint = (() => {
    try {
      const u = new URL(env.MONGODB_URI.replace(/^mongodb(\+srv)?:\/\//, "http://"))
      return { host: u.hostname, db: u.pathname.replace(/^\//, "") || "(default)" }
    } catch {
      return { host: "(unparsed)", db: "(unparsed)" }
    }
  })()

  const origins = env.WEB_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  console.info(
    JSON.stringify({
      msg: "api_startup_config",
      NODE_ENV: env.NODE_ENV,
      APP_ENV: env.APP_ENV,
      PORT: env.PORT,
      HOST: env.HOST,
      STORAGE_PROVIDER: env.STORAGE_PROVIDER,
      storageRoot: resolveStorageRoot(env),
      pdfSubpath: env.PDF_STORAGE_PATH?.trim() || null,
      corsOriginCount: origins.length,
      trustProxy: env.TRUST_PROXY,
      logLevel: env.LOG_LEVEL,
      bodyLimitBytes: env.REQUEST_BODY_LIMIT,
      mongoHost: mongoHostHint.host,
      mongoDb: mongoHostHint.db,
      hasAppBaseUrl: Boolean(env.APP_BASE_URL),
      hasApiBaseUrl: Boolean(env.API_BASE_URL),
    }),
  )
}
