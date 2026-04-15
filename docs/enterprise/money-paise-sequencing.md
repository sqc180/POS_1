# Money semantics and integer paise (Phase B sequencing)

## Current state (as of this document)

- **Storage and API:** Monetary fields (`sellingPrice`, `costPrice`, `mrp`, invoice `subtotal`, `grandTotal`, line `unitPrice`, payment `amount`, etc.) use **JavaScript `Number`** in **rupee-style decimal** units (e.g. `199.5` for ₹199.50), consistent with existing POS, PDF, and Razorpay integration.
- **Rounding:** Some paths use cent-like rounding (`Math.round(x * 100) / 100`) for display or payment remainder checks—not integer paise end-to-end.

## Enterprise master prompt requirement

- **Rule:** All money fields **integer paise only** (₹1 = 100 paise), immutable posted totals, no silent float drift.

## Decision (recommended and adopted for sequencing)

**Option 2 — Domain and scale features first; paise as a dedicated cutover epic**

1. Ship catalog pagination, user lifecycle, inventory tabs, billing approval hooks, GST summaries, and AR/AP helpers **in current decimal rupee units** so behavior and tests remain stable.
2. Execute **Phase B (paise)** as a single coordinated program: schema migration, `@repo/types` money aliases, Zod validators, all services (tax, invoice, payment, refund, Razorpay), PDF templates, web formatting/parsing, and **full integration test updates**.

## Why not paise-first in this repo today

- Touches **every** monetary boundary (GST slabs, line tax math, Razorpay order amounts, QR payloads, customer-facing PDFs).
- Requires **data migration** for existing tenants and backward-compatible API versioning (`Accept` / `/api/v2` or dual fields) if any external client cannot switch atomically.

## API/UI impact checklist (for Phase B execution)

| Area | Change |
|------|--------|
| Mongoose models | `Int64` or `Long` / stored integer paise; avoid float for money |
| Zod | `z.number().int().nonnegative()` for paise fields |
| `tax.service` | Compute in integer math; snapshot paise on lines |
| Web | Display `formatMoneyPaise(n)`; forms parse rupee input → paise at submit |
| PDF / receipts | Format from paise |
| Razorpay | Amount in paise per gateway rules |
| Tests | All expectations converted to paise integers |

## Versioning

- Prefer **explicit API version** or `?moneyUnit=paise` only during transition; remove after cutover.

This document satisfies roadmap todo **decide-paise-sequencing** without changing runtime behavior.
