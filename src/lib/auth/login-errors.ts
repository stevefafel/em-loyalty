/**
 * User-facing copy for the `?error=` codes the OIDC routes redirect to /login
 * with (api/auth/login and api/auth/callback).
 *
 * The codes are deliberately coarse: the specific cause is a server concern and
 * stays in the logs, while the query string carries only enough to tell the user
 * whether to retry now, retry later, or start over. Each message therefore says
 * what happened in plain terms and what to do about it — a user who lands back
 * on the login screen with no explanation cannot tell a broken identity provider
 * from their own expired attempt.
 */

/** Shown for a code this build does not recognize — never leave the user guessing. */
export const LOGIN_ERROR_FALLBACK =
  "Something went wrong while signing you in. Please try again.";

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  // OIDC discovery failed: the identity provider is unreachable right now.
  unavailable:
    "We couldn't reach the sign-in service. Please try again in a moment.",
  // Missing state param, or the per-login transaction cookie was gone/unparseable
  // — normally a login left open past the cookie's 10-minute life, or blocked cookies.
  state:
    "Your sign-in attempt expired before it finished. Please sign in again.",
  // The authorization code exchange or token validation failed.
  exchange: "We couldn't complete your sign-in. Please try again.",
  // The database was unavailable partway through the callback.
  db: "Sign-in is temporarily unavailable. Please try again in a few minutes.",
};

/**
 * Resolve an `?error=` value to display copy, or null when there is nothing to
 * show. Accepts the raw searchParams shape: a repeated param arrives as an
 * array, and only the first value is meaningful.
 */
export function loginErrorMessage(
  code: string | string[] | undefined
): string | null {
  const first = Array.isArray(code) ? code[0] : code;
  if (!first) return null;
  return LOGIN_ERROR_MESSAGES[first] ?? LOGIN_ERROR_FALLBACK;
}
