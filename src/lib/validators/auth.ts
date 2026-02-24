import { z } from "zod";

export const mockLoginSchema = z.object({
  userId: z.string().uuid(),
  shopId: z.string().uuid().optional(),
});
