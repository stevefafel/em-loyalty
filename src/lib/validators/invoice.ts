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
