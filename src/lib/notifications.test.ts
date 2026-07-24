import { describe, it, expect } from "vitest";
import { SHOP_APPROVED_NOTIFICATION } from "./notifications";

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
