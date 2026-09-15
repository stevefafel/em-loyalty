import type { NextConfig } from "next";

/**
 * Security response headers, from ExxonMobil's vulnerability assessment
 * (findings 79372, 79371, 79373).
 *
 * Framing is SAMEORIGIN, not DENY: the SCORM player embeds the portal's own
 * /api/training/.../scorm pages in an iframe, and DENY would break training.
 * External sites still can't frame the portal.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Drops `X-Powered-By: Next.js`. Vercel's own Server / X-Vercel-* headers
  // are added by the platform and can't be removed here.
  poweredByHeader: false,

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Authenticated JSON must never be cached by a browser or proxy. A config
      // header overrides one the route sets itself, so /api/training/<id>/...
      // (SCORM content and CDN assets, which set their own caching) is excluded
      // — except /complete, which sets none and gets no-store explicitly.
      {
        source: "/api/:path((?!training/[^/]+/).*)",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/api/training/:id/complete",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
