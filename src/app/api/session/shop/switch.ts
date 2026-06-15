/**
 * Pure decision logic for the active-shop switch, extracted so it is unit-
 * testable without a DB or request. The route handler performs the IO
 * (read session, check userShop membership) and feeds the results here.
 */

export type ShopSwitchResult =
  | { ok: true }
  | { ok: false; status: 401 | 400 | 403; error: string };

export function evaluateShopSwitch(params: {
  authenticated: boolean;
  shopId: unknown;
  isMember: boolean;
}): ShopSwitchResult {
  if (!params.authenticated) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }
  if (typeof params.shopId !== "string" || params.shopId.length === 0) {
    return { ok: false, status: 400, error: "shopId is required" };
  }
  if (!params.isMember) {
    return { ok: false, status: 403, error: "No access to that shop" };
  }
  return { ok: true };
}
