import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
const findInvoice = vi.fn();
const upsertExtraction = vi.fn();
const deleteLineItems = vi.fn();
const extractInvoiceData = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findUnique: (...a: unknown[]) => findInvoice(...a) },
    invoiceExtraction: {
      upsert: (...a: unknown[]) => upsertExtraction(...a),
      update: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({ id: "e1", line_items: [] }),
    },
    invoiceLineItem: {
      deleteMany: (...a: unknown[]) => deleteLineItems(...a),
      create: vi.fn(),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));

// Storage + the AI call are the expensive side effects an unauthorized caller
// must never reach; assert they stay untouched rather than exercising them.
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        download: async () => ({ data: null, error: { message: "not called" } }),
      }),
    },
  }),
}));
vi.mock("@/lib/ai/extract-invoice", () => ({
  extractInvoiceData: (...a: unknown[]) => extractInvoiceData(...a),
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function postReq(id = "i1") {
  return new NextRequest(`http://localhost:3000/api/invoices/${id}/extract`, {
    method: "POST",
  });
}

function ctx(id = "i1") {
  return { params: Promise.resolve({ id }) };
}

const SHOP_SESSION = { userId: "u1", role: "user", shopId: "s1", expiresAt: 9e9 };
const OTHER_SHOP_SESSION = { userId: "u2", role: "user", shopId: "s2", expiresAt: 9e9 };
const SHOPLESS_SESSION = { userId: "u3", role: "user", shopId: null, expiresAt: 9e9 };
const ADMIN_SESSION = { userId: "a1", role: "admin", shopId: null, expiresAt: 9e9 };

beforeEach(() => {
  getSession.mockReset();
  findInvoice.mockReset();
  upsertExtraction.mockReset();
  deleteLineItems.mockReset();
  extractInvoiceData.mockReset();

  findInvoice.mockResolvedValue({
    id: "i1",
    shop_id: "s1",
    file_path: "s1/invoice.pdf",
  });
  upsertExtraction.mockResolvedValue({ id: "e1" });
  deleteLineItems.mockResolvedValue({ count: 0 });
});
afterEach(() => vi.resetModules());

describe("POST /api/invoices/[id]/extract", () => {
  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const { POST } = await loadRoute();
    expect((await POST(postReq(), ctx())).status).toBe(401);
    expect(upsertExtraction).not.toHaveBeenCalled();
  });

  it("lets a user of the invoice's own shop trigger extraction", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    await POST(postReq(), ctx());
    expect(upsertExtraction).toHaveBeenCalled();
  });

  it("lets an admin trigger extraction on any shop's invoice", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    const { POST } = await loadRoute();
    await POST(postReq(), ctx());
    expect(upsertExtraction).toHaveBeenCalled();
  });

  // The destructive half of the vulnerability: a cross-shop caller could reset
  // another shop's extraction to "processing", null its parsed values, delete
  // its line items, and burn a paid AI call.
  it("returns 404 and mutates nothing for a user of another shop", async () => {
    getSession.mockResolvedValue(OTHER_SHOP_SESSION);
    const { POST } = await loadRoute();
    const res = await POST(postReq(), ctx());

    expect(res.status).toBe(404);
    expect(upsertExtraction).not.toHaveBeenCalled();
    expect(deleteLineItems).not.toHaveBeenCalled();
    expect(extractInvoiceData).not.toHaveBeenCalled();
  });

  it("returns 404 and mutates nothing for a user with no shop", async () => {
    getSession.mockResolvedValue(SHOPLESS_SESSION);
    const { POST } = await loadRoute();

    expect((await POST(postReq(), ctx())).status).toBe(404);
    expect(upsertExtraction).not.toHaveBeenCalled();
    expect(extractInvoiceData).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing invoice without touching extraction", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    findInvoice.mockResolvedValue(null);
    const { POST } = await loadRoute();

    expect((await POST(postReq(), ctx())).status).toBe(404);
    expect(upsertExtraction).not.toHaveBeenCalled();
  });
});
