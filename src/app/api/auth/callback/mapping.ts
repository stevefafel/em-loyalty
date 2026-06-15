import type { UserRole } from "@/types/database";

/**
 * Pure identity-mapping decision for the OIDC callback.
 *
 * Keycloak provides identity (email); the em-loyalty DB provides authorization
 * (role + shops). This module turns verified claims + the matched user/shops
 * into a session payload or a typed denial — no IO, so it is unit-testable
 * apart from the HTTP/Keycloak machinery.
 */

export interface KeycloakClaims {
  email?: unknown;
  email_verified?: unknown;
}

export interface MappedUser {
  id: string;
  role: UserRole;
}

export interface ShopRef {
  id: string;
}

export type MappingResult =
  | { ok: true; userId: string; role: UserRole; shopId: string | null }
  | { ok: false; reason: "no_email" | "email_unverified" | "no_user" };

/** Trim + lowercase the email claim so casing/whitespace never locks out a provisioned user. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length > 0 ? email : null;
}

/** Admins are shop-agnostic; shop users default to their first shop (deterministic order). */
export function resolveShopId(role: UserRole, shops: ShopRef[]): string | null {
  if (role === "admin") return null;
  return shops[0]?.id ?? null;
}

export function mapIdentity(params: {
  claims: KeycloakClaims;
  user: MappedUser | null;
  shops: ShopRef[];
}): MappingResult {
  const email = normalizeEmail(params.claims.email);
  if (!email) return { ok: false, reason: "no_email" };
  // Defense in depth: never trust an unverified email for the identity lookup,
  // even if a matching user row exists.
  if (params.claims.email_verified !== true) {
    return { ok: false, reason: "email_unverified" };
  }
  if (!params.user) return { ok: false, reason: "no_user" };
  return {
    ok: true,
    userId: params.user.id,
    role: params.user.role,
    shopId: resolveShopId(params.user.role, params.shops),
  };
}
