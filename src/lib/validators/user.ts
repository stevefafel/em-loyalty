import { z } from "zod";

// Coerce empty strings to null so cleared optional fields are stored as null.
const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

const optionalText = z.preprocess(
  emptyToNull,
  z.string().trim().nullable().optional()
);

// Emails are normalized (trim + lowercase) to match the Keycloak callback
// mapping, which resolves identities by normalized email.
const normalizedEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

export const userCreateSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required"),
  last_name: z.string().trim().min(1, "Last name is required"),
  email: normalizedEmail,
  phone: optionalText,
  role: z.enum(["admin", "user"]).default("user"),
  shop_ids: z.array(z.uuid()).optional(),
});

export const userUpdateSchema = userCreateSchema.partial();

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
