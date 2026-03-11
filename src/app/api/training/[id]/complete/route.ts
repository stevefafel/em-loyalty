import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { quizSubmissionSchema } from "@/lib/validators/training";
import { POINTS_PER_TRAINING } from "@/lib/constants";

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
    answers: body.answers || [],
    scormScore: body.scormScore,
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
    select: { questions: true, title: true, content_type: true },
  });

  if (!module) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  let score: number;
  let total: number;

  if (module.content_type === "scorm" && parsed.data.scormScore !== undefined) {
    // SCORM modules report their own score as a percentage (0-100)
    score = parsed.data.scormScore;
    total = 100;
  } else {
    // PDF+Quiz modules: grade answers against correct_index
    const questions = module.questions as { correct_index: number }[];
    total = questions.length;
    score = 0;
    for (let i = 0; i < questions.length; i++) {
      if (parsed.data.answers[i] === questions[i].correct_index) {
        score++;
      }
    }
  }

  // Always append training log — never update
  await prisma.trainingLog.create({
    data: {
      user_id: session.userId,
      shop_id: session.shopId,
      module_id: id,
      score,
    },
  });

  // Award points once per year per module per shop
  let pointsAwarded = 0;
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const existingPointsEntry = await prisma.loyaltyLedger.findFirst({
    where: {
      shop_id: session.shopId,
      description: { startsWith: `Training: ` },
      created_at: { gte: yearStart },
      // Match this specific module by checking description contains module id
      AND: {
        description: { contains: id.slice(0, 8) },
      },
    },
  });

  if (!existingPointsEntry) {
    await prisma.$transaction([
      prisma.loyaltyLedger.create({
        data: {
          shop_id: session.shopId,
          points_delta: POINTS_PER_TRAINING,
          type: "credit",
          description: `Training: ${module.title} [${id.slice(0, 8)}]`,
        },
      }),
      prisma.shop.update({
        where: { id: session.shopId },
        data: {
          loyalty_points_balance: { increment: POINTS_PER_TRAINING },
          updated_at: new Date(),
        },
      }),
    ]);
    pointsAwarded = POINTS_PER_TRAINING;
  }

  return NextResponse.json({
    data: { score, total, pointsAwarded },
  });
}
