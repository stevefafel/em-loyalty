/**
 * Tenant scoping for shop-owned resources.
 *
 * Admins are shop-agnostic and reach every shop. A shop user is confined to the
 * shop on their session. The case worth stating explicitly: `resolveShopId`
 * returns null for a user who belongs to no shops, so a `role: "user"` session
 * with `shopId: null` is a real state — and it must see *nothing* rather than
 * fall through to a client-supplied shop id.
 *
 * Structural session type on purpose: this stays a pure function so it can be
 * unit-tested without pulling in the session sealing/crypto module.
 */

export interface ShopScopeSession {
  role: string;
  shopId: string | null;
}

/**
 * Whether this session may reach a resource owned by `shopId`.
 *
 * Absent values never compare equal into an allow — a null session shop and a
 * null resource shop are two unknowns, not a match.
 */
export function canAccessShop(
  session: ShopScopeSession,
  shopId: string | null | undefined
): boolean {
  if (session.role === "admin") return true;
  if (!session.shopId || !shopId) return false;
  return session.shopId === shopId;
}

/**
 * The Prisma `where` fragment for listing shop-owned rows, or null when the
 * caller may see nothing at all.
 *
 * An admin may narrow to a requested shop or omit it for every shop. A shop
 * user is pinned to their own shop and the requested id is ignored, never
 * honored.
 */
export function shopFilterFor(
  session: ShopScopeSession,
  requestedShopId: string | null
): { shop_id?: string } | null {
  if (session.role === "admin") {
    return requestedShopId ? { shop_id: requestedShopId } : {};
  }
  if (!session.shopId) return null;
  return { shop_id: session.shopId };
}
