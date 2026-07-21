import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sealSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import {
  client,
  clearTxnCookie,
  getOidcConfig,
  txnCookieName,
  type TxnData,
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
    // No state read yet — nothing to clear; the txn cookie self-expires (10 min).
    return NextResponse.redirect(new URL("/login?error=unavailable", req.url));
  }

  // The login's state is echoed back as a query param; it names the per-login
  // transaction cookie holding that login's PKCE verifier + nonce.
  const state = req.nextUrl.searchParams.get("state");
  if (!state) {
    return NextResponse.redirect(new URL("/login?error=state", req.url));
  }

  const redirectTo = (path: string) =>
    clearTxnAnd(NextResponse.redirect(new URL(path, req.url)), state);

  const jar = await cookies();
  const rawTxn = jar.get(txnCookieName(state))?.value;
  let txn: TxnData | null = null;
  if (rawTxn) {
    try {
      txn = JSON.parse(rawTxn) as TxnData;
    } catch {
      txn = null;
    }
  }

  // Fail closed: a missing verifier/nonce would otherwise skip PKCE/nonce validation.
  if (!txn?.verifier || !txn?.nonce) return redirectTo("/login?error=state");
  const { verifier, nonce } = txn;

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
  const sub = typeof claims.sub === "string" && claims.sub ? claims.sub : null;

  // Only touch the DB once the email claim is present and verified.
  let user: { id: string; role: "admin" | "user"; keycloak_id?: string | null } | null =
    null;
  let shops: { id: string }[] = [];
  try {
    if (email && emailVerified) {
      // Linked users match on the stable Keycloak subject id, so a changed
      // email (on either side) can't lock them out or swap their identity.
      if (sub) {
        user = await prisma.user.findUnique({
          where: { keycloak_id: sub },
          select: { id: true, role: true, keycloak_id: true },
        });
      }
      if (!user) {
        // First login (or pre-linking row): match by verified email, then
        // stamp the sub so future logins survive email edits. Stamping over a
        // different stored sub is deliberate — a verified email match is the
        // same trust basis linking used in the first place, and it lets an
        // admin email-swap hand the row to the new person's account.
        user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, role: true, keycloak_id: true },
        });
        if (user && sub && user.keycloak_id !== sub) {
          await prisma.user.update({
            where: { id: user.id },
            data: { keycloak_id: sub },
          });
        }
      }
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
        return clearTxnAnd(NextResponse.redirect(endSession), state);
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

function clearTxnAnd(res: NextResponse, state: string): NextResponse {
  clearTxnCookie(res, state);
  return res;
}
