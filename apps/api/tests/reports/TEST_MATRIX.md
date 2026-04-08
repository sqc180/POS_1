# Test matrix (automated suite v1)

Implementation: `apps/api/tests/integration/*.test.ts`. Runner: **Vitest** + **MongoDB Memory Server** + **Fastify `inject`**.

## Summary

| Area | File | Cases (high level) |
|------|------|-------------------|
| Health & auth | `health-auth.test.ts` | `/health`, onboarding validation, login ok/fail, tenantId, `/me` auth/JWT/forged sub |
| Users & RBAC | `users-rbac.test.ts` | Owner create user, duplicate email, cashier forbidden, viewer forbidden, manager create forbidden, PATCH validation |
| Tenant isolation | `tenant-isolation.test.ts` | Cross-tenant GET product 404, PATCH category 404 |
| Catalog & stock | `catalog-stock.test.ts` | Category+product+inventory, stock in, GST validation, product PATCH validation |
| Billing E2E | `billing-flow.test.ts` | Payment blocked on draft invoice, complete → pay → receipt, invoice PDF |
| Webhooks & edges | `webhooks-and-edge.test.ts` | Razorpay webhook 503/400, documents ensure 400, login empty password |

## Per-endpoint expectations (abbreviated)

| Route | Happy | Auth− | RBAC− | Validation− | Tenant X | Business rule |
|-------|-------|-------|-------|-------------|----------|---------------|
| POST /auth/login | 200 + token | — | — | 400 empty pwd | N/A | 401 bad credentials |
| POST /auth/onboarding | 200 | — | — | 400 bad email | N/A | — |
| GET /me | 200 | 401 | — | — | N/A | 404 forged user |
| POST /users | 201 owner | 401 | 403 cashier/viewer/manager | — | N/A | 409 duplicate |
| GET /products/:id | 200 | 401 | — | — | 404 other tenant | — |
| PATCH /categories/:id | 200 | 401 | — | — | 404 other tenant | — |
| POST /payments | 201 | 401 | — | — | — | 409 if invoice not completed |
| POST /webhooks/razorpay | — | — | — | — | — | 503 no secret; 400 bad sig |

## Expansion backlog (recommended)

1. **Refunds:** POST refund, exceed paid, complete, PDF.
2. **QR:** create session, get, mark-paid (mock Razorpay where needed).
3. **Invoices:** cancel, edit draft vs completed guards.
4. **Stock:** negative stock when `allowNegativeStock` false.
5. **Documents:** cross-tenant fileId on metadata/preview/download.
6. **Settings/gateway:** PATCH validation and feature flags.
7. **All roles matrix:** inventory_staff vs POS, accountant vs stock, etc.
