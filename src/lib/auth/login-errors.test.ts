import { describe, expect, it } from "vitest";
import { LOGIN_ERROR_FALLBACK, loginErrorMessage } from "./login-errors";

// Every code the OIDC routes actually redirect to /login with. Kept in sync by
// hand with api/auth/login/route.ts and api/auth/callback/route.ts — if a route
// grows a new code, it belongs here and in the message map.
const EMITTED_CODES = ["unavailable", "state", "exchange", "db"] as const;

describe("loginErrorMessage", () => {
  it("returns null when no error param is present", () => {
    expect(loginErrorMessage(undefined)).toBeNull();
  });

  it("returns null for an empty error param so ?error= renders no alert", () => {
    expect(loginErrorMessage("")).toBeNull();
  });

  it.each(EMITTED_CODES)("explains %s with its own message", (code) => {
    const message = loginErrorMessage(code);
    expect(message).toBeTruthy();
    expect(message).not.toBe(LOGIN_ERROR_FALLBACK);
  });

  it("gives every emitted code a distinct message", () => {
    const messages = EMITTED_CODES.map((c) => loginErrorMessage(c));
    expect(new Set(messages).size).toBe(EMITTED_CODES.length);
  });

  it("falls back for an unrecognized code rather than staying silent", () => {
    expect(loginErrorMessage("wat")).toBe(LOGIN_ERROR_FALLBACK);
  });

  it("takes the first value when the param is repeated", () => {
    expect(loginErrorMessage(["exchange", "db"])).toBe(
      loginErrorMessage("exchange")
    );
  });

  it("never leaks the raw code into the message", () => {
    for (const code of [...EMITTED_CODES, "wat"]) {
      expect(loginErrorMessage(code)).not.toContain(code);
    }
  });
});
