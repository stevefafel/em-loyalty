import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getScormPackageUrl } from "@/lib/supabase/storage";
import JSZip from "jszip";

// Cache extracted packages in memory for the session (avoids re-downloading)
const zipCache = new Map<string, { zip: JSZip; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getZip(scormPath: string): Promise<JSZip> {
  const cached = zipCache.get(scormPath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.zip;
  }

  const { url, error } = await getScormPackageUrl(scormPath);
  if (error || !url) {
    throw new Error("Failed to get SCORM package URL");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to download SCORM package");
  }

  const buffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  zipCache.set(scormPath, { zip, timestamp: Date.now() });
  return zip;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".xml": "application/xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".swf": "application/x-shockwave-flash",
};

function getMimeType(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const filePath = req.nextUrl.searchParams.get("file") || "index.html";

  const module = await prisma.trainingModule.findUnique({
    where: { id },
    select: { scorm_path: true, content_type: true },
  });

  if (!module || module.content_type !== "scorm" || !module.scorm_path) {
    return NextResponse.json({ error: "SCORM content not found" }, { status: 404 });
  }

  try {
    const zip = await getZip(module.scorm_path);

    // Try to find the file - handle cases where content is in a subfolder
    let zipFile = zip.file(filePath);
    if (!zipFile) {
      // Try to find it by checking all files
      const allFiles = Object.keys(zip.files);
      const match = allFiles.find(
        (f) => f.endsWith(`/${filePath}`) || f === filePath
      );
      if (match) {
        zipFile = zip.file(match);
      }
    }

    if (!zipFile || zipFile.dir) {
      // If requesting root, try to find the entry point from imsmanifest.xml
      if (filePath === "index.html") {
        const manifest = zip.file("imsmanifest.xml") ||
          Object.values(zip.files).find((f) => f.name.endsWith("imsmanifest.xml"));

        if (manifest) {
          const manifestContent = await manifest.async("text");
          const hrefMatch = manifestContent.match(/href="([^"]+\.html?)"/i);
          if (hrefMatch) {
            const entryPoint = hrefMatch[1];
            const entryFile = zip.file(entryPoint) ||
              Object.values(zip.files).find((f) => f.name.endsWith(`/${entryPoint}`));
            if (entryFile) {
              zipFile = entryFile;
            }
          }
        }
      }
    }

    if (!zipFile || zipFile.dir) {
      return NextResponse.json({ error: "File not found in package" }, { status: 404 });
    }

    const content = await zipFile.async("arraybuffer");
    const mimeType = getMimeType(zipFile.name);

    return new NextResponse(content, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to extract SCORM content" },
      { status: 500 }
    );
  }
}
