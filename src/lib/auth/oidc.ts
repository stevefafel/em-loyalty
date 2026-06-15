import * as client from "openid-client";
import {
  cookieSecure,
  keycloakBaseUrl,
  keycloakClientId,
  keycloakClientSecret,
  keycloakRealm,
} from "./config";

/**
 * Cached OpenID Connect discovery against the Keycloak realm.
 *
 * Discovery reads {base}/realms/{realm}/.well-known/openid-configuration and
 * returns a Configuration used for PKCE auth-URL building, the code→token
 * exchange, refresh, and the end-session URL. Cached per server instance; the
 * cache is cleared on rejection so a transient failure can be retried.
 *
 * Node.js runtime only — do not import from the Edge runtime.
 */
let configPromise: Promise<client.Configuration> | null = null;

export function getOidcConfig(): Promise<client.Configuration> {
  if (!configPromise) {
    configPromise = (async () => {
      try {
        const issuer = new URL(`${keycloakBaseUrl()}/realms/${keycloakRealm()}`);
        return await client.discovery(
          issuer,
          keycloakClientId(),
          keycloakClientSecret(),
        );
      } catch (error) {
        configPromise = null; // allow retry on next call
        throw error;
      }
    })();
  }
  return configPromise;
}

export { client };

/** Short-lived OIDC transaction cookies (PKCE verifier, state, nonce). */
export const TXN_VERIFIER = "oidc_verifier";
export const TXN_STATE = "oidc_state";
export const TXN_NONCE = "oidc_nonce";

export function txnCookieOptions() {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 minutes — the login round-trip window
  };
}

export function clearTxnCookies(res: {
  cookies: { delete: (name: string) => void };
}) {
  res.cookies.delete(TXN_VERIFIER);
  res.cookies.delete(TXN_STATE);
  res.cookies.delete(TXN_NONCE);
}
