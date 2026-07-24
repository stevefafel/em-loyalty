import { z } from "zod";

// Sticker-printer options offered on the self-registration form.
export const PRINTER_OPTIONS = ["None", "Godex", "Zebra", "Other"] as const;
export type PrinterOption = (typeof PRINTER_OPTIONS)[number];

export const PRINTER_OTHER_MAX = 100;

export const registerSchema = z
  .object({
    first_name: z.string().trim().min(1, "First name is required"),
    last_name: z.string().trim().min(1, "Last name is required"),
    email: z.email("Enter a valid email address").trim().toLowerCase(),
    shop_name: z.string().trim().min(1, "Shop name is required"),
    shop_address: z.string().trim().min(1, "Shop address is required"),
    shop_city: z.string().trim().min(1, "City is required"),
    shop_state: z.string().trim().min(1, "State is required"),
    printer_type: z.enum(PRINTER_OPTIONS),
    printer_other: z
      .string()
      .trim()
      .max(PRINTER_OTHER_MAX, `Please keep this under ${PRINTER_OTHER_MAX} characters`)
      .optional(),
  })
  .refine(
    (d) => d.printer_type !== "Other" || !!d.printer_other?.length,
    { path: ["printer_other"], message: "Please tell us which printer you use" }
  );

export type RegisterInput = z.infer<typeof registerSchema>;

/** Combine the separate address parts into the single Shop.address column. */
export function composeShopAddress(d: RegisterInput): string {
  return `${d.shop_address}, ${d.shop_city}, ${d.shop_state}`;
}

/** Normalize the printer answer into the single Shop.printer column. */
export function composePrinter(d: RegisterInput): string {
  return d.printer_type === "Other" ? `Other: ${d.printer_other}` : d.printer_type;
}
