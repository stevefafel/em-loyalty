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

function postReq(id = "c1") {
  return new NextRequest(`http://localhost:3000/api/support/${id}/close`, {
    method: "POST",
  });
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
    subject: "Points missing",
    status: "open",
    updated_at: new Date("2026-08-01T00:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  getSession.mockReset();
  findConversation.mockReset();
  updateConversation.mockReset();

  findConversation.mockResolvedValue(conversation());
  updateConversation.mockImplementation(async ({ data }: { data: object }) => ({
    ...conversation(),
    ...data,
  }));
});
afterEach(() => vi.resetModules());

describe("POST /api/support/[id]/close", () => {
  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(postReq(), ctx());

    expect(res.status).toBe(401);
    expect(updateConversation).not.toHaveBeenCalled();
  });

  // R8: a shop asks, an admin resolves. Closing is not the shop's to do, even
  // for its own thread.
  it("rejects a shop user closing their own shop's thread", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    const res = await POST(postReq(), ctx());

    expect(res.status).toBe(401);
    expect(updateConversation).not.toHaveBeenCalled();
  });

  it("closes an open conversation and bumps updated_at", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    const { POST } = await loadRoute();
    const res = await POST(postReq(), ctx());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(updateConversation).toHaveBeenCalledTimes(1);
    const call = updateConversation.mock.calls[0][0];
    expect(call.where).toEqual({ id: "c1" });
    expect(call.data.status).toBe("closed");
    expect(call.data.updated_at).toBeInstanceOf(Date);
    expect(json.data.status).toBe("closed");
  });

  it("rejects closing an already-closed conversation with 400", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    findConversation.mockResolvedValue(conversation({ status: "closed" }));
    const { POST } = await loadRoute();
    const res = await POST(postReq(), ctx());

    expect(res.status).toBe(400);
    expect(updateConversation).not.toHaveBeenCalled();
  });

  it("returns 404 when the conversation does not exist", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    findConversation.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(postReq("nope"), ctx("nope"));

    expect(res.status).toBe(404);
    expect(updateConversation).not.toHaveBeenCalled();
  });

  it("closes the conversation named by the route params", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    const { POST } = await loadRoute();
    await POST(postReq("c7"), ctx("c7"));

    expect(findConversation.mock.calls[0][0].where).toEqual({ id: "c7" });
    expect(updateConversation.mock.calls[0][0].where).toEqual({ id: "c7" });
  });

  it("lets an admin close any shop's thread", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    findConversation.mockResolvedValue(conversation({ shop_id: "s2" }));
    const { POST } = await loadRoute();
    const res = await POST(postReq(), ctx());

    expect(res.status).toBe(200);
    expect(updateConversation).toHaveBeenCalledTimes(1);
  });
});
