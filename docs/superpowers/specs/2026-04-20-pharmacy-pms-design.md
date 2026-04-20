# Pharmacy Management System — design spec

**Date:** 2026-04-20  
**Status:** Approved for implementation  
**Stack:** Monorepo `pos-erp-monorepo` — Next.js (`apps/web`), Fastify API + MongoDB (`apps/api`), `@repo/ui` (shadcn-compatible), `packages/business-type-engine`.

## 1. Purpose

Evolve the existing retail POS/ERP toward a **pharmacy-aware** workflow: dispensing-oriented UX, batch/expiry safety, demand capture for out-of-stock items, and a phased path to procurement and transfers. This document aligns module intent with the MocDoc-style reference (inventory + billing integration) while staying grounded in this codebase.

## 2. Non-goals (initial releases)

- Full hospital EMR/IP billing integration (prescription attach points are extension hooks only).
- Regulatory certification (FDA/NABH) — operational support only.
- Tally/accounting export (tracked as Phase 4 integration slice).

## 3. Phases and gates

| Phase | Focus | Exit criteria |
|-------|--------|---------------|
| 1 | Billing/dispensing UX, unavailable list, return validation, generic name search, in-stock filter | API integration tests + web flows using `@repo/ui` only |
| 2 | FEFO allocation, expiry proximity signals, audit/disposal | Tests for allocation order + movements |
| 3 | Procurement (quotation → PR → PO → GRN draft), stock transfer (indent/direct/empty-store) | New collections + routes + tests |
| 4 | Living roadmap, compliance notes, external integrations | Doc updates + backlog links |

## 4. Data entities (incremental)

- **Product:** `genericName` (pharmacological / generic label for search) — implemented; indexed and searchable with name/sku.
- **UnavailableMedicineRequest:** tenant, branch, productName or productId, note, status — implemented (`UnavailableMedicineRequest` model).
- **Refund.returnLines:** optional `{ lineIndex, qty }[]` — validates prorated totals and restores batch + inventory on complete.
- **Phase 3 (MVP in repo):** `PurchaseRequisition`, `GoodsReceiptNote` (draft), `StockTransferRequest` — list/create APIs and `/procurement` UI shell.

## 5. Verification

- `pnpm --filter @repo/api test` for behavioral changes.
- `pnpm run ci` before marking any phase complete (lint, typecheck, test, build).

## 6. UI rules

All new screens use **shadcn/ui** via `@repo/ui` — forms, tables, dialogs, sheets, command menus, tabs, cards. No alternate component libraries; no raw HTML dialog patterns outside shared primitives.
