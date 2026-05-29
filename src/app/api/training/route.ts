import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createTrainingModuleSchema } from "@/lib/validators/training-module";
import { createAdminClient } from "@/lib/supabase/server";
import { STORAGE_BUCKETS } from "@/lib/constants";
import { isScormCollection, extractScormCourses } from "@/lib/scorm";
import JSZip from "jszip";

/**
 * If the uploaded SCORM zip is a collection (a bundle of individual course
 * zips), split it into one module per course and remove the original bundle.
 * Returns the created modules, or null if the upload was a normal single
 * package and should be handled by the default create path.
 */
async function handleScormCollection(
  scormPath: string,
  description?: string | null
) {
  const supabase = createAdminClient();
  const bucket = STORAGE_BUCKETS.SCORM_PACKAGES;

  const { data: blob, error } = await supabase.storage
    .from(bucket)
    .download(scormPath);
  if (error || !blob) {
    throw new Error("Failed to download uploaded SCORM package");
  }

  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  if (!isScormCollection(zip)) return null;

  const courses = await extractScormCourses(zip);
  if (courses.length === 0) return null;

  const created = [];
  for (let i = 0; i < courses.length; i++) {
    const course = courses[i];
    const path = `packages/${Date.now()}_${i}_${course.filename}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, course.buffer, {
        contentType: "application/zip",
        upsert: false,
      });
    if (uploadError) {
      throw new Error(`Failed to store course "${course.title}"`);
    }

    const mod = await prisma.trainingModule.create({
      data: {
        title: course.title,
        description: description || null,
        content_type: "scorm",
        scorm_path: path,
        questions: [],
      },
    });
    created.push(mod);
  }

  // Remove the original bundle so it isn't left as an unusable package.
  await supabase.storage.from(bucket).remove([scormPath]);

  return created;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const modules = await prisma.trainingModule.findMany({
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

    // Annotate each module with this user's completion status.
    const logs = await prisma.trainingLog.groupBy({
      by: ["module_id"],
      where: { user_id: session.userId },
      _max: { completed_at: true },
    });
    const completionByModule = new Map(
      logs.map((l) => [l.module_id, l._max.completed_at])
    );

    const data = modules.map((m) => ({
      ...m,
      completed: completionByModule.has(m.id),
      completed_at: completionByModule.get(m.id) ?? null,
    }));

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

  // SCORM uploads may be a "collection" bundle of several course packages.
  // Split those into one module per course before normal validation, since
  // the bundle has no single title of its own.
  if (body.content_type === "scorm" && body.scorm_path) {
    try {
      const created = await handleScormCollection(
        body.scorm_path,
        body.description
      );
      if (created) {
        return NextResponse.json(
          { data: created, count: created.length, collection: true },
          { status: 201 }
        );
      }
    } catch (err) {
      console.error("SCORM collection split failed:", err);
      return NextResponse.json(
        { error: "Failed to process SCORM package bundle." },
        { status: 500 }
      );
    }
  }

  const parsed = createTrainingModuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = await prisma.trainingModule.create({
    data: parsed.data,
  });

  return NextResponse.json({ data }, { status: 201 });
}
