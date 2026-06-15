import { describe, expect, it } from "vitest";
import { mapIdentity, normalizeEmail, resolveShopId } from "./mapping";

const verified = (email: string) => ({ email, email_verified: true });

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Steve.Fafel@Steer.IO ")).toBe("steve.fafel@steer.io");
  });
  it("returns null for blank or non-string", () => {
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});

describe("resolveShopId", () => {
  it("returns null for admins", () => {
    expect(resolveShopId("admin", [{ id: "s1" }])).toBeNull();
  });
  it("returns the first shop for shop users", () => {
    expect(resolveShopId("user", [{ id: "s1" }, { id: "s2" }])).toBe("s1");
  });
  it("returns null for a shop user with no shops", () => {
    expect(resolveShopId("user", [])).toBeNull();
  });
});

describe("mapIdentity", () => {
  it("maps a verified admin to a shopId-less session", () => {
    expect(
      mapIdentity({
        claims: verified("admin@steer.io"),
        user: { id: "u-admin", role: "admin" },
        shops: [{ id: "s1" }],
      }),
    ).toEqual({ ok: true, userId: "u-admin", role: "admin", shopId: null });
  });

  it("maps a verified single-shop user to that shop", () => {
    expect(
      mapIdentity({
        claims: verified("user@steer.io"),
        user: { id: "u1", role: "user" },
        shops: [{ id: "s1" }],
      }),
    ).toMatchObject({ ok: true, shopId: "s1" });
  });

  it("maps a verified multi-shop user to the first shop", () => {
    expect(
      mapIdentity({
        claims: verified("user@steer.io"),
        user: { id: "u1", role: "user" },
        shops: [{ id: "s1" }, { id: "s2" }],
      }),
    ).toMatchObject({ ok: true, shopId: "s1" });
  });

  it("maps a verified zero-shop user to shopId null", () => {
    expect(
      mapIdentity({
        claims: verified("user@steer.io"),
        user: { id: "u1", role: "user" },
        shops: [],
      }),
    ).toMatchObject({ ok: true, shopId: null });
  });

  it("denies when email_verified is false even if the user exists", () => {
    expect(
      mapIdentity({
        claims: { email: "user@steer.io", email_verified: false },
        user: { id: "u1", role: "user" },
        shops: [{ id: "s1" }],
      }),
    ).toEqual({ ok: false, reason: "email_unverified" });
  });

  it("denies when no matching user exists", () => {
    expect(
      mapIdentity({ claims: verified("ghost@steer.io"), user: null, shops: [] }),
    ).toEqual({ ok: false, reason: "no_user" });
  });

  it("denies when the email claim is missing", () => {
    expect(
      mapIdentity({ claims: { email_verified: true }, user: null, shops: [] }),
    ).toEqual({ ok: false, reason: "no_email" });
  });
});
