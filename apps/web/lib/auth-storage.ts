const TOKEN_KEY = "pos_erp_token"
const LAST_TENANT_KEY = "pos_erp_last_tenant_id"

export const isLikelyMongoObjectId = (value: string): boolean => /^[a-f\d]{24}$/i.test(value)

export const getToken = (): string | null => {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export const setToken = (token: string) => {
  window.localStorage.setItem(TOKEN_KEY, token)
}

export const clearToken = () => {
  window.localStorage.removeItem(TOKEN_KEY)
}

/** Last signed-in workspace (Mongo ObjectId). Used to disambiguate login when the same email exists on multiple tenants. */
export const getLastTenantId = (): string | null => {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(LAST_TENANT_KEY)
  if (!raw || !isLikelyMongoObjectId(raw)) return null
  return raw
}

export const setLastTenantId = (tenantId: string) => {
  if (typeof window === "undefined") return
  if (!isLikelyMongoObjectId(tenantId)) return
  window.localStorage.setItem(LAST_TENANT_KEY, tenantId)
}

export const clearLastTenantId = () => {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(LAST_TENANT_KEY)
}
