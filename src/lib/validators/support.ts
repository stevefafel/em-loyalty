import { z } from "zod";

/** A shop user opens a thread with a subject plus the first message. */
export const supportConversationCreateSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "Subject is required")
    .max(120, "Keep the subject under 120 characters"),
  body: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(5000, "Keep the message under 5000 characters"),
  // No shop_id: the shop always comes from the session, never the client.
});

export type SupportConversationCreateInput = z.infer<
  typeof supportConversationCreateSchema
>;
