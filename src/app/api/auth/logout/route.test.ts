import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Session = { sid?: string; userId: string; role: string; shopId: string | null; idToken?: string; expiresAt: number } | null;

const revokeSession = vi.fn();

async function loadLogout(opts: { mode: "mock" | "keycloak"; session: Session }) {
  vi.resetModules();
  vi.doMock("@/lib/session", () => ({
    getSession: async () => opts.session,
    SESSION_COOKIE: "session",
  }));
  vi.doMock("@/lib/session-store", () => ({
    revokeSession: (...a: unknown[]) => revokeSession(...a),
  }));
  vi.doMock("@/lib/auth/config", () => ({
    authMode: opts.mode,
    keycloakPostLogoutUri: () => "http://localhost:3000/login",
  }));
  vi.doMock("@/lib/auth/oidc", () => ({
    getOidcConfig: async () => ({}),
    client: {
      buildEndSessionUrl: (_config: unknown, params: { id_token_hint?: string }) =>
        new URL(
          `http://localhost:3000/realms/steer/protocol/openid-connect/logout?id_token_hint=${params.id_token_hint}`,
        ),
    },
  }));
  return import("./route");
}

const req = () => new NextRequest("http://localhost:3000/api/auth/logout");

afterEach(() => {
  vi.resetModules();
  revokeSession.mockReset();
});

describe("logout route", () => {
  it("clears the session cookie and redirects /login in mock mode", async () => {
    const { GET } = await loadLogout({
      mode: "mock",
      session: { userId: "u1", role: "admin", shopId: null, expiresAt: 9e9 },
    });
    const res = await GET(req());
    expect(res.headers.get("location")).toContain("/login");
    expect(res.headers.get("set-cookie") ?? "").toContain("session=");
  });

  it("builds a Keycloak end-session URL with id_token_hint when an idToken exists", async () => {
    const { GET } = await loadLogout({
      mode: "keycloak",
      session: { userId: "u1", role: "user", shopId: "s1", idToken: "ID123", expiresAt: 9e9 },
    });
    const res = await GET(req());
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/protocol/openid-connect/logout");
    expect(location).toContain("id_token_hint=ID123");
    expect(res.headers.get("set-cookie") ?? "").toContain("session=");
  });

  it("falls back to /login when keycloak mode has no idToken", async () => {
    const { GET } = await loadLogout({
      mode: "keycloak",
      session: { userId: "u1", role: "user", shopId: "s1", expiresAt: 9e9 },
    });
    const res = await GET(req());
    expect(res.headers.get("location")).toContain("/login");
  });

  it("revokes the server-side session so a copied cookie stops working", async () => {
    const { GET } = await loadLogout({
      mode: "keycloak",
      session: { sid: "sid-1", userId: "u1", role: "user", shopId: "s1", idToken: "ID123", expiresAt: 9e9 },
    });
    await GET(req());
    expect(revokeSession).toHaveBeenCalledWith("sid-1", "logout");
  });

  it("still logs out when the session record cannot be revoked", async () => {
    revokeSession.mockRejectedValue(new Error("db down"));
    const { GET } = await loadLogout({
      mode: "keycloak",
      session: { sid: "sid-1", userId: "u1", role: "user", shopId: "s1", idToken: "ID123", expiresAt: 9e9 },
    });
    const res = await GET(req());
    expect(res.headers.get("location")).toContain("/protocol/openid-connect/logout");
    expect(res.headers.get("set-cookie") ?? "").toContain("session=");
  });

  it("redirects /login and clears the cookie when there is no session", async () => {
    const { GET } = await loadLogout({ mode: "keycloak", session: null });
    const res = await GET(req());
    expect(res.headers.get("location")).toContain("/login");
    expect(res.headers.get("set-cookie") ?? "").toContain("session=");
  });
});
