import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
const findConversation = vi.fn();
const updateConversation = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportConversation: {
      findUnique: (...a: unknown[]) => findConversation(...a),
      update: (...a: unknown[]) => updateConversation(...a),
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

function getReq(id = "c1") {
  return new NextRequest(`http://localhost:3000/api/support/${id}`);
}

function ctx(id = "c1") {
  return { params: Promise.resolve({ id }) };
}

const SHOP_SESSION = {
  userId: "u1",
  role: "user",
  shopId: "s1",
  expiresAt: 9e9,
};
const ADMIN_SESSION = {
  userId: "a1",
  role: "admin",
  shopId: null,
  expiresAt: 9e9,
};

function conversation(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    shop_id: "s1",
    opened_by_user_id: "u1",
    subject: "Points missing",
    status: "open",
    shop_read_at: null,
    admin_read_at: null,
    created_at: new Date("2026-08-01T00:00:00Z"),
    updated_at: new Date("2026-08-01T00:00:00Z"),
    shop: { name: "Shop One" },
    messages: [],
    ...over,
  };
}

beforeEach(() => {
  getSession.mockReset();
  findConversation.mockReset();
  updateConversation.mockReset();
  findConversation.mockResolvedValue(conversation());
  updateConversation.mockResolvedValue(conversation());
});
afterEach(() => vi.resetModules());

describe("GET /api/support/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(401);
    expect(findConversation).not.toHaveBeenCalled();
  });

  it("returns the thread with its messages oldest-first", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    findConversation.mockResolvedValue(
      conversation({
        messages: [
          { id: "m1", body: "First", created_at: new Date("2026-08-01T00:00:00Z") },
          { id: "m2", body: "Second", created_at: new Date("2026-08-02T00:00:00Z") },
        ],
      })
    );
    const { GET } = await loadRoute();
    const res = await GET(getReq(), ctx());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(findConversation.mock.calls[0][0].include.messages.orderBy).toEqual({
      created_at: "asc",
    });
    expect(json.data.messages.map((m: { id: string }) => m.id)).toEqual([
      "m1",
      "m2",
    ]);
  });

  it("returns 404 (not 403) when a shop user asks for another shop's thread", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    findConversation.mockResolvedValue(conversation({ shop_id: "s2" }));
    const { GET } = await loadRoute();
    const res = await GET(getReq("c9"), ctx("c9"));

    expect(res.status).toBe(404);
    expect(updateConversation).not.toHaveBeenCalled();
  });

  it("returns 404 when the conversation does not exist", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    findConversation.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const res = await GET(getReq("nope"), ctx("nope"));

    expect(res.status).toBe(404);
    expect(updateConversation).not.toHaveBeenCalled();
  });

  it("lets an admin read any shop's thread", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    findConversation.mockResolvedValue(conversation({ shop_id: "s2" }));
    const { GET } = await loadRoute();
    const res = await GET(getReq(), ctx());
    expect(res.status).toBe(200);
  });

  it("stamps shop_read_at only, for a shop user", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { GET } = await loadRoute();
    const res = await GET(getReq(), ctx());

    expect(updateConversation).toHaveBeenCalledTimes(1);
    const call = updateConversation.mock.calls[0][0];
    expect(call.where).toEqual({ id: "c1" });
    expect(call.data.shop_read_at).toBeInstanceOf(Date);
    expect(call.data.admin_read_at).toBeUndefined();
    // Reading a thread must not reorder the queue.
    expect(call.data.updated_at).toBeUndefined();

    const json = await res.json();
    expect(json.data.shop_read_at).not.toBeNull();
    expect(json.data.admin_read_at).toBeNull();
  });

  it("stamps admin_read_at only, for an admin", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    const { GET } = await loadRoute();
    const res = await GET(getReq(), ctx());

    const call = updateConversation.mock.calls[0][0];
    expect(call.data.admin_read_at).toBeInstanceOf(Date);
    expect(call.data.shop_read_at).toBeUndefined();

    const json = await res.json();
    expect(json.data.admin_read_at).not.toBeNull();
    expect(json.data.shop_read_at).toBeNull();
  });

  it("reads the conversation by the id from the route params", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { GET } = await loadRoute();
    await GET(getReq("c1"), ctx("c1"));
    expect(findConversation.mock.calls[0][0].where).toEqual({ id: "c1" });
  });
});
