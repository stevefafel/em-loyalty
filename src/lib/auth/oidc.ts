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
 * exchange, refresh, and the end-session URL. Cached per server instance.
 *
 * On failure the rejected promise is retained for a short cooldown so that a
 * burst of requests during a Keycloak outage shares one in-flight attempt
 * (no thundering-herd retry storm against a recovering server); after the
 * cooldown the next call retries fresh.
 *
 * Node.js runtime only — do not import from the Edge runtime.
 */
let configPromise: Promise<client.Configuration> | null = null;
const DISCOVERY_FAILURE_COOLDOWN_MS = 5000;

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
        // Keep the rejected promise briefly so concurrent callers share it,
        // then clear so a later request can retry against a recovered server.
        setTimeout(() => {
          configPromise = null;
        }, DISCOVERY_FAILURE_COOLDOWN_MS);
        throw error;
      }
    })();
  }
  return configPromise;
}

export { client };

/**
 * Per-transaction OIDC cookie. Named by the login's `state` so concurrent
 * logins (multiple tabs, double-clicks) do not clobber one another's PKCE
 * verifier / nonce — a single fixed-name cookie would let the second login
 * overwrite the first, failing the first callback's state check. The value is
 * JSON `{ verifier, nonce }`; `state` lives in the cookie name.
 */
const TXN_PREFIX = "oidc_txn_";
export const txnCookieName = (state: string) => `${TXN_PREFIX}${state}`;

export interface TxnData {
  verifier: string;
  nonce: string;
}

export function txnCookieOptions() {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 minutes — the login round-trip window
  };
}

export function clearTxnCookie(
  res: { cookies: { delete: (name: string) => void } },
  state: string,
) {
  res.cookies.delete(txnCookieName(state));
}
