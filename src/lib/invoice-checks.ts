// Independent checks on an invoice extraction (KTD3, KTD4, KTD11).
//
// Pure functions only: this module never imports `openai`, Prisma or anything
// that creates a client at import time, so routes and tests can load it freely.
//
// An extraction run produces a list of stored warnings ("review flags"). Every
// flag either comes from a check that does not depend on the model (the PDF
// scan, arithmetic, the typed amount) or from the model's own report of
// instructions it saw. The model's report can add a warning but never remove
// one. The approval gate reads the flags stored on the row it locked; it never
// recomputes them.
//
// Money is compared in integer cents with a ±2¢ tolerance per comparison.

import { formatCurrency } from "./utils";

/** Bump when the checks change, so older runs count as "unchecked". */
export const CHECKS_VERSION = 1;

export const REVIEW_FLAG_CODES = [
  "text_instruction",
  "hidden_text",
  "not_scanned",
  "model_reported_instructions",
  "line_items_missing",
  "line_items_mismatch",
  "subtotal_tax_total_mismatch",
  "total_missing",
  "total_not_in_text",
  "labelled_totals_conflict",
  "amount_mismatch",
] as const;

export type ReviewFlagCode = (typeof REVIEW_FLAG_CODES)[number];

/**
 * One stored warning. `detail` is always server-generated text (for
 * `not_scanned` it is the reason code). `excerpt`, when present, is quoted
 * document content: untrusted, capped, and never used as a label (KTD11).
 */
export interface ReviewFlag {
  code: ReviewFlagCode;
  detail: string;
  excerpt?: string;
}

/** Plain labels for the admin UI, generated from the code, never from the document. */
export const REVIEW_FLAG_LABELS: Record<ReviewFlagCode, string> = {
  text_instruction: "Document contains instruction-like text",
  hidden_text: "Document contains hidden or disguised text",
  not_scanned: "Document could not be fully scanned",
  model_reported_instructions: "AI reported text addressed to automated systems",
  line_items_missing: "No line items were extracted, so they could not be checked",
  line_items_mismatch: "Line items do not add up to the subtotal",
  subtotal_tax_total_mismatch: "Subtotal plus tax does not equal the total",
  total_missing: "AI did not find an invoice total",
  total_not_in_text: "AI total does not match a labelled total in the document",
  labelled_totals_conflict: "Document prints totals that disagree",
  amount_mismatch: "Typed amount differs from the AI total",
};

/** Why a document could not be fully scanned (stored as a `not_scanned` flag's detail). */
export type NotScannedReason =
  | "image"
  | "encrypted"
  | "parse_error"
  | "empty"
  | "near_empty_page"
  | "forms_or_scripts"
  | "too_large"
  | "too_many_pages"
  | "timeout"
  | "unsupported_type"
  | "not_run";

/** Result of scanning a PDF's content (produced by `scanPdf` in invoice-text-scan). */
export type PdfScanResult =
  | {
      status: "scanned";
      hits: ReviewFlag[];
      /** Whole amounts, in integer cents, printed right after a total-type label. */
      labelledTotalsCents: number[];
    }
  | {
      status: "not_scanned";
      reason: NotScannedReason | (string & {});
      /** Hits found before the scan gave up (e.g. a form field's value). */
      hits?: ReviewFlag[];
    };

export type InvoiceFileType = "pdf" | "png" | "jpeg";

// ---------------------------------------------------------------------------
// File type
// ---------------------------------------------------------------------------

const startsWith = (bytes: Uint8Array, sig: readonly number[]) =>
  bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);

const PDF_SIG = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIG = [0xff, 0xd8, 0xff];

/** Identifies a file by its leading signature bytes, never by name or extension. */
export function detectFileType(bytes: Uint8Array): InvoiceFileType | null {
  if (startsWith(bytes, PDF_SIG)) return "pdf";
  if (startsWith(bytes, PNG_SIG)) return "png";
  if (startsWith(bytes, JPEG_SIG)) return "jpeg";
  return null;
}

// ---------------------------------------------------------------------------
// Untrusted text caps (KTD11)
// ---------------------------------------------------------------------------

export const MAX_EXCERPT_CHARS = 200;
/** At most this many flags (and so excerpts) are stored per flag code. */
export const MAX_FLAGS_PER_CODE = 5;

/**
 * Caps a document-derived excerpt for storage: at most `max` code points,
 * lone surrogates replaced, C0 controls turned into visible Control Pictures
 * (NUL cannot be stored in jsonb). Zero-width and bidi characters are kept so
 * the UI can show them as markers.
 */
export function capExcerpt(text: string, max: number = MAX_EXCERPT_CHARS): string {
  const safe = text
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "�")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, (c) =>
      c === "\u007F" ? "␡" : String.fromCharCode(0x2400 + c.charCodeAt(0))
    )
    .trim();
  const chars = [...safe];
  if (chars.length <= max) return safe;
  return `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

/** Caps a list of excerpts: drops blanks, keeps at most `maxCount`, caps each. */
export function capExcerpts(excerpts: readonly string[], maxCount: number = MAX_FLAGS_PER_CODE): string[] {
  return excerpts
    .filter((e) => typeof e === "string" && e.trim() !== "")
    .slice(0, maxCount)
    .map((e) => capExcerpt(e));
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export const MONEY_TOLERANCE_CENTS = 2;

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

const centsOrNull = (n: number | null | undefined): number | null =>
  typeof n === "number" && Number.isFinite(n) ? toCents(n) : null;

const withinTolerance = (a: number, b: number) => Math.abs(a - b) <= MONEY_TOLERANCE_CENTS;

const formatCents = (cents: number) => formatCurrency(cents / 100);

// ---------------------------------------------------------------------------
// Value checks (arithmetic, missing total, typed amount)
// ---------------------------------------------------------------------------

export const VALUE_FLAG_CODES = [
  "line_items_missing",
  "line_items_mismatch",
  "subtotal_tax_total_mismatch",
  "total_missing",
  "amount_mismatch",
] as const satisfies readonly ReviewFlagCode[];

const VALUE_FLAG_SET: ReadonlySet<ReviewFlagCode> = new Set(VALUE_FLAG_CODES);

/** Values an admin can edit; everything the value checks need. Amounts in dollars. */
export interface ValueCheckInput {
  aiTotal: number | null;
  aiSubtotal: number | null;
  aiTax: number | null;
  lineItemAmounts: ReadonlyArray<number | null>;
  /** The amount the shop typed when uploading. */
  typedAmount: number | null;
}

/** Arithmetic and amount-mismatch flags from the extracted and typed values. */
export function computeValueFlags(input: ValueCheckInput): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const total = centsOrNull(input.aiTotal);
  const subtotal = centsOrNull(input.aiSubtotal);
  const tax = centsOrNull(input.aiTax) ?? 0; // a null tax counts as zero
  const items = input.lineItemAmounts.map(centsOrNull);
  const known = items.filter((c): c is number => c !== null);

  // Line items against the subtotal (or, without a subtotal, total minus tax).
  // Items that add up to the total also pass: many invoices list tax and fees
  // as line items (tuned on the stored invoices, 2026-09-15).
  if (known.length === 0) {
    flags.push({
      code: "line_items_missing",
      detail: "No line item amounts were extracted, so the sum of line items could not be checked",
    });
  } else if (known.length < items.length) {
    flags.push({
      code: "line_items_mismatch",
      detail: `${items.length - known.length} of ${items.length} line items have no amount, so their sum could not be checked`,
    });
  } else {
    const sum = known.reduce((a, b) => a + b, 0);
    const target = subtotal ?? (total !== null ? total - tax : null);
    const matchesTotal = total !== null && withinTolerance(sum, total);
    if (target !== null && !withinTolerance(sum, target) && !matchesTotal) {
      flags.push({
        code: "line_items_mismatch",
        detail:
          subtotal !== null
            ? `Line items add up to ${formatCents(sum)} but the subtotal is ${formatCents(subtotal)}`
            : `Line items add up to ${formatCents(sum)} but the total less tax is ${formatCents(target)}`,
      });
    }
  }

  // Subtotal plus tax against the total. A null subtotal skips this check.
  if (subtotal !== null && total !== null && !withinTolerance(subtotal + tax, total)) {
    flags.push({
      code: "subtotal_tax_total_mismatch",
      detail: `Subtotal ${formatCents(subtotal)} plus tax ${formatCents(tax)} is ${formatCents(subtotal + tax)}, but the total is ${formatCents(total)}`,
    });
  }

  if (total === null) {
    flags.push({ code: "total_missing", detail: "The AI did not return an invoice total" });
  } else {
    const typed = centsOrNull(input.typedAmount);
    if (typed !== null && !withinTolerance(typed, total)) {
      flags.push({
        code: "amount_mismatch",
        detail: `Typed amount ${formatCents(typed)} differs from the AI total ${formatCents(total)}`,
      });
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Full warning aggregation for an extraction run
// ---------------------------------------------------------------------------

export interface ModelInstructionReport {
  found: boolean;
  excerpts: string[];
}

export interface ReviewFlagInput extends ValueCheckInput {
  fileType: InvoiceFileType | null;
  /** The PDF scan result, or null when no scan ran (images, unknown types). */
  scan: PdfScanResult | null;
  /** The model's report of text addressed to automated systems, if any. */
  modelReport: ModelInstructionReport | null;
}

function notScannedFlag(reason: string): ReviewFlag {
  return { code: "not_scanned", detail: reason };
}

/** Labelled-total checks: only for a PDF whose text layer was fully scanned. */
function labelledTotalFlags(totalCents: number | null, labelled: readonly number[]): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  if (totalCents !== null && !labelled.some((c) => withinTolerance(c, totalCents))) {
    flags.push({
      code: "total_not_in_text",
      detail:
        labelled.length === 0
          ? `No labelled total (Total, Amount Due, Balance Due) was found in the PDF text to confirm the AI total ${formatCents(totalCents)}`
          : `The AI total ${formatCents(totalCents)} does not match any labelled total printed in the PDF`,
    });
  }
  // Distinct non-zero labelled totals (beyond tolerance) mean the document
  // prints totals that disagree. A zero "Balance Due" on a paid invoice is not
  // a competing total.
  const distinct: number[] = [];
  for (const c of labelled) {
    if (c === 0) continue;
    if (!distinct.some((d) => withinTolerance(d, c))) distinct.push(c);
  }
  if (distinct.length > 1) {
    flags.push({
      code: "labelled_totals_conflict",
      detail: `The PDF prints labelled totals that disagree: ${distinct.map(formatCents).join(", ")}`,
    });
  }
  return flags;
}

/** Dedupes by code + detail + excerpt, caps excerpts, keeps at most MAX_FLAGS_PER_CODE per code. */
function finalizeFlags(flags: readonly ReviewFlag[]): ReviewFlag[] {
  const seen = new Set<string>();
  const perCode = new Map<ReviewFlagCode, number>();
  const out: ReviewFlag[] = [];
  for (const f of flags) {
    const flag: ReviewFlag =
      f.excerpt === undefined
        ? { code: f.code, detail: f.detail }
        : { code: f.code, detail: f.detail, excerpt: capExcerpt(f.excerpt) };
    const key = `${flag.code}\u0000${flag.detail}\u0000${flag.excerpt ?? ""}`;
    if (seen.has(key)) continue;
    const n = perCode.get(flag.code) ?? 0;
    if (n >= MAX_FLAGS_PER_CODE) continue;
    seen.add(key);
    perCode.set(flag.code, n + 1);
    out.push(flag);
  }
  return out;
}

/**
 * Every warning for one extraction run: not-scanned, scan hits, the model's
 * report, arithmetic, missing total, typed-amount mismatch, and the
 * labelled-total checks. Flags are only ever added; nothing here clears one.
 */
export function computeReviewFlags(input: ReviewFlagInput): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const { scan } = input;

  if (scan === null) {
    const reason =
      input.fileType === "png" || input.fileType === "jpeg"
        ? "image"
        : input.fileType === null
          ? "unsupported_type"
          : "not_run";
    flags.push(notScannedFlag(reason));
  } else if (scan.status === "not_scanned") {
    flags.push(notScannedFlag(scan.reason));
    flags.push(...(scan.hits ?? []));
  } else {
    flags.push(...scan.hits);
  }

  const report = input.modelReport;
  if (report) {
    const excerpts = capExcerpts(report.excerpts ?? []);
    const detail = "The AI reported text in the document addressed to automated systems";
    if (excerpts.length > 0) {
      for (const excerpt of excerpts) flags.push({ code: "model_reported_instructions", detail, excerpt });
    } else if (report.found) {
      flags.push({ code: "model_reported_instructions", detail });
    }
  }

  flags.push(...computeValueFlags(input));

  if (scan?.status === "scanned") {
    flags.push(...labelledTotalFlags(centsOrNull(input.aiTotal), scan.labelledTotalsCents));
  }

  return finalizeFlags(flags);
}

/**
 * For an admin edit (KTD9): replace only the value flags using the edited
 * values; keep every other stored flag (scan, model, labelled-total) as is.
 */
export function recomputeValueFlags(
  existingFlags: readonly ReviewFlag[],
  input: ValueCheckInput
): ReviewFlag[] {
  const kept = existingFlags.filter((f) => !VALUE_FLAG_SET.has(f.code));
  return finalizeFlags([...kept, ...computeValueFlags(input)]);
}

// ---------------------------------------------------------------------------
// Approval decision (KTD4, KTD6)
// ---------------------------------------------------------------------------

/** Approval reasons that describe the run's state rather than a stored flag. */
export const APPROVAL_STATE_REASONS = ["no_extraction", "processing", "failed", "unchecked"] as const;
export type ApprovalStateReason = (typeof APPROVAL_STATE_REASONS)[number];

/** The stored row as read from the database; `review_flags` is untrusted JSON. */
export interface ExtractionForApproval {
  status: "processing" | "completed" | "failed";
  checks_version: number | null;
  review_flags: unknown;
}

export interface ApprovalDecision {
  /** False when the invoice cannot be approved at all yet. */
  approvable: boolean;
  /** True when approval needs the admin's confirmation that they checked the original. */
  confirmationRequired: boolean;
  /** Why: an `ApprovalStateReason`, or the distinct stored flag codes. Empty when clean. */
  reasons: string[];
}

export function approvalDecision(extraction: ExtractionForApproval | null): ApprovalDecision {
  if (!extraction) return { approvable: false, confirmationRequired: false, reasons: ["no_extraction"] };
  if (extraction.status === "processing") {
    return { approvable: false, confirmationRequired: false, reasons: ["processing"] };
  }
  if (extraction.status !== "completed") {
    return { approvable: true, confirmationRequired: true, reasons: ["failed"] };
  }
  // Older checks, or flags that can't be read, are "unchecked" — never clean.
  if (extraction.checks_version !== CHECKS_VERSION || !Array.isArray(extraction.review_flags)) {
    return { approvable: true, confirmationRequired: true, reasons: ["unchecked"] };
  }
  const reasons = [
    ...new Set((extraction.review_flags as Array<{ code?: unknown } | null>).map((f) => String(f?.code))),
  ];
  return { approvable: true, confirmationRequired: reasons.length > 0, reasons };
}
