import { z } from "zod";

export const invoiceExtractionResponseSchema = z.object({
  vendor_name: z.string().nullable(),
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable(),
  subtotal: z.number().nullable(),
  tax_amount: z.number().nullable(),
  total_amount: z.number().nullable(),
  currency: z.string().nullable(),
  line_items: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().nullable(),
      unit_price: z.number().nullable(),
      amount: z.number(),
    })
  ),
});

export type InvoiceExtractionResponse = z.infer<
  typeof invoiceExtractionResponseSchema
>;
