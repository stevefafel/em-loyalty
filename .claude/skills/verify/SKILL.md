---
name: verify
description: Build, launch, and drive em-loyalty locally to verify changes at the running app.
---

# Verifying em-loyalty locally

## Launch

```bash
npm run dev -- --port 3456   # ready in ~1s; only ONE `next dev` instance can run (.next/dev/lock)
```

`.env.local` has `APP_ENV=local` + `AUTH_MODE=mock`, so auth uses the mock user picker — no Keycloak needed.

## Get a logged-in session (headless)

Mock user IDs are seeded in the DB and serialized into the login page RSC payload:

```bash
curl -s http://localhost:3456/login | grep -oE '\\"id\\":\\"[^"\\]+\\",\\"email\\":\\"[^"\\]+\\"'
# admin:      a1000000-0000-4000-a000-000000000001 (admin@mobil1.com)
# shop owner: b2000000-0000-4000-a000-000000000001 (owner@quicklube.com)

curl -s -c cookies.txt -X POST http://localhost:3456/api/auth/mock \
  -H "Content-Type: application/json" \
  -d '{"userId":"a1000000-0000-4000-a000-000000000001"}'
curl -s -b cookies.txt -L http://localhost:3456/   # lands on /dashboard
```

The session cookie is named `session`. Shop-scoped users may need `"shopId"` in the mock login body.

## Screenshots

No Playwright/puppeteer in the repo. Headless Chrome via CDP works well
(Node 22's built-in WebSocket client): launch
`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new
--remote-debugging-port=9222 --user-data-dir=$(mktemp -d) about:blank`,
connect to `webSocketDebuggerUrl` from `http://127.0.0.1:9222/json/list`, then
`Network.setCookie` (name `session`), `Page.navigate`, `Page.captureScreenshot`.

Gotchas:
- Plain `--screenshot` + `--virtual-time-budget` hangs against the dev server; use CDP.
- The site footer sits below the fold — `document.querySelector("footer").scrollIntoView({block:"end"})` before capturing.
- The Next dev-tools "N" badge overlays the bottom-left corner of screenshots.
