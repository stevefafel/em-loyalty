import { describe, it, expect } from "vitest";
import {
  awaitingAdminResponseQuery,
  isAwaitingAdminResponse,
  shopIdsAwaitingAdminResponse,
} from "./support";

const AUG_1 = new Date("2026-08-01T00:00:00Z");
const AUG_2 = new Date("2026-08-02T00:00:00Z");
const AUG_3 = new Date("2026-08-03T00:00:00Z");

function conversation(over: Record<string, unknown> = {}) {
  return {
    shop_id: "s1",
    status: "open",
    admin_read_at: null as Date | null,
    // Newest first, exactly as the routes query it.
    messages: [{ created_at: AUG_2, author_role: "user" }],
    ...over,
  };
}

describe("isAwaitingAdminResponse", () => {
  it("is awaiting when the shop's newest message is newer than admin_read_at", () => {
    expect(
      isAwaitingAdminResponse(
        conversation({
          admin_read_at: AUG_1,
          messages: [{ created_at: AUG_2, author_role: "user" }],
        })
      )
    ).toBe(true);
  });

  it("is not awaiting once the admin has opened it", () => {
    expect(
      isAwaitingAdminResponse(
        conversation({
          admin_read_at: AUG_3,
          messages: [{ created_at: AUG_2, author_role: "user" }],
        })
      )
    ).toBe(false);
  });

  it("is not awaiting when admin_read_at exactly matches the newest message", () => {
    expect(
      isAwaitingAdminResponse(
        conversation({
          admin_read_at: AUG_2,
          messages: [{ created_at: AUG_2, author_role: "user" }],
        })
      )
    ).toBe(false);
  });

  it("is not awaiting when the newest message is the admin's own reply", () => {
    expect(
      isAwaitingAdminResponse(
        conversation({
          admin_read_at: null,
          messages: [{ created_at: AUG_3, author_role: "admin" }],
        })
      )
    ).toBe(false);
  });

  it("is awaiting when the admin has never read the thread", () => {
    expect(
      isAwaitingAdminResponse(
        conversation({
          admin_read_at: null,
          messages: [{ created_at: AUG_1, author_role: "user" }],
        })
      )
    ).toBe(true);
  });

  it("is never awaiting once closed, whatever the read stamps say", () => {
    expect(
      isAwaitingAdminResponse(
        conversation({
          status: "closed",
          admin_read_at: null,
          messages: [{ created_at: AUG_3, author_role: "user" }],
        })
      )
    ).toBe(false);
  });

  it("is not awaiting when the thread has no messages", () => {
    expect(isAwaitingAdminResponse(conversation({ messages: [] }))).toBe(false);
  });

  it("reads only the newest message, ignoring older shop messages under it", () => {
    // Messages arrive newest-first; an admin reply on top settles the thread
    // even though the shop wrote below it.
    expect(
      isAwaitingAdminResponse(
        conversation({
          admin_read_at: null,
          messages: [
            { created_at: AUG_3, author_role: "admin" },
            { created_at: AUG_1, author_role: "user" },
          ],
        })
      )
    ).toBe(false);
  });
});

describe("shopIdsAwaitingAdminResponse", () => {
  it("names a shop once when two of its conversations are awaiting", () => {
    const ids = shopIdsAwaitingAdminResponse([
      conversation({ shop_id: "s1" }),
      conversation({ shop_id: "s1" }),
    ]);
    expect(ids.size).toBe(1);
    expect(ids.has("s1")).toBe(true);
  });

  it("omits shops whose conversations are all answered or closed", () => {
    const ids = shopIdsAwaitingAdminResponse([
      conversation({ shop_id: "s1" }),
      conversation({ shop_id: "s2", admin_read_at: AUG_3 }),
      conversation({ shop_id: "s3", status: "closed" }),
    ]);
    expect([...ids]).toEqual(["s1"]);
  });

  it("is empty with no conversations", () => {
    expect(shopIdsAwaitingAdminResponse([]).size).toBe(0);
  });

  it("agrees with the per-conversation count on the same data", () => {
    // The sidebar badge counts conversations; the attention list counts shops.
    // Two awaiting threads on one shop is a count of 2 across 1 shop.
    const rows = [
      conversation({ shop_id: "s1" }),
      conversation({ shop_id: "s1" }),
      conversation({ shop_id: "s2", admin_read_at: AUG_3 }),
    ];
    expect(rows.filter(isAwaitingAdminResponse).length).toBe(2);
    expect(shopIdsAwaitingAdminResponse(rows).size).toBe(1);
  });
});

describe("awaitingAdminResponseQuery", () => {
  it("selects every field the predicate reads, newest message first", () => {
    expect(awaitingAdminResponseQuery.select.shop_id).toBe(true);
    expect(awaitingAdminResponseQuery.select.status).toBe(true);
    expect(awaitingAdminResponseQuery.select.admin_read_at).toBe(true);
    expect(awaitingAdminResponseQuery.select.messages.take).toBe(1);
    expect(awaitingAdminResponseQuery.select.messages.orderBy).toEqual({
      created_at: "desc",
    });
    expect(awaitingAdminResponseQuery.select.messages.select).toEqual({
      created_at: true,
      author_role: true,
    });
  });
});
