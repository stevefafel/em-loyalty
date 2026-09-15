import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptJWT } from "jose";

// getSessionResult reads the request cookie and asks the session store; both
// are stubbed so these tests exercise only the cookie→store decision.
let cookieValue: string | undefined;
const validateSession = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }),
}));
vi.mock("@/lib/session-store", () => ({
  validateSession: (...a: unknown[]) => validateSession(...a),
}));

beforeEach(() => {
  cookieValue = undefined;
  validateSession.mockReset();
});

const SECRET_B64 = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
const OTHER_SECRET_B64 = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");

beforeAll(() => {
  process.env.SESSION_SECRET = SECRET_B64;
});

async function load() {
  return import("./session");
}

function key(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

describe("session seal/decode", () => {
  it("round-trips { userId, role, shopId }", async () => {
    const { sealSession, decodeSession } = await load();
    const sealed = await sealSession({
      sid: "sid-1",
      userId: "u1",
      role: "admin",
      shopId: null,
    });
    const decoded = await decodeSession(sealed);
    expect(decoded).toMatchObject({ userId: "u1", role: "admin", shopId: null });
    expect(typeof decoded?.expiresAt).toBe("number");
  });

  it("preserves idToken when provided", async () => {
    const { sealSession, decodeSession } = await load();
    const sealed = await sealSession({
      sid: "sid-1",
      userId: "u1",
      role: "user",
      shopId: "s1",
      idToken: "id-token-xyz",
    });
    expect((await decodeSession(sealed))?.idToken).toBe("id-token-xyz");
  });

  it("returns null for a tampered cookie value", async () => {
    const { sealSession, decodeSession } = await load();
    const sealed = await sealSession({ sid: "sid-1", userId: "u1", role: "user", shopId: "s1" });
    const tampered = sealed.slice(0, -3) + "abc";
    expect(await decodeSession(tampered)).toBeNull();
  });

  it("returns null when expiresAt is in the past (TTL enforcement)", async () => {
    const { decodeSession } = await load();
    const past = Math.floor(Date.now() / 1000) - 60;
    const expired = await new EncryptJWT({
      sid: "sid-1",
      userId: "u1",
      role: "user",
      shopId: "s1",
      expiresAt: past,
    })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .encrypt(key(SECRET_B64));
    expect(await decodeSession(expired)).toBeNull();
  });

  it("returns null for a cookie sealed with a different secret (integrity)", async () => {
    const { decodeSession } = await load();
    const future = Math.floor(Date.now() / 1000) + 3600;
    const foreign = await new EncryptJWT({
      sid: "sid-1",
      userId: "u1",
      role: "user",
      shopId: "s1",
      expiresAt: future,
    })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .encrypt(key(OTHER_SECRET_B64));
    expect(await decodeSession(foreign)).toBeNull();
  });

  it("preserves a provided expiresAt instead of extending the TTL (re-seal)", async () => {
    const { sealSession, decodeSession } = await load();
    const fixed = Math.floor(Date.now() / 1000) + 120; // 2 min from now
    const sealed = await sealSession({
      sid: "sid-1",
      userId: "u1",
      role: "user",
      shopId: "s1",
      expiresAt: fixed,
    });
    expect((await decodeSession(sealed))?.expiresAt).toBe(fixed);
  });

  it("throws when the sealed cookie would exceed the size budget", async () => {
    const { sealSession } = await load();
    await expect(
      sealSession({
        sid: "sid-1",
        userId: "u1",
        role: "user",
        shopId: "s1",
        idToken: "x".repeat(5000), // oversized idToken
      }),
    ).rejects.toThrow(/cookie budget/);
  });

  it("rejects a cookie from before server-side sessions (no sid)", async () => {
    const { decodeSession } = await load();
    const legacy = await new EncryptJWT({
      userId: "u1",
      role: "user",
      shopId: "s1",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .encrypt(key(SECRET_B64));
    expect(await decodeSession(legacy)).toBeNull();
  });
});

describe("getSessionResult", () => {
  async function sealed() {
    const { sealSession } = await load();
    return sealSession({ sid: "sid-1", userId: "u1", role: "admin", shopId: null });
  }

  it("reports no session and no reason when there is no cookie", async () => {
    const { getSessionResult } = await load();
    await expect(getSessionResult()).resolves.toEqual({ session: null, ended: null });
    expect(validateSession).not.toHaveBeenCalled();
  });

  it("returns the session when its server-side record is live", async () => {
    const { getSessionResult } = await load();
    cookieValue = await sealed();
    validateSession.mockResolvedValue({ ok: true });
    const result = await getSessionResult();
    expect(result.session).toMatchObject({ sid: "sid-1", userId: "u1", role: "admin" });
    expect(validateSession).toHaveBeenCalledWith({ sid: "sid-1", userId: "u1", role: "admin" });
  });

  it("rejects a valid cookie whose record was revoked, with the reason", async () => {
    const { getSessionResult, getSession } = await load();
    cookieValue = await sealed();
    validateSession.mockResolvedValue({ ok: false, reason: "replaced" });
    await expect(getSessionResult()).resolves.toEqual({ session: null, ended: "replaced" });
    await expect(getSession()).resolves.toBeNull();
  });

  it("treats an unreadable or expired cookie as an ended session", async () => {
    const { getSessionResult } = await load();
    cookieValue = "not-a-session";
    await expect(getSessionResult()).resolves.toEqual({ session: null, ended: "ended" });
  });
});

describe("sessionCookieOptions", () => {
  it("is a browser-session cookie: no maxAge or expires, so closing the browser drops it", async () => {
    const { sessionCookieOptions } = await load();
    const options = sessionCookieOptions();
    expect(options).not.toHaveProperty("maxAge");
    expect(options).not.toHaveProperty("expires");
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });
});
