import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SECRET = Buffer.from(new Uint8Array(32).fill(5)).toString("base64");

const findUser = vi.fn();
const updateUser = vi.fn();
const findShops = vi.fn();
const grant = vi.fn();
const buildEndSessionUrl = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUser(...a),
      update: (...a: unknown[]) => updateUser(...a),
    },
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
  clearTxnCookie: () => {},
  txnCookieName: (state: string) => `oidc_txn_${state}`,
  client: {
    authorizationCodeGrant: (...a: unknown[]) => grant(...a),
    buildEndSessionUrl: (...a: unknown[]) => buildEndSessionUrl(...a),
  },
}));

// Valid per-state transaction cookie for state "s".
function validTxn() {
  cookieJar = { oidc_txn_s: JSON.stringify({ verifier: "v", nonce: "n" }) };
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
  updateUser.mockReset().mockResolvedValue({});
  findShops.mockReset().mockResolvedValue([]);
  grant.mockReset();
  buildEndSessionUrl.mockReset();
  validTxn();
});

/** findUnique stub keyed on the where clause: keycloak_id lookup vs email lookup. */
function stubLookups(users: {
  bySub?: Record<string, unknown> | null;
  byEmail?: Record<string, unknown> | null;
}) {
  findUser.mockImplementation((args: { where: Record<string, unknown> }) => {
    if ("keycloak_id" in args.where) return Promise.resolve(users.bySub ?? null);
    return Promise.resolve(users.byEmail ?? null);
  });
}
afterEach(() => vi.resetModules());

describe("callback route", () => {
  it("redirects /login?error=state when the transaction cookie is missing (fail closed)", async () => {
    cookieJar = {}; // no oidc_txn_s
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
    findUser.mockResolvedValue({ id: "u1", role: "admin", keycloak_id: null });
    const { GET } = await loadRoute();
    const res = await GET(req());
    expect(res.headers.get("location")).toContain("/dashboard");
    expect(res.headers.get("set-cookie") ?? "").toContain("session=");
    // No sub claim → email path only, and nothing to stamp.
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("matches a linked user by sub even when the token email differs from the row email", async () => {
    grant.mockResolvedValue({
      claims: () => ({
        email: "renamed@steer.io",
        email_verified: true,
        sub: "SUB-1",
      }),
      id_token: "ID-TOK",
    });
    stubLookups({ bySub: { id: "u1", role: "admin", keycloak_id: "SUB-1" } });
    const { GET } = await loadRoute();
    const res = await GET(req());
    expect(res.headers.get("location")).toContain("/dashboard");
    // Matched on the first (keycloak_id) lookup; no email fallback, no re-stamp.
    expect(findUser).toHaveBeenCalledTimes(1);
    expect(findUser.mock.calls[0][0].where).toEqual({ keycloak_id: "SUB-1" });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("links an unlinked user on verified email match by stamping the sub", async () => {
    grant.mockResolvedValue({
      claims: () => ({
        email: "steve@steer.io",
        email_verified: true,
        sub: "SUB-1",
      }),
      id_token: "ID-TOK",
    });
    stubLookups({ byEmail: { id: "u1", role: "admin", keycloak_id: null } });
    const { GET } = await loadRoute();
    const res = await GET(req());
    expect(res.headers.get("location")).toContain("/dashboard");
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { keycloak_id: "SUB-1" },
    });
  });

  it("re-stamps the link when the email matches but the stored sub differs (identity handoff)", async () => {
    grant.mockResolvedValue({
      claims: () => ({
        email: "handoff@steer.io",
        email_verified: true,
        sub: "SUB-NEW",
      }),
      id_token: "ID-TOK",
    });
    stubLookups({ byEmail: { id: "u2", role: "user", keycloak_id: "SUB-OLD" } });
    findShops.mockResolvedValue([{ shop_id: "s1" }]);
    const { GET } = await loadRoute();
    const res = await GET(req());
    expect(res.headers.get("location")).toContain("/dashboard");
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { keycloak_id: "SUB-NEW" },
    });
  });
});
