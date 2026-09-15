import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

// Headers ExxonMobil's vulnerability assessment asked for: 79372 (missing
// security headers), 79371 (frameable response), 79373 (technology disclosure).

// The matcher Next itself uses for `source`, so path assertions match runtime.
const { pathToRegexp } = createRequire(import.meta.url)(
  "next/dist/compiled/path-to-regexp",
) as { pathToRegexp: (path: string) => RegExp };

async function headersFor(source: string): Promise<Record<string, string>> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const rule = rules.find((r) => r.source === source);
  return Object.fromEntries((rule?.headers ?? []).map((h) => [h.key, h.value]));
}

/** Cache-Control a path receives from next.config, or undefined when none applies. */
async function configCacheControlFor(path: string): Promise<string | undefined> {
  const rules = (await nextConfig.headers?.()) ?? [];
  return rules
    .filter((r) => pathToRegexp(r.source).test(path))
    .flatMap((r) => r.headers)
    .findLast((h) => h.key === "Cache-Control")?.value;
}

describe("security headers (next.config)", () => {
  it("sends the security headers on every route", async () => {
    const headers = await headersFor("/:path*");
    expect(headers).toMatchObject({
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });

  it("allows framing only by the portal itself (SCORM training frames our own pages)", async () => {
    const headers = await headersFor("/:path*");
    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(headers["Content-Security-Policy"]).toBe("frame-ancestors 'self'");
  });

  it("marks API responses no-store so authenticated JSON is never cached", async () => {
    for (const path of ["/api/users", "/api/invoices/abc/extract", "/api/training", "/api/training/abc"]) {
      expect(await configCacheControlFor(path), path).toBe("private, no-store");
    }
  });

  it("leaves training content to set its own Cache-Control (config headers override route headers)", async () => {
    for (const path of ["/api/training/abc/scorm", "/api/training/abc/undefinedcore/app.css"]) {
      expect(await configCacheControlFor(path), path).toBeUndefined();
    }
  });

  it("does not advertise the framework via X-Powered-By", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
