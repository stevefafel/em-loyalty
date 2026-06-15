import { NextRequest, NextResponse } from "next/server";
import { keycloakRedirectUri } from "@/lib/auth/config";
import {
  client,
  getOidcConfig,
  TXN_NONCE,
  TXN_STATE,
  TXN_VERIFIER,
  txnCookieOptions,
} from "@/lib/auth/oidc";

/**
 * Begin the OIDC Authorization Code + PKCE flow.
 *
 * Generates the PKCE verifier, state, and nonce, stashes them in short-lived
 * httpOnly transaction cookies, and redirects to Keycloak's authorize endpoint.
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
  const opts = txnCookieOptions();
  response.cookies.set(TXN_VERIFIER, codeVerifier, opts);
  response.cookies.set(TXN_STATE, state, opts);
  response.cookies.set(TXN_NONCE, nonce, opts);
  return response;
}
