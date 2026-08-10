import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const findManyShops = vi.fn();
const findManyOilChanges = vi.fn();
const findManyConversations = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shop: { findMany: (...a: unknown[]) => findManyShops(...a) },
    oilChangeCount: { findMany: (...a: unknown[]) => findManyOilChanges(...a) },
    supportConversation: {
      findMany: (...a: unknown[]) => findManyConversations(...a),
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

const ADMIN_SESSION = {
  userId: "a1",
  role: "admin",
  shopId: null,
  expiresAt: 9e9,
};

const AUG_1 = new Date("2026-08-01T00:00:00Z");
const AUG_3 = new Date("2026-08-03T00:00:00Z");

function shop(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    name: "Shop One",
    program_status: "approved",
    loyalty_points_balance: 0,
    sent_welcome_packet_at: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

function conversation(over: Record<string, unknown> = {}) {
  return {
    shop_id: "s1",
    status: "open",
    admin_read_at: null,
    messages: [{ created_at: AUG_1, author_role: "user" }],
    ...over,
  };
}

type ShopRow = { id: string; reasons: string[] };

async function shopsFromRoute(): Promise<ShopRow[]> {
  const { GET } = await loadRoute();
  const json = await (await GET()).json();
  return json.data.shops;
}

beforeEach(() => {
  getSession.mockReset();
  findManyShops.mockReset();
  findManyOilChanges.mockReset();
  findManyConversations.mockReset();
  getSession.mockResolvedValue(ADMIN_SESSION);
  findManyShops.mockResolvedValue([]);
  findManyOilChanges.mockResolvedValue([]);
  findManyConversations.mockResolvedValue([]);
});
afterEach(() => vi.resetModules());

describe("GET /api/shops/attention", () => {
  it("returns 401 for a non-admin", async () => {
    getSession.mockResolvedValue({ userId: "u1", role: "user", shopId: "s1" });
    const { GET } = await loadRoute();
    expect((await GET()).status).toBe(401);
    expect(findManyShops).not.toHaveBeenCalled();
  });

  it("flags a shop with an open conversation waiting on an admin", async () => {
    findManyShops.mockResolvedValue([shop()]);
    findManyConversations.mockResolvedValue([conversation()]);
    const shops = await shopsFromRoute();
    expect(shops).toHaveLength(1);
    expect(shops[0].reasons).toEqual(["open_support_request"]);
  });

  it("gives the reason once when a shop has two waiting conversations", async () => {
    findManyShops.mockResolvedValue([shop()]);
    findManyConversations.mockResolvedValue([conversation(), conversation()]);
    const shops = await shopsFromRoute();
    expect(
      shops[0].reasons.filter((r) => r === "open_support_request")
    ).toHaveLength(1);
  });

  it("does not flag shops whose threads are read, answered, or closed", async () => {
    findManyShops.mockResolvedValue([
      shop({ id: "s1" }),
      shop({ id: "s2" }),
      shop({ id: "s3" }),
    ]);
    findManyConversations.mockResolvedValue([
      conversation({ shop_id: "s1", admin_read_at: AUG_3 }),
      conversation({
        shop_id: "s2",
        messages: [{ created_at: AUG_3, author_role: "admin" }],
      }),
      conversation({ shop_id: "s3", status: "closed" }),
    ]);
    expect(await shopsFromRoute()).toEqual([]);
  });

  it("adds the reason alongside the existing ones without displacing them", async () => {
    findManyShops.mockResolvedValue([
      shop({
        program_status: "pending",
        loyalty_points_balance: 1_000_000,
        sent_welcome_packet_at: null,
      }),
    ]);
    findManyConversations.mockResolvedValue([conversation()]);
    const shops = await shopsFromRoute();
    expect(shops[0].reasons).toContain("awaiting_approval");
    expect(shops[0].reasons).toContain("high_balance");
    expect(shops[0].reasons).toContain("open_support_request");
  });

  it("keeps awaiting_approval on top of the sort", async () => {
    findManyShops.mockResolvedValue([
      shop({ id: "s1", loyalty_points_balance: 500 }),
      shop({ id: "s2", program_status: "pending", loyalty_points_balance: 0 }),
    ]);
    findManyConversations.mockResolvedValue([conversation({ shop_id: "s1" })]);
    expect((await shopsFromRoute()).map((s) => s.id)).toEqual(["s2", "s1"]);
  });

  it("reports as many shops as the badge counts when each shop has one thread", async () => {
    // Same data through both admin surfaces: three waiting threads spread one
    // per shop is a badge count of 3 and three flagged shops.
    findManyShops.mockResolvedValue([
      shop({ id: "s1" }),
      shop({ id: "s2" }),
      shop({ id: "s3" }),
    ]);
    const rows = [
      conversation({ shop_id: "s1" }),
      conversation({ shop_id: "s2" }),
      conversation({ shop_id: "s3" }),
    ];
    findManyConversations.mockResolvedValue(rows);

    const { isAwaitingAdminResponse } = await import("@/lib/support");
    expect(rows.filter(isAwaitingAdminResponse)).toHaveLength(3);
    expect(await shopsFromRoute()).toHaveLength(3);
  });
});
