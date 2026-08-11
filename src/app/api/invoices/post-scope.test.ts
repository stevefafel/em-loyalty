import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST scoping lives in its own file so the GET suite's prisma mock stays
 * minimal; this one needs invoice.create and shop.update.
 */

const getSession = vi.fn();
const createInvoice = vi.fn();
const updateShop = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findMany: vi.fn(), create: (...a: unknown[]) => createInvoice(...a) },
    shop: { update: (...a: unknown[]) => updateShop(...a) },
  },
}));

vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost:3000/api/invoices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SHOP_SESSION = { userId: "u1", role: "user", shopId: "s1", expiresAt: 9e9 };
const SHOPLESS_SESSION = { userId: "u3", role: "user", shopId: null, expiresAt: 9e9 };
const ADMIN_SESSION = { userId: "a1", role: "admin", shopId: null, expiresAt: 9e9 };

const OWN = { shopId: "s1", amount: 2501, filePath: "s1/inv.pdf" };
const OTHER = { shopId: "s2", amount: 2501, filePath: "s2/inv.pdf" };

beforeEach(() => {
  getSession.mockReset();
  createInvoice.mockReset();
  updateShop.mockReset();
  createInvoice.mockImplementation(async ({ data }: { data: object }) => ({
    id: "i-new",
    ...data,
  }));
  updateShop.mockResolvedValue({});
});
afterEach(() => vi.resetModules());

describe("POST /api/invoices", () => {
  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const { POST } = await loadRoute();
    expect((await POST(postReq(OWN))).status).toBe(401);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("creates an invoice for the caller's own shop", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    const res = await POST(postReq(OWN));

    expect(res.status).toBe(200);
    expect(createInvoice.mock.calls[0][0].data.shop_id).toBe("s1");
  });

  it("lets an admin create for any shop", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    const { POST } = await loadRoute();
    await POST(postReq(OTHER));
    expect(createInvoice.mock.calls[0][0].data.shop_id).toBe("s2");
  });

  // The vulnerability: shop_id came straight from the request body with no
  // check, so any authenticated user could write an invoice into any shop.
  it("refuses to create an invoice in another shop", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    const res = await POST(postReq(OTHER));

    expect(res.status).toBe(404);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("refuses a shopless user entirely", async () => {
    getSession.mockResolvedValue(SHOPLESS_SESSION);
    const { POST } = await loadRoute();

    expect((await POST(postReq(OTHER))).status).toBe(404);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  // The damaging half: isInitial flips the named shop's program_status to
  // "pending", and useEnrollmentGuard then redirects every user of that shop
  // out of the portal. A cross-shop caller must never reach this write.
  it("never touches another shop's program_status", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    await POST(postReq({ ...OTHER, isInitial: true }));

    expect(updateShop).not.toHaveBeenCalled();
  });

  it("still sets the caller's own shop to pending on an initial invoice", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    await POST(postReq({ ...OWN, isInitial: true }));

    expect(updateShop).toHaveBeenCalledTimes(1);
    expect(updateShop.mock.calls[0][0].where.id).toBe("s1");
  });
});
