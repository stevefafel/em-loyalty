import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
const findMembership = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { userShop: { findUnique: (...a: unknown[]) => findMembership(...a) } },
}));

vi.mock("@/lib/session", () => ({
  getSession: () => getSession(),
  sealSession: async () => "sealed-cookie-value",
  SESSION_COOKIE: "session",
  sessionCookieOptions: () => ({ httpOnly: true, path: "/" }),
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function postReq(body: unknown, contentType = "application/json") {
  return new NextRequest("http://localhost:3000/api/session/shop", {
    method: "POST",
    headers: { "content-type": contentType },
    body: JSON.stringify(body),
  });
}

const SESSION = { userId: "u1", role: "user", shopId: "s1", expiresAt: 9e9 };

beforeEach(() => {
  getSession.mockReset();
  findMembership.mockReset();
});
afterEach(() => vi.resetModules());

describe("shop-switch route", () => {
  it("returns 415 when Content-Type is not application/json (CSRF guard)", async () => {
    const { POST } = await loadRoute();
    const res = await POST(postReq({ shopId: "s2" }, "text/plain"));
    expect(res.status).toBe(415);
  });

  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(postReq({ shopId: "s2" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user is not a member of the target shop", async () => {
    getSession.mockResolvedValue(SESSION);
    findMembership.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(postReq({ shopId: "s2" }));
    expect(res.status).toBe(403);
  });

  it("re-seals the session and returns 200 for a member", async () => {
    getSession.mockResolvedValue(SESSION);
    findMembership.mockResolvedValue({ user_id: "u1", shop_id: "s2" });
    const { POST } = await loadRoute();
    const res = await POST(postReq({ shopId: "s2" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain("session=");
  });
});
