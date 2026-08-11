import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
const findManyInvoices = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findMany: (...a: unknown[]) => findManyInvoices(...a) },
    shop: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function getReq(query = "") {
  return new NextRequest(`http://localhost:3000/api/invoices${query}`);
}

const SHOP_SESSION = { userId: "u1", role: "user", shopId: "s1", expiresAt: 9e9 };
const SHOPLESS_SESSION = { userId: "u3", role: "user", shopId: null, expiresAt: 9e9 };
const ADMIN_SESSION = { userId: "a1", role: "admin", shopId: null, expiresAt: 9e9 };

function invoice(over: Record<string, unknown> = {}) {
  return {
    id: "i1",
    shop_id: "s1",
    amount: 2501,
    user: { first_name: "Ada", last_name: "Lovelace" },
    shop: { name: "Shop One" },
    extraction: { status: "completed" },
    ...over,
  };
}

beforeEach(() => {
  getSession.mockReset();
  findManyInvoices.mockReset();
  findManyInvoices.mockResolvedValue([invoice()]);
});
afterEach(() => vi.resetModules());

describe("GET /api/invoices", () => {
  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const { GET } = await loadRoute();
    expect((await GET(getReq())).status).toBe(401);
    expect(findManyInvoices).not.toHaveBeenCalled();
  });

  it("pins a shop user to their own shop, ignoring ?shop_id=", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { GET } = await loadRoute();
    await GET(getReq("?shop_id=s2"));
    expect(findManyInvoices.mock.calls[0][0].where.shop_id).toBe("s1");
  });

  it("lets an admin list every shop when none is requested", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    const { GET } = await loadRoute();
    await GET(getReq());
    expect(findManyInvoices.mock.calls[0][0].where.shop_id).toBeUndefined();
  });

  it("narrows an admin to a requested shop", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    const { GET } = await loadRoute();
    await GET(getReq("?shop_id=s2"));
    expect(findManyInvoices.mock.calls[0][0].where.shop_id).toBe("s2");
  });

  // The fail-open case: the old guard required a truthy session.shopId, so a
  // shop user with no shops fell through to the client-supplied shop_id.
  it("returns nothing for a shopless user asking for another shop", async () => {
    getSession.mockResolvedValue(SHOPLESS_SESSION);
    const { GET } = await loadRoute();
    const res = await GET(getReq("?shop_id=s2"));

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
    expect(findManyInvoices).not.toHaveBeenCalled();
  });

  it("returns nothing for a shopless user asking for no shop in particular", async () => {
    getSession.mockResolvedValue(SHOPLESS_SESSION);
    const { GET } = await loadRoute();

    expect((await (await GET(getReq())).json()).data).toEqual([]);
    // Never issue an unfiltered query on their behalf.
    expect(findManyInvoices).not.toHaveBeenCalled();
  });
});
