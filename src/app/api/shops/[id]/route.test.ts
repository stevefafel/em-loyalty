import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
const findShop = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { shop: { findUnique: (...a: unknown[]) => findShop(...a), update: vi.fn() } },
}));

vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({}) }));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function getReq(id = "s1") {
  return new NextRequest(`http://localhost:3000/api/shops/${id}`);
}

function ctx(id = "s1") {
  return { params: Promise.resolve({ id }) };
}

const SHOP_SESSION = { userId: "u1", role: "user", shopId: "s1", expiresAt: 9e9 };
const OTHER_SHOP_SESSION = { userId: "u2", role: "user", shopId: "s2", expiresAt: 9e9 };
const ADMIN_SESSION = { userId: "a1", role: "admin", shopId: null, expiresAt: 9e9 };

beforeEach(() => {
  getSession.mockReset();
  findShop.mockReset();
  findShop.mockResolvedValue({
    id: "s1",
    name: "Shop One",
    address: "1 Main St",
    loyalty_points_balance: 4200,
    program_status: "approved",
  });
});
afterEach(() => vi.resetModules());

describe("GET /api/shops/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const { GET } = await loadRoute();
    expect((await GET(getReq(), ctx())).status).toBe(401);
  });

  it("returns the shop to its own user", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { GET } = await loadRoute();
    expect((await GET(getReq(), ctx())).status).toBe(200);
  });

  it("returns any shop to an admin", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    const { GET } = await loadRoute();
    expect((await GET(getReq(), ctx())).status).toBe(200);
  });

  // Any authenticated user could read any shop's record — including its
  // points balance and program status — by naming its id.
  it("returns 404 and leaks nothing to a user of another shop", async () => {
    getSession.mockResolvedValue(OTHER_SHOP_SESSION);
    const { GET } = await loadRoute();
    const res = await GET(getReq(), ctx());

    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain("Shop One");
    expect(body).not.toContain("4200");
    expect(body).not.toContain("1 Main St");
  });
});
