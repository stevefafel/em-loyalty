import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
const findManyConversations = vi.fn();
const createConversation = vi.fn();
const createMessage = vi.fn();
const findUser = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportConversation: {
      findMany: (...a: unknown[]) => findManyConversations(...a),
    },
    user: { findUnique: (...a: unknown[]) => findUser(...a) },
    // The route creates the conversation + first message in one transaction;
    // hand the callback a tx client exposing only what it touches.
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        supportConversation: {
          create: (...a: unknown[]) => createConversation(...a),
        },
        supportMessage: { create: (...a: unknown[]) => createMessage(...a) },
      }),
  },
}));

vi.mock("@/lib/session", () => ({
  getSession: () => getSession(),
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function getReq(query = "") {
  return new NextRequest(`http://localhost:3000/api/support${query}`);
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost:3000/api/support", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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
  findManyConversations.mockReset();
  createConversation.mockReset();
  createMessage.mockReset();
  findUser.mockReset();
  findManyConversations.mockResolvedValue([]);
  findUser.mockResolvedValue({ first_name: "Ada", last_name: "Lovelace" });
  createConversation.mockImplementation(async ({ data }: { data: object }) => ({
    id: "c-new",
    ...data,
  }));
  createMessage.mockImplementation(async ({ data }: { data: object }) => ({
    id: "m-new",
    ...data,
  }));
});
afterEach(() => vi.resetModules());

describe("GET /api/support", () => {
  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    expect(findManyConversations).not.toHaveBeenCalled();
  });

  it("scopes a shop user to their own shop, ignoring ?shop_id= for another shop", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    findManyConversations.mockResolvedValue([conversation()]);
    const { GET } = await loadRoute();
    const res = await GET(getReq("?shop_id=s2"));

    expect(res.status).toBe(200);
    const where = findManyConversations.mock.calls[0][0].where;
    expect(where.shop_id).toBe("s1");
  });

  it("returns conversations across all shops for an admin with no shop_id", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    findManyConversations.mockResolvedValue([
      conversation({ id: "c1", shop_id: "s1" }),
      conversation({ id: "c2", shop_id: "s2", shop: { name: "Shop Two" } }),
    ]);
    const { GET } = await loadRoute();
    const res = await GET(getReq());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(findManyConversations.mock.calls[0][0].where.shop_id).toBeUndefined();
    expect(json.data.map((c: { shop_id: string }) => c.shop_id)).toEqual([
      "s1",
      "s2",
    ]);
  });

  it("narrows an admin to one shop when ?shop_id= is given", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    const { GET } = await loadRoute();
    await GET(getReq("?shop_id=s2"));
    expect(findManyConversations.mock.calls[0][0].where.shop_id).toBe("s2");
  });

  it("orders by updated_at descending so recent activity floats", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { GET } = await loadRoute();
    await GET(getReq());
    expect(findManyConversations.mock.calls[0][0].orderBy).toEqual({
      updated_at: "desc",
    });
  });

  it("reports a conversation unread to the shop when an admin replied after shop_read_at", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    findManyConversations.mockResolvedValue([
      conversation({
        shop_read_at: new Date("2026-08-02T00:00:00Z"),
        messages: [
          {
            created_at: new Date("2026-08-03T00:00:00Z"),
            author_role: "admin",
          },
        ],
      }),
    ]);
    const { GET } = await loadRoute();
    const json = await (await GET(getReq())).json();

    expect(json.data[0].unread).toBe(true);
    expect(json.unread).toBe(1);
  });

  it("does not report unread when the shop already read the latest admin reply", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    findManyConversations.mockResolvedValue([
      conversation({
        shop_read_at: new Date("2026-08-04T00:00:00Z"),
        messages: [
          {
            created_at: new Date("2026-08-03T00:00:00Z"),
            author_role: "admin",
          },
        ],
      }),
    ]);
    const { GET } = await loadRoute();
    const json = await (await GET(getReq())).json();

    expect(json.data[0].unread).toBe(false);
    expect(json.unread).toBe(0);
  });

  it("does not report the shop's own newest message as unread to the shop", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    findManyConversations.mockResolvedValue([
      conversation({
        shop_read_at: null,
        messages: [
          { created_at: new Date("2026-08-03T00:00:00Z"), author_role: "user" },
        ],
      }),
    ]);
    const { GET } = await loadRoute();
    const json = await (await GET(getReq())).json();

    expect(json.data[0].unread).toBe(false);
  });

  it("reports a shop's new message as unread to the admin side", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    findManyConversations.mockResolvedValue([
      conversation({
        admin_read_at: null,
        messages: [
          { created_at: new Date("2026-08-03T00:00:00Z"), author_role: "user" },
        ],
      }),
    ]);
    const { GET } = await loadRoute();
    const json = await (await GET(getReq())).json();

    expect(json.data[0].unread).toBe(true);
  });
});

describe("POST /api/support", () => {
  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(postReq({ subject: "Hi", body: "Help" }));
    expect(res.status).toBe(401);
    expect(createConversation).not.toHaveBeenCalled();
  });

  it("creates an open conversation plus exactly one message, shop taken from the session", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    const res = await POST(
      postReq({ subject: "  Points missing  ", body: "  Where are they?  " })
    );

    expect(res.status).toBe(201);
    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(createMessage).toHaveBeenCalledTimes(1);

    const conv = createConversation.mock.calls[0][0].data;
    expect(conv.shop_id).toBe("s1");
    expect(conv.opened_by_user_id).toBe("u1");
    expect(conv.status).toBe("open");
    expect(conv.subject).toBe("Points missing");

    const msg = createMessage.mock.calls[0][0].data;
    expect(msg.conversation_id).toBe("c-new");
    expect(msg.author_user_id).toBe("u1");
    expect(msg.author_role).toBe("user");
    expect(msg.author_name).toBe("Ada Lovelace");
    expect(msg.body).toBe("Where are they?");
  });

  it("never takes the shop from the request body", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    await POST(postReq({ subject: "Hi", body: "Help", shop_id: "s2" }));
    expect(createConversation.mock.calls[0][0].data.shop_id).toBe("s1");
  });

  it("sets updated_at explicitly on the new conversation", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    await POST(postReq({ subject: "Hi", body: "Help" }));
    expect(createConversation.mock.calls[0][0].data.updated_at).toBeInstanceOf(
      Date
    );
  });

  it("rejects an empty or whitespace-only subject with 400 field errors", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    const res = await POST(postReq({ subject: "   ", body: "Help" }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.subject?.length).toBeGreaterThan(0);
    expect(createConversation).not.toHaveBeenCalled();
  });

  it("rejects an empty body with 400 field errors", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    const res = await POST(postReq({ subject: "Hi", body: "" }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.body?.length).toBeGreaterThan(0);
  });

  it("returns 403 when an admin (no shop) tries to open a conversation", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    const { POST } = await loadRoute();
    const res = await POST(postReq({ subject: "Hi", body: "Help" }));
    expect(res.status).toBe(403);
    expect(createConversation).not.toHaveBeenCalled();
  });
});
