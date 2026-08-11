import { describe, expect, it } from "vitest";
import { canAccessShop, shopFilterFor } from "./shop-scope";

const admin = { role: "admin", shopId: null };
const shopUser = { role: "user", shopId: "s1" };
// resolveShopId returns null for a user who belongs to no shops, so this
// session is reachable in production — not a hypothetical.
const shoplessUser = { role: "user", shopId: null };

describe("canAccessShop", () => {
  it("lets an admin reach any shop", () => {
    expect(canAccessShop(admin, "s1")).toBe(true);
    expect(canAccessShop(admin, "s2")).toBe(true);
  });

  it("lets a shop user reach their own shop", () => {
    expect(canAccessShop(shopUser, "s1")).toBe(true);
  });

  it("denies a shop user another shop", () => {
    expect(canAccessShop(shopUser, "s2")).toBe(false);
  });

  it("denies a user whose session carries no shop", () => {
    expect(canAccessShop(shoplessUser, "s1")).toBe(false);
  });

  it("denies rather than matching when both sides are null", () => {
    // Two absent values must never compare equal into an allow.
    expect(canAccessShop(shoplessUser, null)).toBe(false);
    expect(canAccessShop(shoplessUser, undefined)).toBe(false);
  });

  it("denies a shop user a missing shop id", () => {
    expect(canAccessShop(shopUser, null)).toBe(false);
    expect(canAccessShop(shopUser, undefined)).toBe(false);
  });
});

describe("shopFilterFor", () => {
  it("gives an admin every shop when none is requested", () => {
    expect(shopFilterFor(admin, null)).toEqual({});
  });

  it("narrows an admin to the requested shop", () => {
    expect(shopFilterFor(admin, "s2")).toEqual({ shop_id: "s2" });
  });

  it("pins a shop user to their own shop", () => {
    expect(shopFilterFor(shopUser, null)).toEqual({ shop_id: "s1" });
  });

  it("ignores a shop id a shop user asks for", () => {
    expect(shopFilterFor(shopUser, "s2")).toEqual({ shop_id: "s1" });
  });

  it("returns null for a shopless user rather than falling through to the request", () => {
    // The regression this exists for: the old guard fell through to the
    // client-supplied shop_id, letting a shopless user read any shop.
    expect(shopFilterFor(shoplessUser, "s2")).toBeNull();
    expect(shopFilterFor(shoplessUser, null)).toBeNull();
  });
});
