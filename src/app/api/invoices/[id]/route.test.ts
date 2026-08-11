import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
const findInvoice = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findUnique: (...a: unknown[]) => findInvoice(...a) },
  },
}));

vi.mock("@/lib/session", () => ({
  getSession: () => getSession(),
}));

// The route imports these for its PATCH/DELETE paths; stub them so importing
// the module doesn't reach Supabase or the validator's environment.
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({}) }));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function getReq(id = "i1") {
  return new NextRequest(`http://localhost:3000/api/invoices/${id}`);
}

function ctx(id = "i1") {
  return { params: Promise.resolve({ id }) };
}

const SHOP_SESSION = { userId: "u1", role: "user", shopId: "s1", expiresAt: 9e9 };
const OTHER_SHOP_SESSION = { userId: "u2", role: "user", shopId: "s2", expiresAt: 9e9 };
const SHOPLESS_SESSION = { userId: "u3", role: "user", shopId: null, expiresAt: 9e9 };
const ADMIN_SESSION = { userId: "a1", role: "admin", shopId: null, expiresAt: 9e9 };

function invoice(over: Record<string, unknown> = {}) {
  return {
    id: "i1",
    shop_id: "s1",
    amount: 2501,
    file_path: "s1/invoice.pdf",
    status: "approved",
    user: { first_name: "Ada", last_name: "Lovelace" },
    shop: { name: "Shop One" },
    extraction: { id: "e1", line_items: [] },
    ...over,
  };
}

beforeEach(() => {
  getSession.mockReset();
  findInvoice.mockReset();
  findInvoice.mockResolvedValue(invoice());
});
afterEach(() => vi.resetModules());

describe("GET /api/invoices/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const { GET } = await loadRoute();
    expect((await GET(getReq(), ctx())).status).toBe(401);
  });

  it("returns the invoice to a user of its own shop", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { GET } = await loadRoute();
    const res = await GET(getReq(), ctx());

    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe("i1");
  });

  it("returns the invoice to an admin regardless of shop", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    const { GET } = await loadRoute();
    expect((await GET(getReq(), ctx())).status).toBe(200);
  });

  // The vulnerability this file exists for: any authenticated user could read
  // any shop's invoice by guessing its UUID.
  it("returns 404, not the invoice, for a user of another shop", async () => {
    getSession.mockResolvedValue(OTHER_SHOP_SESSION);
    const { GET } = await loadRoute();
    const res = await GET(getReq(), ctx());

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.data).toBeUndefined();
  });

  it("returns 404 for a user whose session carries no shop", async () => {
    getSession.mockResolvedValue(SHOPLESS_SESSION);
    const { GET } = await loadRoute();
    expect((await GET(getReq(), ctx())).status).toBe(404);
  });

  it("leaks nothing about the invoice in the cross-shop response", async () => {
    getSession.mockResolvedValue(OTHER_SHOP_SESSION);
    const { GET } = await loadRoute();
    const body = await (await GET(getReq(), ctx())).text();

    // 404 must be indistinguishable from a nonexistent id — no amount, no
    // file path, no shop name.
    expect(body).not.toContain("2501");
    expect(body).not.toContain("invoice.pdf");
    expect(body).not.toContain("Shop One");
  });

  it("still 404s a genuinely missing invoice", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    findInvoice.mockResolvedValue(null);
    const { GET } = await loadRoute();
    expect((await GET(getReq(), ctx())).status).toBe(404);
  });
});
