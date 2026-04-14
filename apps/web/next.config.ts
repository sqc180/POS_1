import type { NextConfig } from "next"
import { loadWebPublicEnv } from "@repo/config"

loadWebPublicEnv(process.env)

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/ui", "@repo/business-type-engine"],
  // Standalone output is ideal for minimal Docker images on Linux; on Windows hosts
  // `next build` can fail with EPERM when creating symlinks. Use `next start` images instead.
}

export default nextConfig
