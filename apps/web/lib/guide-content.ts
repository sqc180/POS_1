/** Static copy for in-app guide — kept out of the page for readability. */

export type ModuleHelp = {
  summary: string
  bullets: readonly string[]
}

export const MODULE_HELP: Record<string, ModuleHelp> = {
  dashboard: {
    summary: "Landing view after sign-in. Use it as a quick orientation point before jumping into operations.",
    bullets: [
      "Shows your tenant name and business type (retail vs supermart).",
      "Open the sidebar Guide anytime for help and UI reference.",
    ],
  },
  pos: {
    summary: "Point of sale: build a cart, preview GST totals, save drafts, complete sales, take payment, and issue receipts.",
    bullets: [
      "Search products with the command palette or scan/type a barcode and press Enter.",
      "Draft → Complete applies stock rules and final invoice numbering.",
      "Cash pay and UPI QR use Payments; receipt issues when the invoice is fully paid.",
    ],
  },
  products: {
    summary: "Catalog: SKU, barcode, prices, GST slab, and whether stock is tracked per item.",
    bullets: ["Inactive products are excluded from POS picks.", "GST slabs drive tax lines on invoices and previews."],
  },
  categories: {
    summary: "Organize products into a hierarchy for browsing and reporting.",
    bullets: ["Use clear names; SKUs stay unique at the product level."],
  },
  branches: {
    summary: "Register shops, warehouses, and other sites with a stable branch code used on every stock row.",
    bullets: [
      "Codes like main or wh-north become branchId on inventory — choose once and keep them.",
      "Business settings picks the default branch for POS when stock is tracked.",
    ],
  },
  inventory: {
    summary: "Per-branch stock levels, reorder hints, and links to the underlying product.",
    bullets: [
      "Branch labels come from Branches & locations when those records exist.",
      "POS stock movements use your default branch from business settings.",
    ],
  },
  stock: {
    summary: "Manual movements and history — adjustments, transfers, and audit-friendly references.",
    bullets: [
      "Pick the exact product + branch row; labels align with Branches & locations.",
      "Invoice complete/cancel also writes stock movements automatically when trackStock is on.",
    ],
  },
  customers: {
    summary: "Walk-in or named customers; optional phone and GSTIN for invoices.",
    bullets: ["Attach a customer on POS before saving a draft if you need it on the invoice."],
  },
  suppliers: {
    summary: "Vendor records for purchase-side workflows and reference data.",
    bullets: ["Keep GSTIN and contact details current for compliance paperwork."],
  },
  billing: {
    summary: "Invoices: drafts, completion, cancellation, PDF export, and payment state.",
    bullets: ["Completed invoices with payments cannot be cancelled until refunds are handled.", "PDFs use server-rendered layouts with tenant footers."],
  },
  payments: {
    summary: "All tender recorded against invoices — cash, card, QR, Razorpay.",
    bullets: ["Open a row’s Details sheet for provider reference and idempotency metadata.", "Overpay is blocked at the API."],
  },
  receipts: {
    summary: "One receipt per fully paid invoice; download PDF or open in Documents viewer.",
    bullets: ["Issue from POS after balance hits zero, or from the receipts list when available."],
  },
  refunds: {
    summary: "Refunds cap to paid minus prior refunds; completing adjusts invoice balance.",
    bullets: ["Stock is not auto-restored in this version — handle inventory separately if needed."],
  },
  gst: {
    summary: "GST slabs (CGST/SGST/IGST rates) seeded at onboarding; tune to your catalog.",
    bullets: ["Default intra-state vs IGST behavior follows business tax settings."],
  },
  users: {
    summary: "Invite staff with roles that map to permissions (owner, admin, cashier, etc.).",
    bullets: ["Cashiers get POS, billing, and payments for checkout flows."],
  },
  roles: {
    summary: "Reference for what each role can access in this product.",
    bullets: ["Actual enforcement is server-side; this page is a quick map for operators."],
  },
  settings: {
    summary: "Business defaults: branches, document prefixes, tax mode, negative stock policy.",
    bullets: ["Gateway settings configure Razorpay key id and UPI fallback; secrets stay on the server."],
  },
  gateway: {
    summary: "Payment provider mode and public key id; Razorpay secret and webhook secret live in API env.",
    bullets: ["UPI VPA is used when Razorpay order flow is not available."],
  },
  documents: {
    summary: "Open invoice, receipt, or refund PDFs by query string for printing or review.",
    bullets: ["Example: ?type=invoice&id=<mongo id> with a valid session."],
  },
  audit: {
    summary: "Immutable activity trail for sensitive actions when exposed in your build.",
    bullets: ["Useful for reconciling who completed invoices or changed gateway settings."],
  },
}

export const DEFAULT_MODULE_HELP: ModuleHelp = {
  summary: "This area is part of your workspace navigation. Open it from the sidebar to work with live data.",
  bullets: ["Permissions may hide items for some roles.", "All writes are validated on the API."],
}

export const QUICK_START_STEPS: readonly { title: string; detail: string }[] = [
  {
    title: "Products & stock",
    detail:
      "Register shops or warehouses under Branches & locations, set your default branch in Settings, then add products and inventory rows for that code.",
  },
  { title: "Try POS preview", detail: "Add lines in POS and use Preview totals to confirm tax before saving a draft." },
  { title: "Complete & settle", detail: "Complete the invoice (stock out), record payment, then issue a receipt when fully paid." },
  { title: "Documents", detail: "Download PDFs from invoice detail or the Documents viewer for archival." },
] as const
