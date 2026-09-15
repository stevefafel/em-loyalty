import { cookies } from "next/headers";
import { EncryptJWT, jwtDecrypt } from "jose";
import type { MockSession } from "@/types/api";
import { cookieSecure, SESSION_TTL_SECONDS, sessionSecretKey } from "@/lib/auth/config";
import { validateSession, type SessionEndReason } from "@/lib/session-store";

/**
 * Browsers silently drop cookies over ~4KB. The sealed session carries the
 * Keycloak idToken (a JWT with PII claims), so guard against overflow at seal
 * time — a thrown error is far easier to diagnose than "random" lost sessions.
 */
const MAX_SEALED_COOKIE_BYTES = 3800;

/**
 * Sealed (encrypted) session.
 *
 * Replaces the former plaintext, non-httpOnly `mock-session` JSON cookie —
 * which was client-readable and client-forgeable (a privilege-escalation
 * hole). The session is now a `jose` JWE (`dir`/A256GCM) in an httpOnly
 * cookie. Both mock and Keycloak auth modes produce the same sealed cookie,
 * so all downstream consumers stay mode-agnostic.
 */

export const SESSION_COOKIE = "session";

/** Superset of MockSession so existing consumers ({userId, role, shopId}) are untouched. */
export interface SessionData extends MockSession {
  /** Id of this sign-in's `sessions` row; every request is checked against it. */
  sid: string;
  /** Keycloak ID token, kept for RP-initiated logout (id_token_hint). Absent in mock mode. */
  idToken?: string;
  /** Unix seconds. Hard session expiry (KTD-8). */
  expiresAt: number;
}

export interface SessionInput {
  sid: string;
  userId: string;
  role: MockSession["role"];
  shopId: string | null;
  idToken?: string;
  /**
   * Absolute expiry (unix seconds) to preserve across a re-seal. Omit when
   * minting a fresh session (login/callback/mock) to start a new 8h window;
   * pass the existing session.expiresAt on re-seal (e.g. shop switch) so the
   * fixed TTL ceiling (KTD-8) is not extended on every mutation.
   */
  expiresAt?: number;
}

/**
 * A browser-session cookie: no maxAge/expires, so it is dropped when the
 * browser closes instead of persisting to disk (VA finding 79190). The 8h
 * ceiling is still enforced by the sealed `expiresAt`, independent of the cookie.
 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax" as const,
    path: "/",
  };
}

/**
 * Seal a session into an encrypted JWT string. Sets both the JWE `exp` and an
 * explicit `expiresAt` (belt-and-suspenders TTL enforcement in getSession).
 */
export async function sealSession(input: SessionInput): Promise<string> {
  const expiresAt =
    input.expiresAt ?? Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload: SessionData = {
    sid: input.sid,
    userId: input.userId,
    role: input.role,
    shopId: input.shopId,
    expiresAt,
    ...(input.idToken ? { idToken: input.idToken } : {}),
  };
  const sealed = await new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .encrypt(sessionSecretKey());
  if (sealed.length > MAX_SEALED_COOKIE_BYTES) {
    throw new Error(
      `Sealed session (${sealed.length} bytes) exceeds the ${MAX_SEALED_COOKIE_BYTES}-byte ` +
        `cookie budget — the Keycloak idToken is likely too large. Move tokens to a server-side store.`,
    );
  }
  return sealed;
}

/** Decrypt and validate a sealed session string. Returns null on any failure. */
export async function decodeSession(raw: string): Promise<SessionData | null> {
  try {
    const { payload } = await jwtDecrypt(raw, sessionSecretKey());
    const data = payload as unknown as SessionData;
    // A cookie without `sid` predates server-side sessions and cannot be
    // revoked, so it is not accepted.
    if (
      typeof data.sid !== "string" ||
      typeof data.userId !== "string" ||
      typeof data.expiresAt !== "number"
    ) {
      return null;
    }
    // Enforce TTL independently of the JWE `exp` check.
    if (data.expiresAt * 1000 <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export type SessionResult =
  | { session: SessionData; ended?: undefined }
  | { session: null; ended: SessionEndReason | null };

/**
 * Read the current session and check it against its server-side record. When
 * there is none, `ended` says why a session the browser still held was
 * refused (null when there was no cookie at all), so the portal can tell the
 * user they were signed out rather than silently sending them to sign in.
 */
export async function getSessionResult(): Promise<SessionResult> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return { session: null, ended: null };

  const data = await decodeSession(raw);
  if (!data) return { session: null, ended: "ended" };

  const check = await validateSession({ sid: data.sid, userId: data.userId, role: data.role });
  return check.ok ? { session: data } : { session: null, ended: check.reason };
}

/** Read the current session, or null when there is no live one. */
export async function getSession(): Promise<SessionData | null> {
  return (await getSessionResult()).session;
}
