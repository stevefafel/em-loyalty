import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { quizSubmissionSchema } from "@/lib/validators/training";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || !session.shopId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const parsed = quizSubmissionSchema.safeParse({
    moduleId: id,
    answers: body.answers,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.message },
      { status: 400 }
    );
  }

  // Fetch module to grade
  const module = await prisma.trainingModule.findUnique({
    where: { id },
    select: { questions: true },
  });

  if (!module) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  const questions = module.questions as { correct_index: number }[];
  let score = 0;
  for (let i = 0; i < questions.length; i++) {
    if (parsed.data.answers[i] === questions[i].correct_index) {
      score++;
    }
  }

  // Always append — never update
  await prisma.trainingLog.create({
    data: {
      user_id: session.userId,
      shop_id: session.shopId,
      module_id: id,
      score,
    },
  });

  return NextResponse.json({ data: { score, total: questions.length } });
}
