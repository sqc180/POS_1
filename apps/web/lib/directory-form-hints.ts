/** Labels, placeholders, and helper copy for customer / supplier directory forms. */

import { z } from "zod"

/** Matches API: empty string omitted; otherwise must be a valid email. */
export const optionalEmailSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().email().optional(),
)

export type PartyField = "name" | "phone" | "email" | "gstin" | "address" | "notes"

type PartyKind = "customer" | "supplier"

const notesDescription: Record<PartyKind, string> = {
  customer: "Internal only — not shown on the POS receipt unless you add it to invoice templates later.",
  supplier: "Internal only — e.g. payment terms, alternate contact, or GRN notes.",
}

export function partyFieldMeta(
  field: PartyField,
  kind: PartyKind,
): { label: string; placeholder: string; description: string } {
  const base = {
    name: {
      label: "Display name",
      placeholder: kind === "customer" ? "e.g. Priya Sharma" : "e.g. Fresh Foods Distributors",
      description:
        kind === "customer"
          ? "Shown in POS customer search, invoices, and this directory."
          : "Shown on purchase flows and supplier directory.",
    },
    phone: {
      label: "Phone",
      placeholder: "e.g. +91 98765 43210",
      description: "Optional. Helpful for lookups and printed contact blocks.",
    },
    email: {
      label: "Email",
      placeholder: "contact@example.com",
      description: "Optional. Use a valid address or leave blank.",
    },
    gstin: {
      label: "GSTIN",
      placeholder: "e.g. 22AAAAA0000A1Z5",
      description: "15-character GST number for tax invoices when applicable.",
    },
    address: {
      label: "Address",
      placeholder: "Building, street, city, state — PIN code",
      description: "Optional. Used on documents when you include billing address.",
    },
    notes: {
      label: "Internal notes",
      placeholder: kind === "customer" ? "e.g. Credit limit approved · prefers SMS" : "e.g. Net 30 · delivery Tuesdays",
      description: notesDescription[kind],
    },
  } satisfies Record<PartyField, { label: string; placeholder: string; description: string }>

  return base[field]
}
