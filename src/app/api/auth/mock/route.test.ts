import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SECRET = Buffer.from(new Uint8Array(32).fill(3)).toString("base64");
const USER_ID = "00000000-0000-4000-8000-000000000012";

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

function setMode(mode: "mock" | "keycloak") {
  process.env.SESSION_SECRET = SECRET;
  process.env.AUTH_MODE = "mock";
  process.env.APP_ENV = mode === "mock" ? "local" : "production";
}

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/auth/mock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const originalEnv = { ...process.env };
beforeEach(() => findUnique.mockReset());
afterEach(() => {
  process.env = { ...originalEnv };
});

describe("mock auth route", () => {
  it("returns 404 in keycloak mode (POST disabled outside local)", async () => {
    setMode("keycloak");
    const { POST } = await loadRoute();
    const res = await POST(postReq({ userId: USER_ID }));
    expect(res.status).toBe(404);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown user in mock mode", async () => {
    setMode("mock");
    findUnique.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(postReq({ userId: USER_ID }));
    expect(res.status).toBe(404);
  });

  it("seals an httpOnly session cookie for a known user", async () => {
    setMode("mock");
    findUnique.mockResolvedValue({
      id: USER_ID,
      email: "steve@steer.io",
      first_name: "Steve",
      last_name: "Fafel",
      role: "admin",
    });
    const { POST } = await loadRoute();
    const res = await POST(postReq({ userId: USER_ID }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("session=");
    expect(setCookie.toLowerCase()).toContain("httponly");
    // The sealed value is opaque — the role must not be readable in the cookie.
    expect(setCookie).not.toContain("admin");
  });

  it("DELETE clears the session cookie in mock mode", async () => {
    setMode("mock");
    const { DELETE } = await loadRoute();
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain("session=");
  });
});
