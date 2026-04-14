import { z } from "zod"

/** Integer paise (non-negative) for request bodies during migration alongside rupee decimals. */
export const paiseNonNegativeSchema = z.number().int().nonnegative().lte(Number.MAX_SAFE_INTEGER)
