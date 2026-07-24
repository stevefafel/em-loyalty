import { z } from "zod";

export const notificationCreateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(120, "Keep the title under 120 characters"),
  body: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(1000, "Keep the message under 1000 characters"),
  // null / omitted = broadcast to every shop; a UUID targets one shop.
  shop_id: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.uuid("Invalid shop").nullable().optional()
  ),
});

export type NotificationCreateInput = z.infer<typeof notificationCreateSchema>;
