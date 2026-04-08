# QA report — API integration suite

**Date:** 2026-04-08 (generated with suite)  
**Scope:** `apps/api` HTTP surface via Vitest + in-memory MongoDB + real Fastify app + real Mongoose models.

## Executive summary

- **Pass rate:** 30 / 30 tests passing (last run).
- **Infra:** `MongoMemoryServer` (no production DB), isolated temp `STORAGE_ROOT` per suite file.
- **Risk:** Financial and document flows have **partial** coverage; suite is **regression-safe** for auth, tenant scoping, core billing path, and webhook hardening.

## Modules covered

| Module | Coverage level |
|--------|----------------|
| Auth / onboarding / login | Strong |
| `/me` / JWT | Strong |
| Users + RBAC (owner/cashier/viewer/manager) | Medium |
| Tenant isolation (products, categories) | Medium |
| Categories, products, GST, inventory, stock | Medium |
| Invoices, payments, receipts, invoice PDF | Medium (one E2E) |
| Razorpay webhook (config + signature) | Light |
| Documents `ensure` validation | Light |

## Routes not yet exhaustively tested

- Refunds (create/complete/PDF), QR sessions lifecycle, payment PATCH, invoice cancel, customers/suppliers full CRUD, gateway/settings PATCH, soft-delete documents, supermart-only menu/RBAC differences, pagination limits, large payloads, concurrent idempotency.

## Critical issues

- **None observed** in the executed suite.

## Medium issues

- **Coverage gaps** on high-risk modules listed above; address before production sign-off.

## Low issues

- First run downloads MongoDB binary for `mongodb-memory-server` (~minutes); CI should cache `~/.cache/mongodb-memory-server`.

## Recommended fixes / next steps

1. Add refund + QR integration tests with provider mocks.
2. Add cross-tenant tests for payments, invoices, and document file routes.
3. Add role-permutation tests driven by a table (`ROLE_PERMISSIONS`).
4. Wire `pnpm test:api` in CI with `cache: true` for turbo after stabilizing.

## Payload / `.env` note (login debugging)

- Browser **Network** may label the request **`login`**; the actual path is **`POST {NEXT_PUBLIC_API_URL}/auth/login`**.
- Body **`{ email, password, tenantId? }`** is correct; `tenantId` is the workspace (Mongo ObjectId string).
- **`.env` sanity:** `PORT=4000` and `NEXT_PUBLIC_API_URL=http://localhost:4000` must match; `MONGODB_URI` must be the database where users exist; changing **`JWT_SECRET`** invalidates old tokens (re-login only); **`WEB_ORIGIN`** must include the Next.js origin (e.g. add `http://localhost:3001` if the app runs there).

If credentials are correct but login still returns **401**, the user row is missing, **inactive**, or the password does not match the hash in that database.
