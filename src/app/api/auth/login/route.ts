import { NextRequest, NextResponse } from "next/server";
import { keycloakRedirectUri } from "@/lib/auth/config";
import {
  client,
  getOidcConfig,
  txnCookieName,
  txnCookieOptions,
} from "@/lib/auth/oidc";

/**
 * Begin the OIDC Authorization Code + PKCE flow.
 *
 * Generates the PKCE verifier, state, and nonce, stashes the verifier+nonce in
 * a short-lived httpOnly cookie keyed by `state` (so concurrent logins don't
 * clobber each other), and redirects to Keycloak's authorize endpoint.
 * Node runtime only.
 */
export async function GET(req: NextRequest) {
  let config;
  try {
    config = await getOidcConfig();
  } catch {
    // Keycloak unreachable / discovery failed — fail gracefully, not a 500.
    return NextResponse.redirect(new URL("/login?error=unavailable", req.url));
  }

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const authUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: keycloakRedirectUri(),
    scope: "openid profile email",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(
    txnCookieName(state),
    JSON.stringify({ verifier: codeVerifier, nonce }),
    txnCookieOptions(),
  );
  return response;
}
