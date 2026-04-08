"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { getToken } from "@/lib/auth-storage"

export default function HomePage() {
  const router = useRouter()
  useEffect(() => {
    if (getToken()) router.replace("/dashboard")
    else router.replace("/login")
  }, [router])
  return null
}
