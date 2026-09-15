import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
const findInvoice = vi.fn();
const aggregateLedger = vi.fn();
const updateInvoice = vi.fn();
const createLedger = vi.fn();
const updateShop = vi.fn();
const updateManyExtraction = vi.fn();
const transaction = vi.fn();

// Each write returns a tagged marker so the test can see exactly which
// operations were handed to the (atomic) array transaction, and in what order.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findUnique: (...a: unknown[]) => findInvoice(...a),
      update: (...a: unknown[]) => (updateInvoice(...a), { op: "invoice.update" }),
    },
    loyaltyLedger: {
      aggregate: (...a: unknown[]) => aggregateLedger(...a),
      create: (...a: unknown[]) => (createLedger(...a), { op: "ledger.create" }),
    },
    shop: { update: (...a: unknown[]) => (updateShop(...a), { op: "shop.update" }) },
    invoiceExtraction: {
      updateMany: (...a: unknown[]) => (updateManyExtraction(...a), { op: "extraction.updateMany" }),
    },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));

vi.mock("@/lib/session", () => ({
  getSession: () => getSession(),
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

const RUN = "11111111-1111-4111-8111-111111111111";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const ADMIN_SESSION = { userId: "a1", role: "admin", shopId: null, expiresAt: 9e9 };
const SHOP_SESSION = { userId: "u1", role: "user", shopId: "s1", expiresAt: 9e9 };

function postReq() {
  return new NextRequest("http://localhost:3000/api/invoices/i1/unapprove", { method: "POST" });
}
function ctx(id = "i1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  for (const m of [
    getSession,
    findInvoice,
    aggregateLedger,
    updateInvoice,
    createLedger,
    updateShop,
    updateManyExtraction,
    transaction,
  ]) {
    m.mockReset();
  }
  getSession.mockResolvedValue(ADMIN_SESSION);
  findInvoice.mockResolvedValue({
    id: "i1",
    shop_id: "s1",
    status: "approved",
    is_initial: true,
  });
  aggregateLedger.mockResolvedValue({ _sum: { points_delta: null } });
  transaction.mockImplementation(async (ops: unknown[]) => ops);
});
afterEach(() => vi.resetModules());

describe("POST /api/invoices/[id]/unapprove", () => {
  it("returns 401 for a non-admin session", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    expect((await POST(postReq(), ctx())).status).toBe(401);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("still refuses an invoice that is not approved", async () => {
    findInvoice.mockResolvedValue({ id: "i1", shop_id: "s1", status: "pending", is_initial: false });
    const { POST } = await loadRoute();
    expect((await POST(postReq(), ctx())).status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("clears the approval and the confirmation and rotates run_id, atomically with the status change", async () => {
    const { POST } = await loadRoute();
    const res = await POST(postReq(), ctx());

    expect(res.status).toBe(200);
    expect(updateManyExtraction).toHaveBeenCalledTimes(1);
    const [args] = updateManyExtraction.mock.calls[0] as [
      { where: Record<string, unknown>; data: Record<string, unknown> },
    ];
    expect(args.where).toEqual({ invoice_id: "i1" });
    expect(args.data).toEqual({
      approved_run_id: null,
      confirmed_run_id: null,
      confirmed_at: null,
      confirmed_by: null,
      run_id: expect.stringMatching(UUID_RE),
      updated_at: expect.any(Date),
    });
    // A tab opened before the unapprove reviewed the old run; it is now stale.
    expect(args.data.run_id).not.toBe(RUN);

    // One transaction: the extraction row first (the approve lock order),
    // then the invoice back to pending.
    expect(transaction).toHaveBeenCalledTimes(1);
    const ops = (transaction.mock.calls[0][0] as { op: string }[]).map((o) => o.op);
    expect(ops[0]).toBe("extraction.updateMany");
    expect(ops).toContain("invoice.update");
    expect(updateInvoice).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { status: "pending", updated_at: expect.any(Date) },
    });
  });

  it("gives every unapprove a fresh run_id", async () => {
    const { POST } = await loadRoute();
    await POST(postReq(), ctx());
    await POST(postReq(), ctx());
    const ids = updateManyExtraction.mock.calls.map(
      (c) => (c[0] as { data: { run_id: string } }).data.run_id
    );
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("keeps reverting the shop's program status for an initial invoice", async () => {
    const { POST } = await loadRoute();
    await POST(postReq(), ctx());
    expect(updateShop).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({ program_status: "pending" }),
    });
  });
});
