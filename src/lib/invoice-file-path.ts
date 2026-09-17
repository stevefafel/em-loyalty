/**
 * KTD10: one strict shared rule for an invoice's storage object path.
 *
 * Accepts only the exact shape the upload route generates
 * (`src/app/api/storage/upload-url/route.ts`):
 *   `<shopId>/` followed by exactly one segment, built only from the
 *   sanitizer's character set (letters, digits, `_`, `.`, `-`, space,
 *   parentheses), that isn't `.` or `..`, and ends in `.pdf`, `.png`,
 *   `.jpg` or `.jpeg` (case-insensitive).
 *
 * This rejects `%`-encoded and backslash traversal forms outright: `%` and
 * `\` are not in the sanitizer's character set, so a segment containing
 * either never matches. It also rejects a second path segment, so
 * `<shopId>/../<otherShopId>/x.pdf` fails on segment count alone, in
 * addition to the `..` check on the first segment.
 *
 * Runs at `POST /api/invoices` and again before the extract route downloads
 * the file (KTD10). The file's bytes are still checked against a PDF, PNG
 * or JPEG signature elsewhere (KTD7) — this only governs the path shape.
 */

const SEGMENT_CHARS = /^[\w.\- ()]+$/;
const ALLOWED_EXTENSION = /\.(pdf|png|jpe?g)$/i;

export function isValidInvoiceFilePath(
  shopId: string,
  filePath: string
): boolean {
  if (!shopId || !filePath) return false;

  const parts = filePath.split("/");
  if (parts.length !== 2) return false;

  const [pathShopId, segment] = parts;
  if (pathShopId !== shopId) return false;
  if (!segment) return false;
  if (segment === "." || segment === "..") return false;
  if (!SEGMENT_CHARS.test(segment)) return false;
  if (!ALLOWED_EXTENSION.test(segment)) return false;

  return true;
}
