import { describe, it, expect } from "vitest";
import {
  SHOP_APPROVED_NOTIFICATION,
  supportReplyNotification,
} from "./notifications";

describe("SHOP_APPROVED_NOTIFICATION", () => {
  it("congratulates and mentions the welcome packet with swag + 500 stickers", () => {
    const { type, title, body } = SHOP_APPROVED_NOTIFICATION;
    expect(type).toBe("shop_approved");
    expect(title.toLowerCase()).toContain("premium growth portal");
    expect(body.toLowerCase()).toContain("congratulations");
    expect(body.toLowerCase()).toContain("welcome packet");
    expect(body.toLowerCase()).toContain("swag");
    expect(body).toContain("500");
  });
});

describe("supportReplyNotification", () => {
  it("names the thread it refers to and keeps a stable type", () => {
    const { type, title, body } = supportReplyNotification("Points missing");
    expect(type).toBe("support_reply");
    expect(title.toLowerCase()).toContain("reply");
    expect(body).toContain("Points missing");
  });
});
