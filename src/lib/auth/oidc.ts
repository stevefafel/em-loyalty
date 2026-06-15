import * as client from "openid-client";
import {
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
