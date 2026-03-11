import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createTrainingModuleSchema } from "@/lib/validators/training-module";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await prisma.trainingModule.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        pdf_path: true,
        scorm_path: true,
        content_type: true,
        questions: true,
        created_at: true,
      },
      orderBy: { created_at: "asc" },
    });

    return NextResponse.json({ data });
  } catch (err) {
    console.error("GET /api/training error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createTrainingModuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = await prisma.trainingModule.create({
    data: parsed.data,
  });

  return NextResponse.json({ data }, { status: 201 });
}
