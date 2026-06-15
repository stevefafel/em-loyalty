/**
 * Centralized auth configuration — single source of truth for auth-related env.
 *
 * Mirrors the gating shape of apps/dashboard/src/config.ts:
 * mock auth is an ALLOWLIST (only APP_ENV=local AND AUTH_MODE=mock).
 * Any non-`local` APP_ENV — including unset, `staging`, or a typo — enforces
 * Keycloak. A denylist (APP_ENV !== 'production') is deliberately NOT used:
 * it would expose the unauthenticated mock picker if a non-prod env merely
 * omitted APP_ENV.
 */

export type AuthMode = "mock" | "keycloak";

const appEnv = process.env.APP_ENV ?? "prod";
const requestedAuthMode = process.env.AUTH_MODE ?? "keycloak";

export const authMode: AuthMode =
  appEnv === "local" && requestedAuthMode === "mock" ? "mock" : "keycloak";

/** Read a required env var, throwing a clear error when absent. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name} (required in keycloak auth mode)`,
    );
  }
  return value;
}

export const keycloakBaseUrl = (): string =>
  // Dev reference value matches the host apps/dashboard defaults VITE_KEYCLOAK_URL to.
  process.env.KEYCLOAK_BASE_URL ?? "https://auth.dev2.steercrm.dev";

export const keycloakRealm = (): string => process.env.KEYCLOAK_REALM ?? "steer";

export const keycloakClientId = (): string => required("KEYCLOAK_CLIENT_ID");

export const keycloakClientSecret = (): string | undefined =>
  process.env.KEYCLOAK_CLIENT_SECRET || undefined;

export const keycloakRedirectUri = (): string => required("KEYCLOAK_REDIRECT_URI");

export const keycloakPostLogoutUri = (): string =>
  required("KEYCLOAK_POST_LOGOUT_URI");

/**
 * Whether cookies should carry the Secure flag. Keyed off the same APP_ENV
 * signal as auth gating (not NODE_ENV) so any non-local environment transmits
 * cookies only over HTTPS, even if NODE_ENV is misconfigured. Local dev over
 * http stays non-secure.
 */
export const cookieSecure = (): boolean => appEnv !== "local";

/**
 * The 256-bit key used to seal the session cookie (jose `dir`/A256GCM).
 * Must decode to exactly 32 bytes — validated here so a misconfigured secret
 * fails loudly at first use rather than silently producing unreadable sessions.
 * Cached after first validation to avoid re-parsing on every seal/unseal.
 */
let cachedKey: Uint8Array | null = null;
export function sessionSecretKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const raw = required("SESSION_SECRET");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `SESSION_SECRET must decode to exactly 32 bytes (got ${key.length}). ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  cachedKey = new Uint8Array(key);
  return cachedKey;
}

/** Fixed application session lifetime (KTD-8). */
export const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours
