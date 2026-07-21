import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/server";
import { STORAGE_BUCKETS } from "@/lib/constants";

/**
 * Issues one-time signed upload tokens so the browser can upload directly to
 * Storage without the anon key having any write access to buckets. The server
 * decides the object path; the client only picks the file.
 */

type Bucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

/** Object keys are generated server-side from a sanitized basename so a
 * client-supplied name can't place files under another shop's prefix. */
function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  return base.replace(/[^\w.\- ()]/g, "_");
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const bucket = body?.bucket as Bucket | undefined;
  const fileName = typeof body?.fileName === "string" ? sanitizeFileName(body.fileName) : "";
  const shopId = typeof body?.shopId === "string" ? body.shopId : null;

  if (!fileName) {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  }

  const isAdmin = session.role === "admin";
  let path: string;

  switch (bucket) {
    case STORAGE_BUCKETS.INVOICES: {
      if (!shopId) {
        return NextResponse.json({ error: "shopId is required" }, { status: 400 });
      }
      if (!isAdmin) {
        const membership = await prisma.userShop.findUnique({
          where: { user_id_shop_id: { user_id: session.userId, shop_id: shopId } },
        });
        if (!membership) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
      path = `${shopId}/${Date.now()}_${fileName}`;
      break;
    }
    case STORAGE_BUCKETS.TRAINING_PDFS:
      if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      path = `modules/${Date.now()}_${fileName}`;
      break;
    case STORAGE_BUCKETS.COLLATERAL_PDFS:
      if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      path = `admin/${Date.now()}_${fileName}`;
      break;
    case STORAGE_BUCKETS.SCORM_PACKAGES:
      if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      path = `packages/${Date.now()}_${fileName}`;
      break;
    default:
      return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("Failed to create signed upload URL", bucket, path, error);
    return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 });
  }

  return NextResponse.json({ data: { path: data.path, token: data.token } });
}
