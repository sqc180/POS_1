import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadApiEnv, type ApiEnv } from "@repo/config"

export const makeTestEnv = (): ApiEnv => {
  const uri = process.env.MONGODB_URI
  if (!uri?.trim()) {
    throw new Error("MONGODB_URI must be set (vitest-setup starts MongoMemoryServer)")
  }
  const storageRoot = mkdtempSync(join(tmpdir(), "pos-api-stor-"))
  return loadApiEnv({
    NODE_ENV: "test",
    MONGODB_URI: uri,
    JWT_SECRET: "test_jwt_secret_value_min_16_chars",
    WEB_ORIGIN: "http://localhost:3000",
    BCRYPT_ROUNDS: "10",
    STORAGE_ROOT: storageRoot,
  })
}
