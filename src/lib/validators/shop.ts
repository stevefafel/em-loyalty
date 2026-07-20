import { z } from "zod";

// Coerce empty strings to null so cleared optional fields are stored as null.
const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

const optionalText = z.preprocess(
  emptyToNull,
  z.string().trim().nullable().optional()
);

export const shopUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  address: optionalText,
  phone: optionalText,
  // Steer platform IDs are UUIDs.
  steer_shop_id: z.preprocess(
    emptyToNull,
    z.uuid("Steer Shop ID must be a valid UUID").nullable().optional()
  ),
  // AutoOps IDs are free-form (e.g. "cl_dfeeb55c170a4810834a02aeb99ec9fe").
  autoops_shop_id: optionalText,
  program_status: z
    .enum(["new", "pending", "approved", "rejected"])
    .optional(),
  // true → stamp sent_welcome_packet_at now; false → clear it.
  sent_welcome_packet: z.boolean().optional(),
});

export type ShopUpdateInput = z.infer<typeof shopUpdateSchema>;
