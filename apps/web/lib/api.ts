import { getToken } from "./auth-storage"

const base = () =>
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "http://localhost:4000"

export type ApiResult<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } }

const parseApiBody = (text: string, status: number, statusText: string): ApiResult<never> | null => {
  if (!text.trim()) {
    return { success: false, error: { code: "empty_response", message: statusText || `HTTP ${status}` } }
  }
  try {
    return JSON.parse(text) as ApiResult<never>
  } catch {
    return {
      success: false,
      error: {
        code: "invalid_json",
        message: `HTTP ${status}: ${text.slice(0, 160).trim()}${text.length > 160 ? "…" : ""}`,
      },
    }
  }
}

const methodsThatMaySendJsonBody = new Set(["POST", "PUT", "PATCH", "DELETE"])

export const apiRequest = async <T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean },
): Promise<ApiResult<T>> => {
  const headers = new Headers(init?.headers)
  const method = (init?.method ?? "GET").toUpperCase()
  const rawBody = init?.body
  const needsJsonBody =
    methodsThatMaySendJsonBody.has(method) &&
    (rawBody === undefined || rawBody === null || rawBody === "")
  const body: BodyInit | undefined = needsJsonBody ? "{}" : rawBody === null || rawBody === "" ? undefined : rawBody

  if (typeof body === "string") {
    headers.set("Content-Type", "application/json")
  }

  if (!init?.skipAuth) {
    const t = getToken()
    if (t) headers.set("Authorization", `Bearer ${t}`)
  }
  let res: Response
  try {
    res = await fetch(`${base()}${path}`, { ...init, headers, body })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network request failed"
    return { success: false, error: { code: "network_error", message: msg } }
  }
  const text = await res.text()
  const parsed = parseApiBody(text, res.status, res.statusText)
  if (!parsed) {
    return { success: false, error: { code: "unknown", message: res.statusText } }
  }
  if (parsed.success === false) {
    return parsed as ApiResult<T>
  }
  if (parsed.success === true) {
    if (!res.ok) {
      return {
        success: false,
        error: {
          code: "http_error",
          message: `HTTP ${res.status}: ${res.statusText || "Request failed"}`,
        },
      }
    }
    return parsed as ApiResult<T>
  }
  if (!res.ok) {
    return {
      success: false,
      error: { code: "http_error", message: res.statusText || `HTTP ${res.status}` },
    }
  }
  return { success: false, error: { code: "unexpected_shape", message: "Invalid API response" } }
}

export type ApiBlobResult =
  | { ok: true; blob: Blob; contentType: string }
  | { ok: false; error: { code: string; message: string } }

export const apiBlob = async (path: string, init?: RequestInit): Promise<ApiBlobResult> => {
  const headers = new Headers(init?.headers)
  const t = getToken()
  if (t) headers.set("Authorization", `Bearer ${t}`)
  let res: Response
  try {
    res = await fetch(`${base()}${path}`, { ...init, headers })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network request failed"
    return { ok: false, error: { code: "network_error", message: msg } }
  }
  const contentType = res.headers.get("content-type") ?? "application/octet-stream"
  if (!res.ok) {
    const text = await res.text()
    const parsed = parseApiBody(text, res.status, res.statusText)
    if (parsed?.success === false) {
      return { ok: false, error: parsed.error }
    }
    return {
      ok: false,
      error: { code: "http_error", message: text.slice(0, 200) || res.statusText },
    }
  }
  const blob = await res.blob()
  return { ok: true, blob, contentType }
}
