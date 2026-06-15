import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const discovery = vi.fn();

vi.mock("@/lib/auth/config", () => ({
  keycloakRedirectUri: () => "http://localhost:3000/api/auth/callback",
}));

vi.mock("@/lib/auth/oidc", () => ({
  getOidcConfig: () => discovery(),
  txnCookieName: (state: string) => `oidc_txn_${state}`,
  txnCookieOptions: () => ({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 }),
  client: {
    randomPKCECodeVerifier: () => "verifier-123",
    calculatePKCECodeChallenge: async () => "challenge-123",
    randomState: () => "STATE1",
    randomNonce: () => "NONCE1",
    buildAuthorizationUrl: () =>
      new URL("http://kc/realms/steer/protocol/openid-connect/auth?x=1"),
  },
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

const req = () => new NextRequest("http://localhost:3000/api/auth/login");

afterEach(() => vi.resetModules());

describe("login route", () => {
  it("redirects to Keycloak and sets a per-state httpOnly txn cookie", async () => {
    discovery.mockResolvedValue({});
    const { GET } = await loadRoute();
    const res = await GET(req());
    expect(res.headers.get("location")).toContain("/protocol/openid-connect/auth");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("oidc_txn_STATE1=");
    expect(setCookie.toLowerCase()).toContain("httponly");
    // verifier + nonce are stored in the cookie value (URL-encoded JSON)
    expect(decodeURIComponent(setCookie)).toContain("verifier-123");
    expect(decodeURIComponent(setCookie)).toContain("NONCE1");
  });

  it("redirects /login?error=unavailable when discovery fails (no 500, no cookie)", async () => {
    discovery.mockRejectedValue(new Error("keycloak down"));
    const { GET } = await loadRoute();
    const res = await GET(req());
    expect(res.headers.get("location")).toContain("/login?error=unavailable");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
