import { z } from "zod";
import { MIN_INITIAL_INVOICE } from "../constants";

export const invoiceUploadSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  isInitial: z.boolean(),
});

export const initialInvoiceSchema = invoiceUploadSchema.refine(
  (data) => !data.isInitial || data.amount >= MIN_INITIAL_INVOICE,
  {
    message: `Initial invoice must be at least $${MIN_INITIAL_INVOICE}`,
    path: ["amount"],
  }
);

// Admin manual override of AI-extracted values (and the authoritative invoice
// amount) during review. Every field is optional; only provided keys are
// written. `null` clears an extraction field; a "YYYY-MM-DD" string sets the
// date-only invoice_date.
const optionalMoney = z
  .number()
  .nonnegative("Must be zero or more")
  .nullable()
  .optional();

const optionalText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().nullable().optional()
);

export const invoiceOverrideSchema = z.object({
  amount: z.number().positive("Amount must be positive").optional(),
  extraction: z
    .object({
      vendor_name: optionalText,
      invoice_number: optionalText,
      // Date-only string (YYYY-MM-DD) or null; validated/normalized in the route.
      invoice_date: z
        .preprocess(
          (v) => (typeof v === "string" && v.trim() === "" ? null : v),
          z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
            .nullable()
            .optional()
        ),
      subtotal: optionalMoney,
      tax_amount: optionalMoney,
      total_amount: optionalMoney,
    })
    .optional(),
});

export type InvoiceOverrideInput = z.infer<typeof invoiceOverrideSchema>;
