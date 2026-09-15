import { NextRequest, NextResponse } from "next/server";
import { authMode, keycloakPostLogoutUri } from "@/lib/auth/config";
import { getSession, SESSION_COOKIE } from "@/lib/session";
import { revokeSession } from "@/lib/session-store";
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

  // Revoke the server-side record first: deleting the cookie only clears this
  // browser, so a copy of the cookie would otherwise stay valid (VA 79369).
  // A database failure must not block the user from logging out.
  if (session) {
    try {
      await revokeSession(session.sid, "logout");
    } catch (error) {
      console.error("Failed to revoke session on logout", error);
    }
  }

  let destination: URL = new URL("/login", req.url);
  if (authMode !== "mock" && idToken) {
    try {
      const config = await getOidcConfig();
      destination = client.buildEndSessionUrl(config, {
        post_logout_redirect_uri: keycloakPostLogoutUri(),
        id_token_hint: idToken,
      });
    } catch {
      // Keycloak unreachable — still clear the local session and land on /login.
      destination = new URL("/login", req.url);
    }
  }

  // Always clear the local session cookie, regardless of Keycloak reachability.
  const response = NextResponse.redirect(destination);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
