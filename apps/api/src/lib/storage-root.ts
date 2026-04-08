import { resolve } from "path"
import type { ApiEnv } from "@repo/config"

export const resolveStorageRoot = (env: ApiEnv): string => {
  const raw = env.STORAGE_ROOT_PATH?.trim() || env.STORAGE_ROOT?.trim()
  if (raw) return resolve(raw)
  return resolve(process.cwd(), "storage")
}
