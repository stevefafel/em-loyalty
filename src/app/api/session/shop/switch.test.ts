import { describe, expect, it } from "vitest";
import { evaluateShopSwitch } from "./switch";

describe("evaluateShopSwitch", () => {
  it("allows a member to switch to a shop they belong to", () => {
    expect(
      evaluateShopSwitch({ authenticated: true, shopId: "shop-x", isMember: true }),
    ).toEqual({ ok: true });
  });

  it("rejects a non-member with 403", () => {
    const r = evaluateShopSwitch({
      authenticated: true,
      shopId: "shop-y",
      isMember: false,
    });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("rejects an unauthenticated request with 401", () => {
    const r = evaluateShopSwitch({
      authenticated: false,
      shopId: "shop-x",
      isMember: true,
    });
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects a missing/blank shopId with 400", () => {
    expect(
      evaluateShopSwitch({ authenticated: true, shopId: "", isMember: true }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      evaluateShopSwitch({ authenticated: true, shopId: undefined, isMember: true }),
    ).toMatchObject({ ok: false, status: 400 });
  });
});
