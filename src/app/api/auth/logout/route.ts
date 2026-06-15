import { NextRequest, NextResponse } from "next/server";
import { authMode, keycloakPostLogoutUri } from "@/lib/auth/config";
import { getSession, SESSION_COOKIE } from "@/lib/session";
import { client, getOidcConfig } from "@/lib/auth/oidc";

/**
 * Log out: always clear the local session cookie, and in Keycloak mode also
 * end the Keycloak SSO session (RP-initiated logout). Works for both modes —
 * in mock mode, or when there is no idToken to hint with, it simply clears the
 * cookie and returns to /login without constructing an end-session URL.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  const idToken = session?.idToken;

  let destination: URL;
  if (authMode === "mock" || !idToken) {
    destination = new URL("/login", req.url);
  } else {
    const config = await getOidcConfig();
    destination = client.buildEndSessionUrl(config, {
      post_logout_redirect_uri: keycloakPostLogoutUri(),
      id_token_hint: idToken,
    });
  }

  const response = NextResponse.redirect(destination);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
