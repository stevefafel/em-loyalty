import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
const findConversation = vi.fn();
const findUser = vi.fn();
const createMessage = vi.fn();
const updateConversation = vi.fn();
const createNotification = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supportConversation: {
      findUnique: (...a: unknown[]) => findConversation(...a),
    },
    user: { findUnique: (...a: unknown[]) => findUser(...a) },
    // The reply, the updated_at bump and the admin alert are one transaction;
    // hand the callback a tx client exposing only what it touches.
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        supportMessage: { create: (...a: unknown[]) => createMessage(...a) },
        supportConversation: {
          // updateMany, not update: the bump is scoped to status "open" so it
          // doubles as the terminal guard inside the transaction.
          updateMany: (...a: unknown[]) => updateConversation(...a),
        },
        notification: { create: (...a: unknown[]) => createNotification(...a) },
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

function postReq(body: unknown, id = "c1") {
  return new NextRequest(`http://localhost:3000/api/support/${id}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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
    ...over,
  };
}

beforeEach(() => {
  getSession.mockReset();
  findConversation.mockReset();
  findUser.mockReset();
  createMessage.mockReset();
  updateConversation.mockReset();
  createNotification.mockReset();

  findConversation.mockResolvedValue(conversation());
  findUser.mockResolvedValue({ first_name: "Ada", last_name: "Lovelace" });
  createMessage.mockImplementation(async ({ data }: { data: object }) => ({
    id: "m-new",
    ...data,
  }));
  // One row matched: the conversation was still open at write time.
  updateConversation.mockResolvedValue({ count: 1 });
  createNotification.mockResolvedValue({ id: "n-new" });
});
afterEach(() => vi.resetModules());

describe("POST /api/support/[id]/messages", () => {
  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(postReq({ body: "Any news?" }), ctx());
    expect(res.status).toBe(401);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("appends a shop reply with role user and writes no notification", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    const res = await POST(postReq({ body: "  Any news?  " }), ctx());

    expect(res.status).toBe(201);
    expect(createMessage).toHaveBeenCalledTimes(1);
    const msg = createMessage.mock.calls[0][0].data;
    expect(msg.conversation_id).toBe("c1");
    expect(msg.author_user_id).toBe("u1");
    expect(msg.author_role).toBe("user");
    expect(msg.author_name).toBe("Ada Lovelace");
    expect(msg.body).toBe("Any news?");

    expect(createNotification).not.toHaveBeenCalled();
  });

  it("appends an admin reply and alerts that conversation's shop exactly once", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    findUser.mockResolvedValue({ first_name: "Grace", last_name: "Hopper" });
    findConversation.mockResolvedValue(
      conversation({ shop_id: "s2", subject: "Points missing" })
    );
    const { POST } = await loadRoute();
    const res = await POST(postReq({ body: "Fixed it." }), ctx());

    expect(res.status).toBe(201);
    const msg = createMessage.mock.calls[0][0].data;
    expect(msg.author_role).toBe("admin");
    expect(msg.author_name).toBe("Grace Hopper");

    expect(createNotification).toHaveBeenCalledTimes(1);
    const notif = createNotification.mock.calls[0][0].data;
    expect(notif.shop_id).toBe("s2");
    expect(notif.type).toBe("support_reply");
    expect(notif.title.length).toBeGreaterThan(0);
    expect(notif.body).toContain("Points missing");
  });

  it("bumps the conversation's updated_at on any reply", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    await POST(postReq({ body: "Any news?" }), ctx());

    expect(updateConversation).toHaveBeenCalledTimes(1);
    const call = updateConversation.mock.calls[0][0];
    // Scoped to open, so the same statement enforces the terminal guard.
    expect(call.where).toEqual({ id: "c1", status: "open" });
    expect(call.data.updated_at).toBeInstanceOf(Date);
  });

  it("rejects a reply when the thread closes between the guard and the write", async () => {
    // The pre-flight guard saw an open thread, but a close committed before the
    // transaction ran, so the scoped bump matches no rows.
    getSession.mockResolvedValue(SHOP_SESSION);
    updateConversation.mockResolvedValue({ count: 0 });
    const { POST } = await loadRoute();

    const res = await POST(postReq({ body: "Slipped through?" }), ctx());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Conversation is closed");
  });

  it("returns 404 when the author's user row is missing", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    findUser.mockResolvedValue(null);
    const { POST } = await loadRoute();

    const res = await POST(postReq({ body: "Hello?" }), ctx());

    expect(res.status).toBe(404);
    expect(createMessage).not.toHaveBeenCalled();
    expect(updateConversation).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("takes the author from the session even when the body supplies another", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    await POST(
      postReq({
        body: "Any news?",
        author_user_id: "u-evil",
        author_role: "admin",
        author_name: "Totally An Admin",
      }),
      ctx()
    );

    const msg = createMessage.mock.calls[0][0].data;
    expect(msg.author_user_id).toBe("u1");
    expect(msg.author_role).toBe("user");
    expect(msg.author_name).toBe("Ada Lovelace");
    // A forged admin author must not trigger the shop alert either.
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("rejects an empty or whitespace-only body with 400 field errors", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    const res = await POST(postReq({ body: "   " }), ctx());

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.body?.length).toBeGreaterThan(0);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("returns 404 (not 403) when a shop user replies to another shop's thread", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    findConversation.mockResolvedValue(conversation({ shop_id: "s2" }));
    const { POST } = await loadRoute();
    const res = await POST(postReq({ body: "Any news?" }), ctx());

    expect(res.status).toBe(404);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("returns 404 when the conversation does not exist", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    findConversation.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(postReq({ body: "Any news?" }), ctx("nope"));

    expect(res.status).toBe(404);
    expect(createMessage).not.toHaveBeenCalled();
  });

  // R9/KTD5: closed is terminal for messages. The hidden composer is a
  // courtesy; this rejection is the guarantee, so both roles are proven here.
  it("rejects a shop reply to a closed conversation with 400", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    findConversation.mockResolvedValue(conversation({ status: "closed" }));
    const { POST } = await loadRoute();
    const res = await POST(postReq({ body: "One more thing" }), ctx());

    expect(res.status).toBe(400);
    expect(createMessage).not.toHaveBeenCalled();
    expect(updateConversation).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("rejects an admin reply to a closed conversation with 400", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    findConversation.mockResolvedValue(conversation({ status: "closed" }));
    const { POST } = await loadRoute();
    const res = await POST(postReq({ body: "Reopening this" }), ctx());

    expect(res.status).toBe(400);
    expect(createMessage).not.toHaveBeenCalled();
    expect(updateConversation).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("selects the conversation status so the terminal guard can see it", async () => {
    getSession.mockResolvedValue(SHOP_SESSION);
    const { POST } = await loadRoute();
    await POST(postReq({ body: "Any news?" }), ctx());

    expect(findConversation.mock.calls[0][0].select.status).toBe(true);
  });
});
