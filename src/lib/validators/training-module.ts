import { z } from "zod";

const quizQuestionSchema = z.object({
  question: z.string().min(1, "Question text is required"),
  options: z.array(z.string().min(1)).length(4, "Must have exactly 4 options"),
  correct_index: z.number().min(0).max(3),
});

export const createTrainingModuleSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  pdf_path: z.string().optional().nullable(),
  questions: z.array(quizQuestionSchema).default([]),
});

export const updateTrainingModuleSchema = z.object({
  title: z.string().min(1, "Title is required").optional(),
  description: z.string().optional().nullable(),
  pdf_path: z.string().optional().nullable(),
  questions: z.array(quizQuestionSchema).optional(),
});
