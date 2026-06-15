import { beforeAll, describe, expect, it } from "vitest";
import { EncryptJWT } from "jose";

const SECRET_B64 = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
const OTHER_SECRET_B64 = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");

beforeAll(() => {
  process.env.SESSION_SECRET = SECRET_B64;
});

async function load() {
  return import("./session");
}

function key(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

describe("session seal/decode", () => {
  it("round-trips { userId, role, shopId }", async () => {
    const { sealSession, decodeSession } = await load();
    const sealed = await sealSession({
      userId: "u1",
      role: "admin",
      shopId: null,
    });
    const decoded = await decodeSession(sealed);
    expect(decoded).toMatchObject({ userId: "u1", role: "admin", shopId: null });
    expect(typeof decoded?.expiresAt).toBe("number");
  });

  it("preserves idToken when provided", async () => {
    const { sealSession, decodeSession } = await load();
    const sealed = await sealSession({
      userId: "u1",
      role: "user",
      shopId: "s1",
      idToken: "id-token-xyz",
    });
    expect((await decodeSession(sealed))?.idToken).toBe("id-token-xyz");
  });

  it("returns null for a tampered cookie value", async () => {
    const { sealSession, decodeSession } = await load();
    const sealed = await sealSession({ userId: "u1", role: "user", shopId: "s1" });
    const tampered = sealed.slice(0, -3) + "abc";
    expect(await decodeSession(tampered)).toBeNull();
  });

  it("returns null when expiresAt is in the past (TTL enforcement)", async () => {
    const { decodeSession } = await load();
    const past = Math.floor(Date.now() / 1000) - 60;
    const expired = await new EncryptJWT({
      userId: "u1",
      role: "user",
      shopId: "s1",
      expiresAt: past,
    })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .encrypt(key(SECRET_B64));
    expect(await decodeSession(expired)).toBeNull();
  });

  it("returns null for a cookie sealed with a different secret (integrity)", async () => {
    const { decodeSession } = await load();
    const future = Math.floor(Date.now() / 1000) + 3600;
    const foreign = await new EncryptJWT({
      userId: "u1",
      role: "user",
      shopId: "s1",
      expiresAt: future,
    })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .encrypt(key(OTHER_SECRET_B64));
    expect(await decodeSession(foreign)).toBeNull();
  });

  it("preserves a provided expiresAt instead of extending the TTL (re-seal)", async () => {
    const { sealSession, decodeSession } = await load();
    const fixed = Math.floor(Date.now() / 1000) + 120; // 2 min from now
    const sealed = await sealSession({
      userId: "u1",
      role: "user",
      shopId: "s1",
      expiresAt: fixed,
    });
    expect((await decodeSession(sealed))?.expiresAt).toBe(fixed);
  });

  it("throws when the sealed cookie would exceed the size budget", async () => {
    const { sealSession } = await load();
    await expect(
      sealSession({
        userId: "u1",
        role: "user",
        shopId: "s1",
        idToken: "x".repeat(5000), // oversized idToken
      }),
    ).rejects.toThrow(/cookie budget/);
  });
});
