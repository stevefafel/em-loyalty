import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const findManyConversations = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
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
const SHOP_SESSION = {
  userId: "u1",
  role: "user",
  shopId: "s1",
  expiresAt: 9e9,
};

const AUG_1 = new Date("2026-08-01T00:00:00Z");
const AUG_3 = new Date("2026-08-03T00:00:00Z");

function conversation(over: Record<string, unknown> = {}) {
  return {
    shop_id: "s1",
    status: "open",
    admin_read_at: null,
    messages: [{ created_at: AUG_1, author_role: "user" }],
    ...over,
  };
}

beforeEach(() => {
  getSession.mockReset();
  findManyConversations.mockReset();
  findManyConversations.mockResolvedValue([]);
});
afterEach(() => vi.resetModules());

describe("GET /api/support/awaiting", () => {
  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(findManyConversations).not.toHaveBeenCalled();
  });

  it("returns 401 for a shop user — this is an admin badge", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(findManyConversations).not.toHaveBeenCalled();
  });

  it("counts every conversation waiting on an admin, across shops", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    findManyConversations.mockResolvedValue([
      conversation({ shop_id: "s1" }),
      conversation({ shop_id: "s1" }),
      conversation({ shop_id: "s2" }),
    ]);
    const { GET } = await loadRoute();
    const json = await (await GET()).json();
    expect(json.data.count).toBe(3);
  });

  it("excludes threads the admin has read and threads the admin answered", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    findManyConversations.mockResolvedValue([
      conversation({ admin_read_at: AUG_3 }),
      conversation({ messages: [{ created_at: AUG_3, author_role: "admin" }] }),
      conversation({ status: "closed" }),
      conversation({ messages: [] }),
    ]);
    const { GET } = await loadRoute();
    const json = await (await GET()).json();
    expect(json.data.count).toBe(0);
  });

  it("asks the database only for open threads with their newest message", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    const { GET } = await loadRoute();
    await GET();
    const arg = findManyConversations.mock.calls[0][0];
    expect(arg.where).toEqual({ status: "open" });
    expect(arg.select.messages.take).toBe(1);
    expect(arg.select.messages.orderBy).toEqual({ created_at: "desc" });
  });
});
