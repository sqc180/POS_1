import jwt, { type SignOptions } from "jsonwebtoken"
import type { UserRole } from "@repo/types"
import type { ApiEnv } from "@repo/config"

export type JwtPayload = {
  sub: string
  tid: string
  role: UserRole
}

export const signAccessToken = (env: ApiEnv, payload: JwtPayload, expiresIn: SignOptions["expiresIn"] = "7d"): string =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn } as SignOptions)

export const verifyAccessToken = (env: ApiEnv, token: string): JwtPayload => {
  const decoded = jwt.verify(token, env.JWT_SECRET)
  if (typeof decoded !== "object" || decoded === null) throw new Error("Invalid token")
  const { sub, tid, role } = decoded as Record<string, unknown>
  if (typeof sub !== "string" || typeof tid !== "string" || typeof role !== "string") {
    throw new Error("Invalid token payload")
  }
  return { sub, tid, role: role as UserRole }
}
