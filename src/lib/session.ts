import { cookies } from "next/headers";
import { EncryptJWT, jwtDecrypt } from "jose";
import type { MockSession } from "@/types/api";
import { cookieSecure, SESSION_TTL_SECONDS, sessionSecretKey } from "@/lib/auth/config";

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
  /** Keycloak ID token, kept for RP-initiated logout (id_token_hint). Absent in mock mode. */
  idToken?: string;
  /** Unix seconds. Hard session expiry (KTD-8). */
  expiresAt: number;
}

export interface SessionInput {
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

export function sessionCookieOptions(maxAgeSeconds = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
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
    if (typeof data.userId !== "string" || typeof data.expiresAt !== "number") {
      return null;
    }
    // Enforce TTL independently of the JWE `exp` check.
    if (data.expiresAt * 1000 <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/** Read the current session from the request cookies. */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return decodeSession(raw);
}
