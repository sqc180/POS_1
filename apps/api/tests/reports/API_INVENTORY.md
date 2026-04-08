# API route inventory

Source: `apps/api/src/routes/register.ts` (+ nested `tenantRoutes`). Prefix: **none** (root mounted). Webhooks: **`/webhooks`**.

Legend: **Auth** = Bearer JWT unless noted. **Perm** = `requirePermission(...)`.

| Method | Path | Auth | Permission / notes |
|--------|------|------|-------------------|
| GET | `/health` | No | Liveness |
| POST | `/auth/onboarding` | No | Creates tenant + owner; Zod body |
| POST | `/auth/login` | No | Email/password/[tenantId]; Zod |
| GET | `/me` | Yes | JWT |
| GET | `/audit-logs` | Yes | `audit`; query `limit` 1–200 |
| GET | `/dashboard/summary` | Yes | `dashboard` — tenant KPI counts |
| GET | `/users` | Yes | `users` |
| GET | `/users/:id` | Yes | `users` |
| POST | `/users` | Yes | `users`; owner/admin only (service) |
| PATCH | `/users/:id` | Yes | `users` |
| POST | `/users/:id/reset-password` | Yes | `users`; owner/admin only (service) |
| GET | `/categories` | Yes | `categories` |
| POST | `/categories` | Yes | `categories` |
| PATCH | `/categories/:id` | Yes | `categories` |
| GET | `/products` | Yes | `products` |
| GET | `/products/:id` | Yes | `products` |
| POST | `/products` | Yes | `products` |
| PATCH | `/products/:id` | Yes | `products` |
| GET | `/gst-slabs` | Yes | `gst` |
| POST | `/gst-slabs` | Yes | `gst` |
| PATCH | `/gst-slabs/:id` | Yes | `gst` |
| GET | `/inventory` | Yes | `inventory` |
| GET | `/inventory/:id` | Yes | `inventory` |
| PATCH | `/inventory/:id` | Yes | `inventory` |
| POST | `/stock/movements` | Yes | `stock` |
| GET | `/stock/history` | Yes | `stock` |
| GET | `/customers` | Yes | `customers` |
| GET | `/customers/:id` | Yes | `customers` |
| POST | `/customers` | Yes | `customers` |
| PATCH | `/customers/:id` | Yes | `customers` |
| GET | `/suppliers` | Yes | `suppliers` |
| GET | `/suppliers/:id` | Yes | `suppliers` |
| POST | `/suppliers` | Yes | `suppliers` |
| PATCH | `/suppliers/:id` | Yes | `suppliers` |
| GET | `/settings/business` | Yes | `settings` |
| PATCH | `/settings/business` | Yes | `settings` |
| GET | `/settings/gateway` | Yes | `gateway` |
| PATCH | `/settings/gateway` | Yes | `gateway` |
| GET | `/settings/gateway/public-config` | Yes | `pos` |
| POST | `/pos/preview` | Yes | `pos` |
| GET | `/invoices` | Yes | `billing` |
| POST | `/invoices` | Yes | `billing` |
| GET | `/invoices/:id` | Yes | `billing` |
| PATCH | `/invoices/:id` | Yes | `billing` |
| POST | `/invoices/:id/complete` | Yes | `billing` |
| POST | `/invoices/:id/cancel` | Yes | `billing` |
| GET | `/invoices/:id/pdf` | Yes | `billing` |
| GET | `/payments` | Yes | `payments` |
| POST | `/payments` | Yes | `payments` |
| GET | `/payments/:id` | Yes | `payments` |
| PATCH | `/payments/:id` | Yes | `payments` |
| POST | `/qr-sessions` | Yes | `payments` |
| GET | `/qr-sessions/:id` | Yes | `payments` |
| POST | `/qr-sessions/:id/mark-paid` | Yes | `payments` |
| GET | `/receipts` | Yes | `receipts` |
| POST | `/receipts` | Yes | `receipts` |
| GET | `/receipts/:id` | Yes | `receipts` |
| GET | `/receipts/:id/pdf` | Yes | `receipts` |
| GET | `/refunds` | Yes | `refunds` |
| POST | `/refunds` | Yes | `refunds` |
| GET | `/refunds/:id` | Yes | `refunds` |
| POST | `/refunds/:id/complete` | Yes | `refunds` |
| GET | `/refunds/:id/pdf` | Yes | `refunds` |
| GET | `/documents/ensure` | Yes | Perm derived from `documentType` query |
| GET | `/documents/files/:fileId/metadata` | Yes | + document permission |
| GET | `/documents/files/:fileId/preview` | Yes | + document permission |
| GET | `/documents/files/:fileId/download` | Yes | + document permission |
| POST | `/documents/files/:fileId/soft-delete` | Yes | Owner/admin only |
| POST | `/webhooks/razorpay` | No | Raw body + `x-razorpay-signature`; separate JSON parser |

**Response contract (typical):** success `{ success: true, data }` or error `{ success: false, error: { code, message } }` via `sendError` / `apiError`.

**Uncovered in automated suite (extend next):** most routes only via happy-path workflows; dedicated tests per method for refunds lifecycle, QR sessions, gateway PATCH, settings PATCH, customer/supplier CRUD edges, invoice cancel, payment PATCH, document soft-delete, supermart business-type menu differences.
