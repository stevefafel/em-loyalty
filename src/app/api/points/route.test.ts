import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
const findManyLedger = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    loyaltyLedger: { findMany: (...a: unknown[]) => findManyLedger(...a) },
  },
}));

vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function getReq(query = "") {
  return new NextRequest(`http://localhost:3000/api/points${query}`);
}

const SHOP_SESSION = { userId: "u1", role: "user", shopId: "s1", expiresAt: 9e9 };
const SHOPLESS_SESSION = { userId: "u3", role: "user", shopId: null, expiresAt: 9e9 };
const ADMIN_SESSION = { userId: "a1", role: "admin", shopId: null, expiresAt: 9e9 };

beforeEach(() => {
  getSession.mockReset();
  findManyLedger.mockReset();
  findManyLedger.mockResolvedValue([
    { id: "l1", shop_id: "s1", points_delta: 10, type: "credit" },
  ]);
});
afterEach(() => vi.resetModules());

describe("GET /api/points", () => {
  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const { GET } = await loadRoute();
    expect((await GET(getReq())).status).toBe(401);
    expect(findManyLedger).not.toHaveBeenCalled();
  });

  it("reads a shop user's own ledger", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { GET } = await loadRoute();
    await GET(getReq());
    expect(findManyLedger.mock.calls[0][0].where.shop_id).toBe("s1");
  });

  // The vulnerability: the query param was the first operand of `||`, so it
  // outranked the session for every role — any authenticated user could read
  // any shop's full loyalty ledger by naming it.
  it("ignores ?shop_id= for a shop user rather than letting it outrank the session", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { GET } = await loadRoute();
    await GET(getReq("?shop_id=s2"));
    expect(findManyLedger.mock.calls[0][0].where.shop_id).toBe("s1");
  });

  it("returns nothing for a shopless user naming another shop", async () => {
    getSession.mockResolvedValue(SHOPLESS_SESSION);
    const { GET } = await loadRoute();
    const res = await GET(getReq("?shop_id=s2"));

    expect((await res.json()).data).toEqual([]);
    expect(findManyLedger).not.toHaveBeenCalled();
  });

  it("lets an admin read a named shop's ledger", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    const { GET } = await loadRoute();
    await GET(getReq("?shop_id=s2"));
    expect(findManyLedger.mock.calls[0][0].where.shop_id).toBe("s2");
  });

  it("still requires a shop for an admin who names none", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    const { GET } = await loadRoute();
    // The ledger is per-shop; an unfiltered read is not a meaningful response.
    expect((await GET(getReq())).status).toBe(400);
    expect(findManyLedger).not.toHaveBeenCalled();
  });
});
