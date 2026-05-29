import { NextRequest, NextResponse } from "next/server";

/**
 * Catch-all for relative asset requests made by self-hosted Chameleon SCORM
 * content.
 *
 * The Chameleon player builds asset URLs from an internal `appURL`. On its own
 * LMS that resolves to its CDN; served from our app on localhost the value is
 * never set, so the player emits requests like:
 *   /api/training/<id>/undefinedthemes/<theme>/app.css
 *   /api/training/<id>/undefinedcore/offline.gif?rand=...
 * (a literal "undefined" + the intended path) which would otherwise 404.
 *
 * The real assets live on the Chameleon CDN. We:
 *   - answer the frequent `offline.gif` connectivity probe with a 1x1 GIF
 *     (so the player sees it is online, without proxying on every heartbeat),
 *   - proxy `themes/` and `core/` asset requests to the CDN so the course
 *     loads its theme and styling.
 *
 * In production the player resolves `appURL` to the CDN directly, so the
 * browser fetches assets straight from the CDN and never hits this route.
 *
 * Static sibling routes ("scorm", "complete") take precedence over this
 * catch-all, so normal SCORM serving and completion are unaffected.
 */

const CDN_BASE = "https://chameleon-4-prod.s3.amazonaws.com/";

// Only these top-level CDN directories may be proxied (prevents an open proxy).
const PROXYABLE_DIRS = new Set(["themes", "core"]);

// 1x1 transparent GIF
const PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

function isConnectivityProbe(path: string[]): boolean {
  const last = path[path.length - 1]?.toLowerCase() ?? "";
  return last.startsWith("offline.gif");
}

function pixelResponse(includeBody: boolean) {
  return new NextResponse(includeBody ? PIXEL_GIF : null, {
    status: 200,
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
  });
}

/**
 * Map the requested segments to a CDN path, stripping the stray "undefined"
 * prefix the player prepends. Returns null if the target isn't a proxyable
 * CDN directory.
 */
function cdnUrlFor(path: string[]): string | null {
  const segs = [...path];
  if (segs[0]?.startsWith("undefined")) {
    segs[0] = segs[0].slice("undefined".length);
  }
  if (!segs[0] || !PROXYABLE_DIRS.has(segs[0])) return null;
  if (segs.some((s) => s === "..")) return null;
  return CDN_BASE + segs.join("/");
}

async function proxyFromCdn(url: string, includeBody: boolean) {
  const upstream = await fetch(url, { method: "GET" });
  if (!upstream.ok) {
    return new NextResponse(includeBody ? "Not found" : null, {
      status: upstream.status,
    });
  }
  const contentType =
    upstream.headers.get("content-type") || "application/octet-stream";
  const body = includeBody ? await upstream.arrayBuffer() : null;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Theme/core assets are effectively static.
      "Cache-Control": "public, max-age=3600",
    },
  });
}

async function handle(
  params: Promise<{ id: string; path: string[] }>,
  includeBody: boolean
) {
  const { path } = await params;

  if (isConnectivityProbe(path)) return pixelResponse(includeBody);

  const cdnUrl = cdnUrlFor(path);
  if (cdnUrl) {
    try {
      return await proxyFromCdn(cdnUrl, includeBody);
    } catch {
      return new NextResponse(includeBody ? "Upstream error" : null, {
        status: 502,
      });
    }
  }

  return includeBody
    ? NextResponse.json({ error: "Not found" }, { status: 404 })
    : new NextResponse(null, { status: 404 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  return handle(params, true);
}

export async function HEAD(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  return handle(params, false);
}
