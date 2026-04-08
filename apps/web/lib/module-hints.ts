/** Short, scannable tips per area — full copy lives in Guide & samples. */

export type ModuleHint = {
  title: string
  lines: readonly string[]
}

const DASHBOARD: ModuleHint = {
  title: "Dashboard",
  lines: [
    "This is your home view after sign-in — open any module from the sidebar when you are ready to work.",
    "Your role decides which links you see; the server enforces the same rules on every action.",
    "Operational snapshot includes active locations when Branches appears in your menu — jump there to add shops or warehouses.",
  ],
}

const POS: ModuleHint = {
  title: "POS (checkout)",
  lines: [
    "Add products to the cart (search, command palette, or barcode + Enter), optionally pick a customer, then save a draft.",
    "Pay cash or UPI QR finalizes a draft invoice for you (same as Complete, then pay), or use Complete alone if you only want to lock stock before taking money.",
    "A receipt is available when the invoice is fully paid. Use Preview totals to check GST lines first.",
    "Tracked lines show which branch stock is checked against — names come from Branches & locations; the default is in Settings.",
  ],
}

const PRODUCTS: ModuleHint = {
  title: "Products",
  lines: [
    "Each product needs a unique SKU, selling price, and GST slab. Turn off “track stock” only if you do not want inventory moves.",
    "Inactive products are hidden from POS — use that to retire items without deleting history.",
  ],
}

const CATEGORIES: ModuleHint = {
  title: "Categories",
  lines: [
    "Categories group products for browsing and reports; they do not replace SKU uniqueness.",
  ],
}

const BRANCHES: ModuleHint = {
  title: "Branches & locations",
  lines: [
    "Each row is a shop, warehouse, or other site. The code is the branchId stored on stock — keep it stable once inventory exists.",
    "POS and new stock rows use the default branch from Business settings; pick it from the same directory when possible.",
  ],
}

const INVENTORY: ModuleHint = {
  title: "Inventory",
  lines: [
    "Shows stock per branch for tracked products. Branch names resolve from Branches & locations when defined.",
    "POS uses your default branch from business settings — align that code with a row in Branches.",
  ],
}

const STOCK: ModuleHint = {
  title: "Stock movements",
  lines: [
    "Pick the exact inventory row (product + branch); branch names match Branches & locations when defined.",
    "Use this for adjustments and history. Completing or cancelling invoices also writes movements when stock tracking is on.",
  ],
}

const CUSTOMERS: ModuleHint = {
  title: "Customers",
  lines: [
    "Optional on POS; add phone or GSTIN if you need them on tax invoices.",
  ],
}

const SUPPLIERS: ModuleHint = {
  title: "Suppliers",
  lines: [
    "Vendor master data for purchases and reference; keep GSTIN current for compliance paperwork.",
  ],
}

const INVOICES: ModuleHint = {
  title: "Invoices (billing)",
  lines: [
    "Drafts are editable; Complete finalises numbering and can move stock. Download PDF anytime — it is stored securely on the server.",
    "You cannot cancel a completed invoice with payments until refunds are handled.",
  ],
}

const INVOICE_DETAIL: ModuleHint = {
  title: "Invoice detail",
  lines: [
    "Complete changes status from draft and applies your numbering rules. PDF reflects the latest stored copy after complete/cancel.",
    "Use Payments from this invoice or the Payments screen to record tender.",
  ],
}

const PAYMENTS: ModuleHint = {
  title: "Payments",
  lines: [
    "Tender is stored only against finalized invoices (status completed). If the list is empty, complete the sale in POS or Billing first, then record payment.",
    "Open a row’s details for provider references and idempotency metadata.",
  ],
}

const RECEIPTS: ModuleHint = {
  title: "Receipts",
  lines: [
    "One receipt per fully paid invoice. PDF opens in a new tab; use Documents viewer for a larger preview.",
  ],
}

const REFUNDS: ModuleHint = {
  title: "Refunds",
  lines: [
    "Amount cannot exceed what was paid minus prior refunds. Complete updates the invoice balance (stock is not auto-restored here).",
  ],
}

const GST: ModuleHint = {
  title: "GST slabs",
  lines: [
    "Rates drive tax lines on invoices and POS previews. Slabs are seeded at signup — adjust to match your catalog.",
  ],
}

const USERS: ModuleHint = {
  title: "Users",
  lines: [
    "Owner and admin can create users and reset passwords. Managers can update staff display names only.",
    "Roles map to permissions on the server — the Roles page is a quick reference.",
  ],
}

const USER_DETAIL: ModuleHint = {
  title: "User profile",
  lines: [
    "Change name for yourself (owner) or for staff you are allowed to edit. Role and password changes need owner/admin where applicable.",
  ],
}

const ROLES: ModuleHint = {
  title: "Roles",
  lines: [
    "Read-only map of what each role can do. Real enforcement is always on the API.",
  ],
}

const SETTINGS: ModuleHint = {
  title: "Business settings",
  lines: [
    "Prefixes, default branch, tax mode, and stock rules apply tenant-wide. Save after edits.",
  ],
}

const GATEWAY: ModuleHint = {
  title: "Payment gateway",
  lines: [
    "Public key id and mode are stored here; Razorpay secrets stay in API environment variables only.",
  ],
}

const DOCUMENTS: ModuleHint = {
  title: "Documents viewer",
  lines: [
    "Paste type (invoice / receipt / refund) and Mongo id from the URL query. PDFs are never served from a public folder — only through authenticated API routes.",
  ],
}

const rules: { test: RegExp; hint: ModuleHint }[] = [
  { test: /^\/dashboard$/, hint: DASHBOARD },
  { test: /^\/pos$/, hint: POS },
  { test: /^\/products(\/|$)/, hint: PRODUCTS },
  { test: /^\/categories$/, hint: CATEGORIES },
  { test: /^\/branches$/, hint: BRANCHES },
  { test: /^\/inventory(\/|$)/, hint: INVENTORY },
  { test: /^\/stock$/, hint: STOCK },
  { test: /^\/customers(\/|$)/, hint: CUSTOMERS },
  { test: /^\/suppliers(\/|$)/, hint: SUPPLIERS },
  { test: /^\/invoices$/, hint: INVOICES },
  { test: /^\/invoices\/[^/]+$/, hint: INVOICE_DETAIL },
  { test: /^\/payments$/, hint: PAYMENTS },
  { test: /^\/receipts$/, hint: RECEIPTS },
  { test: /^\/refunds$/, hint: REFUNDS },
  { test: /^\/gst$/, hint: GST },
  { test: /^\/users$/, hint: USERS },
  { test: /^\/users\/[^/]+$/, hint: USER_DETAIL },
  { test: /^\/roles$/, hint: ROLES },
  { test: /^\/settings\/gateway$/, hint: GATEWAY },
  { test: /^\/settings$/, hint: SETTINGS },
  { test: /^\/documents$/, hint: DOCUMENTS },
]

export const getModuleHint = (pathname: string): ModuleHint | null => {
  const p = pathname.split("?")[0] ?? pathname
  if (p.startsWith("/settings/guide")) return null
  for (const r of rules) {
    if (r.test.test(p)) return r.hint
  }
  return null
}
