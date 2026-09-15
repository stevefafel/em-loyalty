import { CompactEncrypt, compactDecrypt } from "jose";
import { prisma } from "@/lib/prisma";
import { SESSION_TTL_SECONDS, sessionSecretKey } from "@/lib/auth/config";
import { client, getOidcConfig } from "@/lib/auth/oidc";

/**
 * Server-side session records (ExxonMobil VA findings 79369, 79370, 79175).
 *
 * The sealed cookie alone could not be revoked: logout only deleted it in the
 * browser, so a copied cookie stayed valid for its full 8 hours. Each sign-in
 * now has a `sessions` row, the cookie carries its id, and every request is
 * checked against it. Keycloak settings are shared across Steer products and
 * out of reach, so everything here runs in the portal: the only Keycloak call
 * is a standard refresh-token grant to confirm the Steer sign-in is still live.
 */

/** Idle limits per role. Admins get the shorter window. */
export const IDLE_LIMIT_SECONDS = { admin: 30 * 60, user: 60 * 60 } as const;
/** last_seen_at is written at most this often, to keep reads cheap. */
export const TOUCH_INTERVAL_SECONDS = 60;
/**
 * How often an active session confirms its Steer sign-in with Keycloak. This
 * is how a sign-out elsewhere — including a password change with "sign out
 * other devices" — reaches the portal without back-channel logout, so it bounds
 * how long such a session can outlive the sign-in.
 */
export const SIGNIN_CHECK_INTERVAL_SECONDS = 5 * 60;
/** Unusable rows are kept this long (for troubleshooting), then pruned. */
const PRUNE_AFTER_SECONDS = 7 * 24 * 60 * 60;

type Role = keyof typeof IDLE_LIMIT_SECONDS;

/** Why a session ended, as shown to the user on /login. */
export type SessionEndReason = "idle" | "replaced" | "ended";
/** What is stored in sessions.revoked_reason. */
export type RevokeReason = "logout" | "idle" | "replaced" | "expired" | "signin-ended";

export interface SessionRow {
  id: string;
  user_id: string;
  refresh_token: string | null;
  last_seen_at: Date;
  verified_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_reason: string | null;
}

export type SessionVerdict =
  | { ok: true }
  | { ok: false; reason: SessionEndReason; revoke?: RevokeReason };

const seconds = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 1000;

function endReasonFor(revoked: string | null): SessionEndReason {
  return revoked === "idle" || revoked === "replaced" ? revoked : "ended";
}

/** Pure decision: is this row a live session for this user right now? */
export function evaluateSession(
  row: SessionRow | null,
  who: { userId: string; role: Role },
  now: Date,
): SessionVerdict {
  if (!row || row.user_id !== who.userId) return { ok: false, reason: "ended" };
  if (row.revoked_at) return { ok: false, reason: endReasonFor(row.revoked_reason) };
  if (now >= row.expires_at) return { ok: false, reason: "ended", revoke: "expired" };
  if (seconds(row.last_seen_at, now) > IDLE_LIMIT_SECONDS[who.role]) {
    return { ok: false, reason: "idle", revoke: "idle" };
  }
  return { ok: true };
}

/** Encrypt a Keycloak refresh token for storage (dir/A256GCM, SESSION_SECRET). */
export async function encryptToken(token: string): Promise<string> {
  return new CompactEncrypt(new TextEncoder().encode(token))
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(sessionSecretKey());
}

export async function decryptToken(sealed: string): Promise<string> {
  const { plaintext } = await compactDecrypt(sealed, sessionSecretKey());
  return new TextDecoder().decode(plaintext);
}

/**
 * Record a new sign-in. An admin signing in ends their other live sessions
 * (finding 79175); shop users may keep several, since a shop can use the portal
 * from more than one device.
 */
export async function createSession(
  input: { userId: string; role: Role; refreshToken?: string },
  now = new Date(),
): Promise<{ id: string; expiresAt: number }> {
  const expiresAtMs = now.getTime() + SESSION_TTL_SECONDS * 1000;
  const refreshToken = input.refreshToken ? await encryptToken(input.refreshToken) : null;
  const pruneBefore = new Date(now.getTime() - PRUNE_AFTER_SECONDS * 1000);

  const row = await prisma.$transaction(async (tx) => {
    if (input.role === "admin") {
      await tx.session.updateMany({
        where: { user_id: input.userId, revoked_at: null },
        data: { revoked_at: now, revoked_reason: "replaced" },
      });
    }
    await tx.session.deleteMany({
      where: {
        user_id: input.userId,
        OR: [{ revoked_at: { lt: pruneBefore } }, { expires_at: { lt: pruneBefore } }],
      },
    });
    return tx.session.create({
      data: {
        user_id: input.userId,
        refresh_token: refreshToken,
        created_at: now,
        last_seen_at: now,
        verified_at: now,
        expires_at: new Date(expiresAtMs),
      },
      select: { id: true },
    });
  });

  return { id: row.id, expiresAt: Math.floor(expiresAtMs / 1000) };
}

export async function revokeSession(id: string, reason: RevokeReason, now = new Date()): Promise<void> {
  await prisma.session.updateMany({
    where: { id, revoked_at: null },
    data: { revoked_at: now, revoked_reason: reason },
  });
}

/**
 * Confirm the Steer sign-in behind this session is still live. Only an
 * `invalid_grant` answer ends the session: Keycloak being unreachable keeps it
 * (the sign-in may well be fine), and the check runs again next interval.
 */
async function signInStillLive(row: SessionRow & { refresh_token: string }, now: Date): Promise<boolean> {
  // Claim the check so concurrent requests don't each refresh; Keycloak may
  // rotate refresh tokens, and a second refresh with the old one would fail.
  const claim = await prisma.session.updateMany({
    where: { id: row.id, verified_at: row.verified_at },
    data: { verified_at: now },
  });
  if (claim.count === 0) return true;

  try {
    const tokens = await client.refreshTokenGrant(await getOidcConfig(), await decryptToken(row.refresh_token));
    if (tokens.refresh_token) {
      await prisma.session.updateMany({
        where: { id: row.id },
        data: { refresh_token: await encryptToken(tokens.refresh_token) },
      });
    }
    return true;
  } catch (error) {
    if (error instanceof client.ResponseBodyError && error.error === "invalid_grant") return false;
    console.warn("Steer sign-in check failed; keeping the session until the next check", error);
    return true;
  }
}

/**
 * Validate the session a cookie points at: revoke it when it has ended, record
 * activity, and periodically confirm the Steer sign-in.
 */
export async function validateSession(
  who: { sid: string; userId: string; role: Role },
  now = new Date(),
): Promise<{ ok: true } | { ok: false; reason: SessionEndReason }> {
  const row = await prisma.session.findUnique({ where: { id: who.sid } });
  const verdict = evaluateSession(row, who, now);
  if (!verdict.ok) {
    if (row && verdict.revoke) await revokeSession(row.id, verdict.revoke, now);
    return { ok: false, reason: verdict.reason };
  }
  const live = row!;

  if (seconds(live.last_seen_at, now) >= TOUCH_INTERVAL_SECONDS) {
    await prisma.session.updateMany({
      where: { id: live.id, last_seen_at: live.last_seen_at },
      data: { last_seen_at: now },
    });
  }

  if (live.refresh_token && seconds(live.verified_at, now) >= SIGNIN_CHECK_INTERVAL_SECONDS) {
    if (!(await signInStillLive({ ...live, refresh_token: live.refresh_token }, now))) {
      await revokeSession(live.id, "signin-ended", now);
      return { ok: false, reason: "ended" };
    }
  }

  return { ok: true };
}
