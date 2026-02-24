import { z } from "zod";

export const quizSubmissionSchema = z.object({
  moduleId: z.string().uuid(),
  answers: z.array(z.number().min(0).max(3)).length(5),
});
