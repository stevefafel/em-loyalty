import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
const findManyOilChanges = vi.fn();
const reconcilePegasusAwards = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    oilChangeCount: { findMany: (...a: unknown[]) => findManyOilChanges(...a) },
  },
}));

vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/pegasus-awards", () => ({
  reconcilePegasusAwards: (...a: unknown[]) => reconcilePegasusAwards(...a),
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function getReq(query = "") {
  return new NextRequest(`http://localhost:3000/api/oil-changes${query}`);
}

const SHOP_SESSION = { userId: "u1", role: "user", shopId: "s1", expiresAt: 9e9 };
const SHOPLESS_SESSION = { userId: "u3", role: "user", shopId: null, expiresAt: 9e9 };
const ADMIN_SESSION = { userId: "a1", role: "admin", shopId: null, expiresAt: 9e9 };

beforeEach(() => {
  getSession.mockReset();
  findManyOilChanges.mockReset();
  reconcilePegasusAwards.mockReset();
  findManyOilChanges.mockResolvedValue([]);
  reconcilePegasusAwards.mockResolvedValue(undefined);
});
afterEach(() => vi.resetModules());

describe("GET /api/oil-changes", () => {
  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const { GET } = await loadRoute();
    expect((await GET(getReq())).status).toBe(401);
  });

  it("pins a shop user to their own shop, ignoring ?shop_id=", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { GET } = await loadRoute();
    await GET(getReq("?shop_id=s2"));
    expect(findManyOilChanges.mock.calls[0][0].where.shop_id).toBe("s1");
  });

  // The fail-open guard: a shopless user fell through to the client-supplied
  // shop_id — and this route then runs reconcilePegasusAwards, a WRITE, on it.
  it("returns nothing and reconciles nothing for a shopless user", async () => {
    getSession.mockResolvedValue(SHOPLESS_SESSION);
    const { GET } = await loadRoute();
    const res = await GET(getReq("?shop_id=s2"));

    expect((await res.json()).data).toEqual([]);
    expect(findManyOilChanges).not.toHaveBeenCalled();
    expect(reconcilePegasusAwards).not.toHaveBeenCalled();
  });

  it("never reconciles a shop the caller cannot reach", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { GET } = await loadRoute();
    await GET(getReq("?shop_id=s2"));

    // Reconcile may run, but only ever for the caller's own shop.
    for (const call of reconcilePegasusAwards.mock.calls) {
      expect(call[0]).toBe("s1");
    }
  });

  it("lets an admin narrow to a named shop", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    const { GET } = await loadRoute();
    await GET(getReq("?shop_id=s2"));
    expect(findManyOilChanges.mock.calls[0][0].where.shop_id).toBe("s2");
  });

  it("lets an admin read every shop when none is named", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    const { GET } = await loadRoute();
    await GET(getReq());

    expect(findManyOilChanges).toHaveBeenCalled();
    expect(findManyOilChanges.mock.calls[0][0].where.shop_id).toBeUndefined();
  });
});
