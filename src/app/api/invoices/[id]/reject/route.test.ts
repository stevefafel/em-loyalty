import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
const findInvoice = vi.fn();
const updateInvoice = vi.fn();
const updateManyInvoice = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findUnique: (...a: unknown[]) => findInvoice(...a),
      update: (...a: unknown[]) => updateInvoice(...a),
      updateMany: (...a: unknown[]) => updateManyInvoice(...a),
    },
  },
}));

vi.mock("@/lib/session", () => ({
  getSession: () => getSession(),
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function postReq(id = "i1") {
  return new NextRequest(`http://localhost:3000/api/invoices/${id}/reject`, { method: "POST" });
}

function ctx(id = "i1") {
  return { params: Promise.resolve({ id }) };
}

const ADMIN_SESSION = { userId: "a1", role: "admin", shopId: null, expiresAt: 9e9 };
const SHOP_SESSION = { userId: "u1", role: "user", shopId: "s1", expiresAt: 9e9 };

function invoice(over: Record<string, unknown> = {}) {
  return { id: "i1", shop_id: "s1", status: "pending", amount: 2501, ...over };
}

beforeEach(() => {
  for (const m of [getSession, findInvoice, updateInvoice, updateManyInvoice]) m.mockReset();
  getSession.mockResolvedValue(ADMIN_SESSION);
  findInvoice.mockResolvedValue(invoice());
  updateManyInvoice.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.resetModules());

describe("POST /api/invoices/[id]/reject", () => {
  it("returns 401 for a non-admin session", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    const res = await POST(postReq(), ctx());
    expect(res.status).toBe(401);
    expect(findInvoice).not.toHaveBeenCalled();
    expect(updateManyInvoice).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const { POST } = await loadRoute();
    expect((await POST(postReq(), ctx())).status).toBe(401);
    expect(updateManyInvoice).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing invoice", async () => {
    findInvoice.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(postReq(), ctx());
    expect(res.status).toBe(404);
    expect(updateManyInvoice).not.toHaveBeenCalled();
  });

  it.each(["approved", "rejected"])("returns 400 for an invoice that is already %s", async (status) => {
    findInvoice.mockResolvedValue(invoice({ status }));
    const { POST } = await loadRoute();
    const res = await POST(postReq(), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Only pending invoices can be rejected");
    expect(updateManyInvoice).not.toHaveBeenCalled();
  });

  it("rejects a pending invoice with a write conditioned on it still being pending", async () => {
    const { POST } = await loadRoute();
    const res = await POST(postReq(), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { invoiceId: "i1", status: "rejected" } });
    expect(updateManyInvoice).toHaveBeenCalledTimes(1);
    expect(updateManyInvoice).toHaveBeenCalledWith({
      where: { id: "i1", status: "pending" },
      data: { status: "rejected", updated_at: expect.any(Date) },
    });
    // Never the unconditional write that could overwrite a fresh approval.
    expect(updateInvoice).not.toHaveBeenCalled();
  });

  // An approval committed between the pending read and the write: the
  // conditional update misses and the approved invoice is left alone.
  it("returns 409 when the invoice stopped being pending before the write", async () => {
    updateManyInvoice.mockResolvedValue({ count: 0 });
    const { POST } = await loadRoute();
    const res = await POST(postReq(), ctx());

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Invoice is no longer pending. Refresh and try again.",
    });
    expect(updateInvoice).not.toHaveBeenCalled();
  });
});
