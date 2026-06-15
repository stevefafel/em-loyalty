import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sealSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import {
  client,
  clearTxnCookies,
  getOidcConfig,
  TXN_NONCE,
  TXN_STATE,
  TXN_VERIFIER,
} from "@/lib/auth/oidc";
import { mapIdentity, normalizeEmail } from "./mapping";

/**
 * OIDC callback: validate state, exchange the code for tokens (openid-client
 * validates iss/nonce/PKCE/signature), map the verified identity to an
 * em-loyalty user, and seal the session. Unprovisioned or unverified
 * identities are denied to /access-denied. Node runtime only.
 */
export async function GET(req: NextRequest) {
  let config;
  try {
    config = await getOidcConfig();
  } catch {
    return clearTxnAnd(NextResponse.redirect(new URL("/login?error=unavailable", req.url)));
  }

  const jar = await cookies();
  const verifier = jar.get(TXN_VERIFIER)?.value;
  const state = jar.get(TXN_STATE)?.value;
  const nonce = jar.get(TXN_NONCE)?.value;

  const redirectTo = (path: string) =>
    clearTxnAnd(NextResponse.redirect(new URL(path, req.url)));

  // Fail closed: a missing nonce would otherwise skip ID-token nonce validation.
  if (!verifier || !state || !nonce) return redirectTo("/login?error=state");

  let tokens;
  try {
    tokens = await client.authorizationCodeGrant(config, new URL(req.url), {
      pkceCodeVerifier: verifier,
      expectedState: state,
      expectedNonce: nonce,
      idTokenExpected: true,
    });
  } catch {
    return redirectTo("/login?error=exchange");
  }

  const claims = (tokens.claims() ?? {}) as Record<string, unknown>;
  const email = normalizeEmail(claims.email);
  const emailVerified = claims.email_verified === true;

  // Only touch the DB once the email claim is present and verified.
  let user: { id: string; role: "admin" | "user" } | null = null;
  let shops: { id: string }[] = [];
  try {
    if (email && emailVerified) {
      user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true },
      });
      if (user) {
        const userShops = await prisma.userShop.findMany({
          where: { user_id: user.id },
          select: { shop_id: true },
          orderBy: { shop_id: "asc" },
        });
        shops = userShops.map((u) => ({ id: u.shop_id }));
      }
    }
  } catch {
    // DB unavailable mid-flow — don't 500; send the user somewhere actionable.
    return redirectTo("/login?error=db");
  }

  const result = mapIdentity({ claims, user, shops });
  if (!result.ok) {
    // Unprovisioned/unverified identity. End the Keycloak SSO session too, so the
    // user lands logged-out on /access-denied instead of being silently
    // re-authenticated into a loop (the Keycloak session would otherwise stay live).
    if (tokens.id_token) {
      try {
        const endSession = client.buildEndSessionUrl(config, {
          post_logout_redirect_uri: new URL("/access-denied", req.url).toString(),
          id_token_hint: tokens.id_token,
        });
        return clearTxnAnd(NextResponse.redirect(endSession));
      } catch {
        return redirectTo("/access-denied");
      }
    }
    return redirectTo("/access-denied");
  }

  const sealed = await sealSession({
    userId: result.userId,
    role: result.role,
    shopId: result.shopId,
    idToken: tokens.id_token,
  });

  const response = redirectTo("/dashboard");
  response.cookies.set(SESSION_COOKIE, sealed, sessionCookieOptions());
  return response;
}

function clearTxnAnd(res: NextResponse): NextResponse {
  clearTxnCookies(res);
  return res;
}
