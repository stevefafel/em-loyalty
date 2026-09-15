import { describe, expect, it } from "vitest";
import { isValidInvoiceFilePath } from "./invoice-file-path";

/**
 * KTD10: the helper accepts only the exact shape the upload route generates
 * (`src/app/api/storage/upload-url/route.ts`): `<shopId>/` followed by
 * exactly one segment built from the sanitizer's character set, not "." or
 * "..", ending in an allowed extension.
 */
describe("isValidInvoiceFilePath", () => {
  it("accepts the upload route's own shape", () => {
    expect(
      isValidInvoiceFilePath("s1", "s1/1726400000000_invoice (1).pdf")
    ).toBe(true);
  });

  it("rejects a path filed under another shop's folder", () => {
    expect(isValidInvoiceFilePath("s1", "s2/invoice.pdf")).toBe(false);
  });

  it("rejects a literal .. segment reaching into another shop's folder", () => {
    expect(isValidInvoiceFilePath("s1", "s1/../s2/invoice.pdf")).toBe(false);
  });

  it("rejects a %2e%2e encoded traversal segment", () => {
    expect(isValidInvoiceFilePath("s1", "s1/%2e%2e/s2/invoice.pdf")).toBe(
      false
    );
  });

  it("rejects a backslash traversal form", () => {
    expect(isValidInvoiceFilePath("s1", "s1/..\\s2/invoice.pdf")).toBe(false);
  });

  it("rejects a path with a second segment", () => {
    expect(isValidInvoiceFilePath("s1", "s1/2026/invoice.pdf")).toBe(false);
  });

  it("rejects a disallowed extension (.html)", () => {
    expect(isValidInvoiceFilePath("s1", "s1/invoice.html")).toBe(false);
  });

  it("rejects a disallowed extension (.svg)", () => {
    expect(isValidInvoiceFilePath("s1", "s1/invoice.svg")).toBe(false);
  });

  it("accepts an uppercase extension", () => {
    expect(isValidInvoiceFilePath("s1", "s1/Invoice.JPG")).toBe(true);
  });

  it("rejects a shop folder with no file segment", () => {
    expect(isValidInvoiceFilePath("s1", "s1/")).toBe(false);
  });

  it("rejects a shop folder with just a .. segment", () => {
    expect(isValidInvoiceFilePath("s1", "s1/..")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidInvoiceFilePath("s1", "")).toBe(false);
  });

  it("rejects a segment that is exactly '.'", () => {
    expect(isValidInvoiceFilePath("s1", "s1/.")).toBe(false);
  });

  it("rejects an empty segment (double slash)", () => {
    expect(isValidInvoiceFilePath("s1", "s1//invoice.pdf")).toBe(false);
  });

  it("rejects a percent character in the file segment", () => {
    expect(isValidInvoiceFilePath("s1", "s1/inv%20oice.pdf")).toBe(false);
  });

  it("rejects leading/trailing whitespace tricks around the shop id", () => {
    expect(isValidInvoiceFilePath("s1", " s1/invoice.pdf")).toBe(false);
    expect(isValidInvoiceFilePath("s1", "s1 /invoice.pdf")).toBe(false);
  });
});
