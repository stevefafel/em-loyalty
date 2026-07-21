import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { STORAGE_BUCKETS } from "@/lib/constants";

const SIGNED_URL_TTL_SECONDS = 300;

/** Signed read URLs for the private invoices bucket. Only admins view
 * uploaded invoice files (admin invoices + shop detail pages). */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKETS.INVOICES)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Failed to create signed URL" }, { status: 500 });
  }

  return NextResponse.json({ data: { url: data.signedUrl } });
}
