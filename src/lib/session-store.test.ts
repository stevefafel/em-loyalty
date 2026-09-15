import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Server-side session records: ExxonMobil VA findings 79369 (sessions survive
// logout), 79370 (no idle timeout) and 79175 (concurrent admin sessions).

const findUnique = vi.fn();
const updateMany = vi.fn();
const txUpdateMany = vi.fn();
const txDeleteMany = vi.fn();
const txCreate = vi.fn();
const refreshTokenGrant = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
    },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        session: {
          updateMany: (...a: unknown[]) => txUpdateMany(...a),
          deleteMany: (...a: unknown[]) => txDeleteMany(...a),
          create: (...a: unknown[]) => txCreate(...a),
        },
      }),
  },
}));

class FakeResponseBodyError extends Error {
  constructor(public error: string) {
    super(error);
  }
}

vi.mock("@/lib/auth/oidc", () => ({
  getOidcConfig: async () => ({}),
  client: {
    refreshTokenGrant: (...a: unknown[]) => refreshTokenGrant(...a),
    ResponseBodyError: FakeResponseBodyError,
  },
}));

beforeAll(() => {
  process.env.SESSION_SECRET = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
});

beforeEach(() => {
  vi.clearAllMocks();
  updateMany.mockResolvedValue({ count: 1 });
  txUpdateMany.mockResolvedValue({ count: 0 });
  txDeleteMany.mockResolvedValue({ count: 0 });
  txCreate.mockResolvedValue({ id: "sid-new" });
});

const NOW = new Date("2026-09-15T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "sid-1",
    user_id: "u1",
    refresh_token: null,
    created_at: minutesAgo(10),
    last_seen_at: minutesAgo(1),
    verified_at: minutesAgo(1),
    expires_at: new Date(NOW.getTime() + 60 * 60_000),
    revoked_at: null,
    revoked_reason: null,
    ...overrides,
  };
}

async function load() {
  return import("./session-store");
}

describe("evaluateSession", () => {
  const admin = { userId: "u1", role: "admin" as const };
  const shopUser = { userId: "u1", role: "user" as const };

  it("accepts a live, recently active session", async () => {
    const { evaluateSession } = await load();
    expect(evaluateSession(row(), admin, NOW)).toEqual({ ok: true });
  });

  it("rejects a missing row or one belonging to another user", async () => {
    const { evaluateSession } = await load();
    expect(evaluateSession(null, admin, NOW)).toEqual({ ok: false, reason: "ended" });
    expect(evaluateSession(row({ user_id: "u2" }), admin, NOW)).toEqual({ ok: false, reason: "ended" });
  });

  it("rejects a revoked session and reports why", async () => {
    const { evaluateSession } = await load();
    const revoked = (reason: string) => row({ revoked_at: minutesAgo(1), revoked_reason: reason });
    expect(evaluateSession(revoked("logout"), admin, NOW)).toEqual({ ok: false, reason: "ended" });
    expect(evaluateSession(revoked("replaced"), admin, NOW)).toEqual({ ok: false, reason: "replaced" });
    expect(evaluateSession(revoked("idle"), admin, NOW)).toEqual({ ok: false, reason: "idle" });
  });

  it("ends a session past its 8-hour expiry", async () => {
    const { evaluateSession } = await load();
    expect(evaluateSession(row({ expires_at: minutesAgo(0) }), admin, NOW)).toEqual({
      ok: false,
      reason: "ended",
      revoke: "expired",
    });
  });

  it("ends an admin session after 30 idle minutes, a shop user's after 60", async () => {
    const { evaluateSession } = await load();
    expect(evaluateSession(row({ last_seen_at: minutesAgo(29) }), admin, NOW)).toEqual({ ok: true });
    expect(evaluateSession(row({ last_seen_at: minutesAgo(31) }), admin, NOW)).toEqual({
      ok: false,
      reason: "idle",
      revoke: "idle",
    });
    expect(evaluateSession(row({ last_seen_at: minutesAgo(31) }), shopUser, NOW)).toEqual({ ok: true });
    expect(evaluateSession(row({ last_seen_at: minutesAgo(61) }), shopUser, NOW)).toEqual({
      ok: false,
      reason: "idle",
      revoke: "idle",
    });
  });
});

describe("createSession", () => {
  it("ends an admin's other live sessions before creating the new one", async () => {
    const { createSession } = await load();
    const created = await createSession({ userId: "u1", role: "admin" }, NOW);

    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { user_id: "u1", revoked_at: null },
      data: { revoked_at: NOW, revoked_reason: "replaced" },
    });
    expect(txUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(txCreate.mock.invocationCallOrder[0]);
    expect(created).toEqual({ id: "sid-new", expiresAt: Math.floor(NOW.getTime() / 1000) + 8 * 60 * 60 });
  });

  it("leaves a shop user's other sessions alone", async () => {
    const { createSession } = await load();
    await createSession({ userId: "u1", role: "user" }, NOW);
    expect(txUpdateMany).not.toHaveBeenCalled();
  });

  it("stores the refresh token encrypted, never in the clear", async () => {
    const { createSession } = await load();
    await createSession({ userId: "u1", role: "user", refreshToken: "kc-refresh-token" }, NOW);
    const stored = txCreate.mock.calls[0][0].data.refresh_token as string;
    expect(stored).toBeTruthy();
    expect(stored).not.toContain("kc-refresh-token");
  });
});

describe("validateSession", () => {
  it("revokes an idle session and reports it", async () => {
    const { validateSession } = await load();
    findUnique.mockResolvedValue(row({ last_seen_at: minutesAgo(45) }));
    await expect(validateSession({ sid: "sid-1", userId: "u1", role: "admin" }, NOW)).resolves.toEqual({
      ok: false,
      reason: "idle",
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "sid-1", revoked_at: null },
      data: { revoked_at: NOW, revoked_reason: "idle" },
    });
  });

  it("records activity at most once a minute", async () => {
    const { validateSession } = await load();
    findUnique.mockResolvedValue(row({ last_seen_at: minutesAgo(0.5) }));
    await validateSession({ sid: "sid-1", userId: "u1", role: "admin" }, NOW);
    expect(updateMany).not.toHaveBeenCalled();

    findUnique.mockResolvedValue(row({ last_seen_at: minutesAgo(2) }));
    await validateSession({ sid: "sid-1", userId: "u1", role: "admin" }, NOW);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "sid-1", last_seen_at: minutesAgo(2) },
      data: { last_seen_at: NOW },
    });
  });

  describe("Steer sign-in check", () => {
    async function rowWithToken(verifiedMinutesAgo: number) {
      const { encryptToken } = await load();
      return row({ refresh_token: await encryptToken("kc-refresh"), verified_at: minutesAgo(verifiedMinutesAgo) });
    }

    it("does not call Keycloak within 5 minutes of the last check", async () => {
      const { validateSession } = await load();
      findUnique.mockResolvedValue(await rowWithToken(4));
      await validateSession({ sid: "sid-1", userId: "u1", role: "user" }, NOW);
      expect(refreshTokenGrant).not.toHaveBeenCalled();
    });

    it("ends the portal session when Keycloak has ended the sign-in", async () => {
      const { validateSession } = await load();
      findUnique.mockResolvedValue(await rowWithToken(6));
      refreshTokenGrant.mockRejectedValue(new FakeResponseBodyError("invalid_grant"));

      await expect(validateSession({ sid: "sid-1", userId: "u1", role: "user" }, NOW)).resolves.toEqual({
        ok: false,
        reason: "ended",
      });
      expect(refreshTokenGrant).toHaveBeenCalledWith({}, "kc-refresh");
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: "sid-1", revoked_at: null },
        data: { revoked_at: NOW, revoked_reason: "signin-ended" },
      });
    });

    it("keeps the session and stores the rotated token when the sign-in is live", async () => {
      const { validateSession, decryptToken } = await load();
      findUnique.mockResolvedValue(await rowWithToken(6));
      refreshTokenGrant.mockResolvedValue({ refresh_token: "kc-refresh-2" });

      await expect(validateSession({ sid: "sid-1", userId: "u1", role: "user" }, NOW)).resolves.toEqual({ ok: true });
      const tokenWrite = updateMany.mock.calls.find((c) => c[0].data.refresh_token);
      expect(await decryptToken(tokenWrite![0].data.refresh_token)).toBe("kc-refresh-2");
    });

    it("keeps the session when Keycloak is unreachable (only invalid_grant ends it)", async () => {
      const { validateSession } = await load();
      findUnique.mockResolvedValue(await rowWithToken(6));
      refreshTokenGrant.mockRejectedValue(new TypeError("fetch failed"));
      await expect(validateSession({ sid: "sid-1", userId: "u1", role: "user" }, NOW)).resolves.toEqual({ ok: true });
    });

    it("lets only one concurrent request run the check", async () => {
      const { validateSession } = await load();
      findUnique.mockResolvedValue(await rowWithToken(6));
      // Another request already advanced verified_at, so this claim matches no row.
      updateMany.mockResolvedValue({ count: 0 });
      await expect(validateSession({ sid: "sid-1", userId: "u1", role: "user" }, NOW)).resolves.toEqual({ ok: true });
      expect(refreshTokenGrant).not.toHaveBeenCalled();
    });
  });
});

describe("revokeSession", () => {
  it("marks only a live session revoked", async () => {
    const { revokeSession } = await load();
    await revokeSession("sid-1", "logout", NOW);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "sid-1", revoked_at: null },
      data: { revoked_at: NOW, revoked_reason: "logout" },
    });
  });
});
