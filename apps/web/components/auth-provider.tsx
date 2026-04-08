"use client"

import type { MeResponse } from "@repo/types"
import { usePathname, useRouter } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { apiRequest } from "@/lib/api"
import { clearToken, getToken, setLastTenantId, setToken } from "@/lib/auth-storage"

type AuthState = {
  me: MeResponse | null
  loading: boolean
  refresh: () => Promise<void>
  login: (token: string) => Promise<void>
  logout: () => void
}

const Ctx = createContext<AuthState | null>(null)

const publicPaths = new Set(["/login", "/onboarding", "/"])

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  const refresh = useCallback(async () => {
    const t = getToken()
    if (!t) {
      setMe(null)
      setLoading(false)
      return
    }
    try {
      const res = await apiRequest<MeResponse>("/me")
      if (res.success) {
        setMe(res.data)
        setLastTenantId(res.data.tenant.id)
      } else {
        clearToken()
        setMe(null)
      }
    } catch {
      clearToken()
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const login = useCallback(
    async (token: string) => {
      setToken(token)
      await refresh()
      router.push("/dashboard")
    },
    [refresh, router],
  )

  const logout = useCallback(() => {
    clearToken()
    setMe(null)
    router.push("/login")
  }, [router])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (loading) return
    if (publicPaths.has(pathname)) return
    if (!getToken()) {
      router.replace("/login")
      return
    }
    if (!me && getToken()) return
  }, [loading, me, pathname, router])

  const value = useMemo(
    () => ({
      me,
      loading,
      refresh,
      login,
      logout,
    }),
    [me, loading, refresh, login, logout],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = (): AuthState => {
  const v = useContext(Ctx)
  if (!v) throw new Error("useAuth must be used within AuthProvider")
  return v
}

export const useOptionalAuth = (): AuthState | null => useContext(Ctx)
