import { z } from "zod";

export const createCollateralSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  file_path: z.string().min(1, "File path is required"),
  category: z.string().optional(),
});

export const updateCollateralSchema = z.object({
  title: z.string().min(1, "Title is required").optional(),
  description: z.string().optional().nullable(),
  file_path: z.string().min(1, "File path is required").optional(),
  category: z.string().optional().nullable(),
});
