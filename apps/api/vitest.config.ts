import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts", "tests/unit/**/*.test.ts"],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    setupFiles: [path.join(root, "tests/setup/vitest-setup.ts")],
  },
})
