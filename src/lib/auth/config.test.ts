import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * authMode is resolved at module-eval time from process.env, so each case
 * sets env then imports the module fresh via vi.resetModules().
 */
async function loadAuthMode(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return (await import("./config")).authMode;
}

describe("authMode (allowlist gating)", () => {
  const original = { ...process.env };
  beforeEach(() => {
    delete process.env.APP_ENV;
    delete process.env.AUTH_MODE;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("is 'mock' only when APP_ENV=local AND AUTH_MODE=mock", async () => {
    expect(await loadAuthMode({ APP_ENV: "local", AUTH_MODE: "mock" })).toBe("mock");
  });

  it("is 'keycloak' when APP_ENV=production even with AUTH_MODE=mock", async () => {
    expect(await loadAuthMode({ APP_ENV: "production", AUTH_MODE: "mock" })).toBe(
      "keycloak",
    );
  });

  it("is 'keycloak' for APP_ENV=staging with AUTH_MODE=mock (allowlist guard)", async () => {
    expect(await loadAuthMode({ APP_ENV: "staging", AUTH_MODE: "mock" })).toBe(
      "keycloak",
    );
  });

  it("is 'keycloak' when APP_ENV is unset with AUTH_MODE=mock (denylist failure case)", async () => {
    expect(await loadAuthMode({ APP_ENV: undefined, AUTH_MODE: "mock" })).toBe(
      "keycloak",
    );
  });

  it("is 'keycloak' when AUTH_MODE is unset", async () => {
    expect(await loadAuthMode({ APP_ENV: "local", AUTH_MODE: undefined })).toBe(
      "keycloak",
    );
  });
});

describe("sessionSecretKey", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("returns a 32-byte key for a valid base64 secret", async () => {
    vi.resetModules();
    process.env.SESSION_SECRET = Buffer.from(new Uint8Array(32)).toString("base64");
    const { sessionSecretKey } = await import("./config");
    expect(sessionSecretKey()).toHaveLength(32);
  });

  it("throws when SESSION_SECRET does not decode to 32 bytes", async () => {
    vi.resetModules();
    process.env.SESSION_SECRET = Buffer.from("too-short").toString("base64");
    const { sessionSecretKey } = await import("./config");
    expect(() => sessionSecretKey()).toThrow(/32 bytes/);
  });

  it("throws when SESSION_SECRET is missing", async () => {
    vi.resetModules();
    delete process.env.SESSION_SECRET;
    const { sessionSecretKey } = await import("./config");
    expect(() => sessionSecretKey()).toThrow(/SESSION_SECRET/);
  });
});
