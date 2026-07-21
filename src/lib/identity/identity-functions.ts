/**
 * Identity-functions HTTP client for Keycloak user provisioning.
 *
 * Routes Keycloak account creation through the AutoOps `identity-functions`
 * Azure Functions service instead of the Keycloak Admin REST API directly,
 * so no service account or `realm-management` roles are needed. Same `steer`
 * realm as login (see src/lib/auth/config.ts).
 *
 * Auth: `x-functions-key` header (Azure Functions built-in auth) +
 * `x-caller-id: EM-Loyalty`.
 * Error format: `{ success: false, error: { code, message, details? } }`.
 *
 * Provisioning is OPTIONAL and best-effort: when the env vars below are unset
 * (e.g. local mock-auth dev), callers get `"skipped"` and user CRUD proceeds
 * unaffected.
 */

const REQUEST_TIMEOUT_MS = 10_000;

export const identityFunctionsUrl = (): string | undefined =>
  process.env.IDENTITY_FUNCTIONS_URL || undefined;

export const identityFunctionsApiKey = (): string | undefined =>
  process.env.IDENTITY_FUNCTIONS_API_KEY || undefined;

export const identityFunctionsConfigured = (): boolean =>
  Boolean(identityFunctionsUrl() && identityFunctionsApiKey());

/** Keycloak user returned by identity-functions. */
export interface KeycloakUser {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly enabled: boolean;
  readonly firstName?: string;
  readonly lastName?: string;
}

interface IdentityFunctionsError {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = identityFunctionsUrl();
  const apiKey = identityFunctionsApiKey();
  if (!baseUrl || !apiKey) {
    throw new Error("identity-functions is not configured");
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-functions-key": apiKey,
      "x-caller-id": "EM-Loyalty",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as IdentityFunctionsError | null;
    const errMsg = body?.error?.message ?? `HTTP ${res.status}`;
    console.error(
      `identity-functions request failed: ${path}: ${errMsg}`,
      body?.error ?? { status: res.status }
    );
    throw new Error(`identity-functions ${path}: ${errMsg}`);
  }

  return res;
}

/**
 * Look up a Keycloak user by email.
 * Returns `null` when the user is not found (200 with `{ user: null }`, not 404).
 */
export async function findUserByEmail(email: string): Promise<KeycloakUser | null> {
  const res = await request(
    `/keycloak/users/find-by-email?email=${encodeURIComponent(email)}`
  );
  const body = (await res.json()) as { user: KeycloakUser | null };
  return body.user;
}

/**
 * Atomic find-or-create. If the user exists, returns the existing user.
 * If not, creates one with `emailVerified: true`, `enabled: true`, and
 * `requiredActions: ['UPDATE_PASSWORD']` (which alone does NOT send an email —
 * see sendActionsEmail).
 */
export async function upsertUser(data: {
  email: string;
  firstName?: string;
  lastName?: string;
}): Promise<KeycloakUser> {
  const res = await request("/keycloak/users/upsert", {
    method: "POST",
    body: JSON.stringify({
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      emailVerified: true,
      enabled: true,
      requiredActions: ["UPDATE_PASSWORD"],
    }),
  });
  const body = (await res.json()) as { user: KeycloakUser };
  return body.user;
}

/** Send a Keycloak actions email (e.g. set-password). */
export async function sendActionsEmail(
  keycloakUserId: string,
  actions: string[]
): Promise<void> {
  await request(
    `/keycloak/users/${encodeURIComponent(keycloakUserId)}/send-actions-email`,
    { method: "POST", body: JSON.stringify({ actions }) }
  );
}

export type ProvisioningStatus =
  | "invited" // account created, set-password email sent
  | "existing" // account already existed, no email sent
  | "resent" // account already existed, set-password email re-sent
  | "skipped" // identity-functions not configured
  | "failed"; // identity call failed (user CRUD still succeeded)

/**
 * Ensure a Keycloak account exists for the given user and (when newly created)
 * send the set-password email. Never throws — failures resolve to `"failed"`
 * so callers can treat provisioning as best-effort.
 *
 * With `resendIfExisting`, an existing account gets the set-password email
 * re-sent (the "Resend setup email" action) and resolves to `"resent"`.
 */
export async function provisionKeycloakUser(
  data: { email: string; firstName?: string; lastName?: string },
  options?: { resendIfExisting?: boolean }
): Promise<ProvisioningStatus> {
  if (!identityFunctionsConfigured()) return "skipped";

  try {
    const existing = await findUserByEmail(data.email);
    if (existing) {
      if (!options?.resendIfExisting) return "existing";
      await sendActionsEmail(existing.id, ["UPDATE_PASSWORD"]);
      return "resent";
    }
    const created = await upsertUser(data);
    await sendActionsEmail(created.id, ["UPDATE_PASSWORD"]);
    return "invited";
  } catch (err) {
    console.error(`Keycloak provisioning failed for ${data.email}`, err);
    return "failed";
  }
}
