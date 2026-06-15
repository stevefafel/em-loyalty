import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SECRET = Buffer.from(new Uint8Array(32).fill(5)).toString("base64");

const findUser = vi.fn();
const findShops = vi.fn();
const grant = vi.fn();
const buildEndSessionUrl = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => findUser(...a) },
    userShop: { findMany: (...a: unknown[]) => findShops(...a) },
  },
}));

let cookieJar: Record<string, string>;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar[name] !== undefined ? { value: cookieJar[name] } : undefined,
  }),
}));

vi.mock("@/lib/auth/oidc", () => ({
  getOidcConfig: async () => ({}),
  clearTxnCookies: () => {},
  TXN_VERIFIER: "oidc_verifier",
  TXN_STATE: "oidc_state",
  TXN_NONCE: "oidc_nonce",
  client: {
    authorizationCodeGrant: (...a: unknown[]) => grant(...a),
    buildEndSessionUrl: (...a: unknown[]) => buildEndSessionUrl(...a),
  },
}));

function fullTxn() {
  cookieJar = { oidc_verifier: "v", oidc_state: "s", oidc_nonce: "n" };
}

async function loadRoute() {
  vi.resetModules();
  process.env.SESSION_SECRET = SECRET;
  process.env.APP_ENV = "local";
  return import("./route");
}

const req = () =>
  new NextRequest("http://localhost:3000/api/auth/callback?code=abc&state=s");

beforeEach(() => {
  findUser.mockReset();
  findShops.mockReset().mockResolvedValue([]);
  grant.mockReset();
  buildEndSessionUrl.mockReset();
  fullTxn();
});
afterEach(() => vi.resetModules());

describe("callback route", () => {
  it("redirects /login?error=state when the nonce cookie is missing (fail closed)", async () => {
    cookieJar = { oidc_verifier: "v", oidc_state: "s" }; // no nonce
    const { GET } = await loadRoute();
    const res = await GET(req());
    expect(res.headers.get("location")).toContain("/login?error=state");
    expect(grant).not.toHaveBeenCalled();
  });

  it("redirects /login?error=exchange when the code exchange throws", async () => {
    grant.mockRejectedValue(new Error("bad code"));
    const { GET } = await loadRoute();
    const res = await GET(req());
    expect(res.headers.get("location")).toContain("/login?error=exchange");
  });

  it("ends the Keycloak session on deny (no matching user) to avoid a loop", async () => {
    grant.mockResolvedValue({
      claims: () => ({ email: "ghost@steer.io", email_verified: true }),
      id_token: "ID-TOK",
    });
    findUser.mockResolvedValue(null);
    buildEndSessionUrl.mockReturnValue(
      new URL("http://kc/realms/steer/protocol/openid-connect/logout?x=1"),
    );
    const { GET } = await loadRoute();
    const res = await GET(req());
    expect(buildEndSessionUrl).toHaveBeenCalled();
    // post_logout_redirect_uri must point back to /access-denied
    expect(buildEndSessionUrl.mock.calls[0][1].post_logout_redirect_uri).toContain(
      "/access-denied",
    );
    expect(res.headers.get("location")).toContain("/protocol/openid-connect/logout");
  });

  it("seals a session and redirects /dashboard for a verified, provisioned user", async () => {
    grant.mockResolvedValue({
      claims: () => ({ email: "steve@steer.io", email_verified: true }),
      id_token: "ID-TOK",
    });
    findUser.mockResolvedValue({ id: "u1", role: "admin" });
    const { GET } = await loadRoute();
    const res = await GET(req());
    expect(res.headers.get("location")).toContain("/dashboard");
    expect(res.headers.get("set-cookie") ?? "").toContain("session=");
  });
});
