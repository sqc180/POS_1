import { env } from "./config/env.js"
import { connectDb } from "./db/connect.js"
import { createApp } from "./app.js"

const start = async () => {
  await connectDb(env)
  const app = await createApp(env, { logger: true })
  await app.listen({ port: env.PORT, host: "0.0.0.0" })
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
