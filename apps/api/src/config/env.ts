import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { config as dotenvConfig } from "dotenv"
import { loadApiEnv, type ApiEnv } from "@repo/config"

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenvConfig({ path: resolve(__dirname, "../../../../.env") })
dotenvConfig()

export const env: ApiEnv = loadApiEnv(process.env)
