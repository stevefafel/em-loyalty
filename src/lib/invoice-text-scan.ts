// Server-side scan of an invoice PDF's content (KTD3, KTD4, KTD11).
//
// Two layers:
//   1. Pure detectors over plain text items (`detectInstructions`,
//      `findLabelledTotalsCents`, `classifyScan`), tested without pdf.js.
//   2. A thin `unpdf` wrapper (`scanPdf`) that reads each page's text items,
//      annotation text, form field values and the document's structural facts,
//      with a size cap, a page cap and a time budget.
//
// Nothing here imports `openai` or Prisma. Document text never reaches logs:
// pdf.js runs at error-only verbosity and errors are mapped to reason codes.

import { getResolvedPDFJS } from "unpdf";
import {
  MAX_FLAGS_PER_CODE,
  capExcerpt,
  detectFileType,
  type NotScannedReason,
  type PdfScanResult,
  type ReviewFlag,
} from "./invoice-checks";

export type { PdfScanResult } from "./invoice-checks";

/** Files larger than this are not parsed at all. */
export const MAX_SCAN_BYTES = 10 * 1024 * 1024;
/** PDFs with more pages than this are not scanned. */
export const MAX_SCAN_PAGES = 20;
/** Time budget for one scan. A synchronous CPU burn can overrun it (KTD3 known gap). */
export const SCAN_TIMEOUT_MS = 8000;
/** Text smaller than this (in points) counts as hidden. */
export const MIN_VISIBLE_FONT_PT = 2;
/** A page with fewer visible characters than this is "near empty" (likely an image). */
export const NEAR_EMPTY_PAGE_CHARS = 20;
/** How many text items after a total label may hold its amount. */
export const LABEL_LOOKAHEAD_ITEMS = 4;

const OFF_PAGE_TOLERANCE_PT = 1;
const EXCERPT_CONTEXT_CHARS = 40;
const MAX_HIDDEN_RUNS_PER_PAGE = 20;

// ---------------------------------------------------------------------------
// Types for the pure layer
// ---------------------------------------------------------------------------

/** One positioned text item, in PDF user-space units (origin bottom-left). */
export interface ScanTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  /** Rendered size in points (the smaller of the horizontal and vertical scale). */
  fontSize: number;
  /** True when a line break follows this item. */
  hasEOL?: boolean;
}

export interface ScanPage {
  /** Visible area [x1, y1, x2, y2] in user space, or null when unknown. */
  view: readonly [number, number, number, number] | null;
  /** The page's visible text layer, in content order. */
  items: ScanTextItem[];
  /** Annotation contents, alt text and appearance text on this page. */
  annotationTexts?: string[];
  /** Text the page draws that is missing from its visible text layer (e.g. off-page). */
  hiddenTexts?: string[];
}

export interface PdfDocumentFacts {
  pageCount: number;
  /** AcroForm fields or XFA. */
  hasForms: boolean;
  hasJavaScript: boolean;
  hasEmbeddedFiles: boolean;
}

// ---------------------------------------------------------------------------
// Normalization (KTD3)
// ---------------------------------------------------------------------------

/** Zero-width, soft-hyphen, bidi-control and other invisible format characters. */
const INVISIBLE_RE =
  /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/g;

/** Hidden format characters that flag on their own (soft hyphens are only stripped). */
const HIDDEN_FORMAT_RE = /[؜᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/;

/** Common look-alike letters folded to Latin (lower case; input is lower-cased first). */
const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  а: "a", в: "b", г: "r", е: "e", ё: "e", һ: "h", і: "i", ї: "i", ј: "j", к: "k", м: "m",
  н: "h", о: "o", п: "n", р: "p", с: "c", ѕ: "s", т: "t", у: "y", х: "x", ү: "y", ԁ: "d",
  ԛ: "q", ԝ: "w", ӏ: "l", ɡ: "g",
  // Greek
  α: "a", β: "b", γ: "y", ε: "e", ζ: "z", η: "n", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p",
  τ: "t", υ: "u", χ: "x", ω: "w",
  // Latin variants and small capitals
  ı: "i", ȷ: "j", ɑ: "a", ɩ: "i", ᴀ: "a", ʙ: "b", ᴄ: "c", ᴅ: "d", ᴇ: "e", ɢ: "g", ʜ: "h",
  ɪ: "i", ᴊ: "j", ᴋ: "k", ʟ: "l", ᴍ: "m", ɴ: "n", ᴏ: "o", ᴘ: "p", ʀ: "r", ꜱ: "s", ᴛ: "t",
  ᴜ: "u", ᴠ: "v", ᴡ: "w", ʏ: "y", ᴢ: "z",
};
const CONFUSABLE_RE = new RegExp(`[${Object.keys(CONFUSABLES).join("")}]`, "g");

/**
 * Normalizes text for matching: NFKC, strip invisible format characters,
 * lower-case, strip combining marks, fold look-alike letters to Latin, and
 * collapse runs of spaces (line breaks are kept).
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(INVISIBLE_RE, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(CONFUSABLE_RE, (c) => CONFUSABLES[c] ?? c)
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function hasMixedScriptWord(raw: string): boolean {
  const words = raw.normalize("NFKC").replace(INVISIBLE_RE, "").match(/\p{L}+/gu) ?? [];
  return words.some(
    (w) =>
      /\p{Script=Latin}/u.test(w) &&
      // µ/μ in units like "25µm" is not a disguise.
      /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(w.replace(/μ/g, ""))
  );
}

// ---------------------------------------------------------------------------
// Text assembly
// ---------------------------------------------------------------------------

interface Segment {
  raw: string;
  norm: string;
  lineBreakBefore: boolean;
}

interface AssembledText {
  segments: Segment[];
  /** Normalized text: segments joined by " " on a line and "\n" between lines. */
  spaced: string;
  starts: number[];
  ends: number[];
  /** `spaced` with all whitespace removed, so split or letter-spaced text still matches. */
  compact: string;
  /** Index into `spaced` for each character of `compact`. */
  compactToSpaced: number[];
}

function segmentsFromItems(items: readonly ScanTextItem[]): Segment[] {
  const segments: Segment[] = [];
  let prev: ScanTextItem | null = null;
  let pendingBreak = false;
  for (const item of items) {
    if (
      prev &&
      (prev.hasEOL || Math.abs(item.y - prev.y) > 0.5 * Math.max(item.fontSize, prev.fontSize, 1))
    ) {
      pendingBreak = true;
    }
    prev = item;
    const norm = normalizeForMatch(item.str);
    if (!norm) continue;
    segments.push({ raw: item.str, norm, lineBreakBefore: segments.length > 0 && pendingBreak });
    pendingBreak = false;
  }
  return segments;
}

const segmentsFromText = (raw: string): Segment[] => {
  const norm = normalizeForMatch(raw);
  return norm ? [{ raw, norm, lineBreakBefore: false }] : [];
};

function assemble(segments: Segment[]): AssembledText {
  let spaced = "";
  const starts: number[] = [];
  const ends: number[] = [];
  segments.forEach((seg, i) => {
    if (i > 0) spaced += seg.lineBreakBefore ? "\n" : " ";
    starts.push(spaced.length);
    spaced += seg.norm;
    ends.push(spaced.length);
  });
  let compact = "";
  const compactToSpaced: number[] = [];
  for (let i = 0; i < spaced.length; i++) {
    if (/\s/.test(spaced[i])) continue;
    compact += spaced[i];
    compactToSpaced.push(i);
  }
  return { segments, spaced, starts, ends, compact, compactToSpaced };
}

/** Quotes the raw text behind a match in `spaced`, with a little context. */
function excerptFor(text: AssembledText, start: number, end: number): string {
  const { segments, starts, ends } = text;
  let first = segments.findIndex((_, i) => ends[i] > start);
  if (first === -1) first = segments.length - 1;
  let last = first;
  while (last + 1 < segments.length && starts[last + 1] < end) last++;
  const pieces: string[] = [];
  for (let i = first; i <= last; i++) {
    const { raw, norm } = segments[i];
    const scale = raw.length / Math.max(1, norm.length);
    const from =
      i === first ? Math.max(0, Math.floor((start - starts[i]) * scale) - EXCERPT_CONTEXT_CHARS) : 0;
    const to =
      i === last
        ? Math.min(raw.length, Math.ceil((end - starts[i]) * scale) + EXCERPT_CONTEXT_CHARS)
        : raw.length;
    pieces.push(`${from > 0 ? "…" : ""}${raw.slice(from, to)}${to < raw.length ? "…" : ""}`);
  }
  return capExcerpt(pieces.join(" "));
}

// ---------------------------------------------------------------------------
// Instruction patterns (KTD3)
// ---------------------------------------------------------------------------

/** Phrases aimed at automated readers: each flags on its own. Run on `spaced`. */
const SPACED_PATTERNS: readonly RegExp[] = [
  /\bautomated\s+(?:extraction|extractors?|processing|systems?|readers?|parsers?|parsing|tools?|agents?)\b/g,
  /\bextraction\s+(?:notes?|instructions?|directives?|override)\b/g,
  /\b(?:note|message|instructions?|directions?)\s+(?:to|for)\s+(?:the\s+|any\s+)?(?:ai|llm|gpt|chatgpt|language\s+models?|extractors?|parsers?|bots?)\b/g,
  /\b(?:attention|dear)\s*[:,]?\s*(?:ai|llm|gpt|chatgpt|language\s+model)\b/g,
  /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+)?(?:the\s+|your\s+)?(?:previous|prior|above|earlier|preceding|former|other|system)\s+(?:instructions?|prompts?|directions?|rules?|guidelines?)\b/g,
  /\breturn\s+[^\n]{0,60}?\s+as\s+the\s+(?:invoice\s+)?(?:total|subtotal|tax|amount|number|date|vendor|grand\s+total)\b/g,
  /\breturn\s+(?:the\s+)?(?:invoice\s+)?(?:total|subtotal|tax|amount|number|date|vendor(?:\s+name)?)\s+as\b/g,
  /\b(?:set|report|output|extract|record)\s+(?:the\s+)?(?:invoice\s+)?(?:total|subtotal|amount|invoice\s+number)\s+(?:as|=)\s/g,
  /\bthe\s+(?:correct|real|actual|true)\s+(?:invoice\s+)?(?:total|amount)\s+(?:is|should\s+be)\b/g,
  /\byou\s+are\s+(?:an?\s+)?(?:ai|llm|language\s+model|assistant|extraction\s+(?:model|system|tool))\b/g,
  /\bas\s+an\s+ai\b/g,
  // Role or format spoofing.
  /(?:^|\n|[[<{(|>])\s*(?:system|assistant|developer)\s*:/g,
  /<\|?\s*\/?\s*(?:im_start|im_end|system|endoftext|assistant)\s*\|?>/g,
  /\[\/?\s*inst\s*\]/g,
  /\b(?:respond|reply|answer)\s+(?:only\s+)?(?:with|in)\s+(?:json|the\s+following)\b/g,
  /\bdo\s+not\s+(?:flag|mention|report|reveal)\s+(?:this|these|the)\s+(?:instructions?|notes?|text|message)\b/g,
  // Generic override words flag only right before a total word or an amount,
  // within the same sentence and line, so late-payment boilerplate
  // ("disregard this notice if payment has been sent") doesn't fire.
  /\b(?:ignore|ignoring|disregard|disregarding|override|overwrite|supersedes?)\b(?:[ \t]+[^\s.!?]+){0,3}?[ \t]+(?:total|subtotal|amount|sum|grand[ \t]+total|invoice[ \t]+(?:number|total|amount)|\$[ \t]?\d|\d{1,3}(?:,\d{3})+|\d+\.\d{2}\b)/g,
];

/** Space-free forms of the most specific phrases, run on `compact`. */
const COMPACT_PATTERNS: readonly RegExp[] = [
  /automatedextraction/g,
  /extraction(?:note|instruction)/g,
  /(?:ignore|disregard|forget|override)(?:all|any)?(?:the|your)?(?:previous|prior|above|earlier)instructions?/g,
  /(?:ignore|disregard|override)(?:the|this|any)?(?:total|subtotal|amount|invoicenumber|grandtotal)/g,
  /return.{0,60}?asthe(?:invoice)?(?:total|subtotal|amount|number|vendor)/g,
  /thecorrect(?:invoice)?(?:total|amount)is/g,
];

/**
 * One excerpt per instruction-like passage in the assembled text. Matches
 * close to each other (e.g. several phrases of one injected note) are merged
 * into a single quoted passage.
 */
function findInstructionExcerpts(text: AssembledText): string[] {
  const ranges: Array<[number, number]> = [];
  for (const re of SPACED_PATTERNS) {
    for (const m of text.spaced.matchAll(re)) {
      ranges.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
    }
  }
  for (const re of COMPACT_PATTERNS) {
    for (const m of text.compact.matchAll(re)) {
      const s = text.compactToSpaced[m.index ?? 0];
      const e = text.compactToSpaced[(m.index ?? 0) + m[0].length - 1] + 1;
      ranges.push([s, e]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1] + EXCERPT_CONTEXT_CHARS) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged.map(([s, e]) => excerptFor(text, s, e));
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

function isOutsideView(item: ScanTextItem, view: ScanPage["view"]): boolean {
  if (!view) return false;
  const [x1, y1, x2, y2] = view;
  const t = OFF_PAGE_TOLERANCE_PT;
  return (
    item.x > x2 + t ||
    item.x + Math.max(0, item.width) < x1 - t ||
    item.y > y2 + t ||
    item.y + Math.max(0, item.fontSize) < y1 - t
  );
}

/** Dedupes by code + excerpt and keeps at most MAX_FLAGS_PER_CODE per code. */
function capHits(flags: readonly ReviewFlag[]): ReviewFlag[] {
  const seen = new Set<string>();
  const perCode = new Map<string, number>();
  const out: ReviewFlag[] = [];
  for (const f of flags) {
    const key = `${f.code}\u0000${f.excerpt ?? f.detail}`;
    const n = perCode.get(f.code) ?? 0;
    if (seen.has(key) || n >= MAX_FLAGS_PER_CODE) continue;
    seen.add(key);
    perCode.set(f.code, n + 1);
    out.push(f);
  }
  return out;
}

/** Instruction and hidden-character checks for one standalone string. */
function checkStandaloneText(raw: string, where: string, flags: ReviewFlag[]): void {
  for (const excerpt of findInstructionExcerpts(assemble(segmentsFromText(raw)))) {
    flags.push({ code: "text_instruction", detail: `Instruction-like text ${where}`, excerpt });
  }
  if (HIDDEN_FORMAT_RE.test(raw)) {
    flags.push({
      code: "hidden_text",
      detail: `Hidden format characters (zero-width or bidi control) ${where}`,
      excerpt: capExcerpt(raw),
    });
  }
  if (hasMixedScriptWord(raw)) {
    flags.push({
      code: "hidden_text",
      detail: `Mixed-script word (look-alike letters) ${where}`,
      excerpt: capExcerpt(raw),
    });
  }
}

/**
 * The pure pattern detector. Flags instruction-like text in each page's text
 * layer, annotations, hidden text and form field values, plus tiny text, text
 * outside the visible page area, hidden format characters and mixed-script
 * words. Normalization runs before matching; excerpts are capped (KTD11).
 */
export function detectInstructions(
  pages: readonly ScanPage[],
  fieldValues: readonly string[] = []
): ReviewFlag[] {
  const flags: ReviewFlag[] = [];

  pages.forEach((page, index) => {
    const where = `on page ${index + 1}`;

    const text = assemble(segmentsFromItems(page.items));
    for (const excerpt of findInstructionExcerpts(text)) {
      flags.push({ code: "text_instruction", detail: `Instruction-like text ${where}`, excerpt });
    }

    for (const item of page.items) {
      if (item.str.trim() === "") continue;
      if (item.fontSize < MIN_VISIBLE_FONT_PT) {
        flags.push({
          code: "hidden_text",
          detail: `Tiny text (under ${MIN_VISIBLE_FONT_PT} pt) ${where}`,
          excerpt: capExcerpt(item.str),
        });
      }
      if (isOutsideView(item, page.view)) {
        flags.push({
          code: "hidden_text",
          detail: `Text outside the visible page area ${where}`,
          excerpt: capExcerpt(item.str),
        });
      }
      if (HIDDEN_FORMAT_RE.test(item.str)) {
        flags.push({
          code: "hidden_text",
          detail: `Hidden format characters (zero-width or bidi control) ${where}`,
          excerpt: capExcerpt(item.str),
        });
      }
      if (hasMixedScriptWord(item.str)) {
        flags.push({
          code: "hidden_text",
          detail: `Mixed-script word (look-alike letters) ${where}`,
          excerpt: capExcerpt(item.str),
        });
      }
    }

    for (const hidden of page.hiddenTexts ?? []) {
      if (!normalizeForMatch(hidden)) continue;
      flags.push({
        code: "hidden_text",
        detail: `Text outside the visible page area ${where}`,
        excerpt: capExcerpt(hidden),
      });
      checkStandaloneText(hidden, `outside the visible page area ${where}`, flags);
    }

    for (const annotation of page.annotationTexts ?? []) {
      checkStandaloneText(annotation, `in an annotation ${where}`, flags);
    }
  });

  for (const value of fieldValues) checkStandaloneText(value, "in a form field", flags);

  return capHits(flags);
}

// ---------------------------------------------------------------------------
// Labelled totals (KTD4)
// ---------------------------------------------------------------------------

/** Labels specific enough that the amount may sit on the next line. */
const STRONG_LABEL_RE =
  /\b(?:invoice\s+total|grand\s+total|total\s+amount\s+due|total\s+amount|total\s+due|amount\s+due|balance\s+due|total\s+payable|amount\s+payable)\b/g;

/**
 * A bare "total": its amount must be on the same line (so a "Total" column
 * header never reads the first table row). Subtotals, section totals and
 * "Total Tax"/"Total Qty" style labels are excluded.
 */
const BARE_TOTAL_RE =
  /(?<!\bsub\s?-?\s?)(?<!\b(?:page|line|running|item|parts|labor|labour|tax|sublet|fees?|supplies|misc)\s)\btotal\b(?!\s*(?:tax|taxes|vat|gst|hst|pst|discounts?|savings|qty|quantity|items?|units?|weight|hours|hrs|pages?|paid|parts|labor|labour|excl\w*|before|pieces|pcs)\b)/g;

/**
 * A whole numeric token: never part of a longer number, a date, a code like
 * "INV-20931" or a word like "5qt". Thousands separators and currency symbols
 * are ignored; up to two decimals.
 */
const AMOUNT_TOKEN_RE =
  /(?<![\p{L}\d.,/#-])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?![\p{L}\d/:%]|[.,]\d)/gu;

function tokenCents(intPart: string, decimals: string | undefined): number | null {
  const digits = intPart.replace(/,/g, "");
  if (digits.length > 10) return null;
  const frac = decimals === undefined ? 0 : decimals.length === 1 ? Number(decimals) * 10 : Number(decimals);
  return Number(digits) * 100 + frac;
}

/**
 * Integer-cent amounts printed right after a total-type label ("total",
 * "invoice total", "amount due", "balance due", "grand total"), within a few
 * text items on the same page. One amount per label: the first whole token.
 */
export function findLabelledTotalsCents(pages: readonly ScanPage[]): number[] {
  const found: number[] = [];
  for (const page of pages) {
    const text = assemble(segmentsFromItems(page.items));
    const { spaced, ends, segments } = text;
    if (segments.length === 0) continue;

    const labels: Array<{ start: number; end: number; strong: boolean }> = [];
    for (const m of spaced.matchAll(STRONG_LABEL_RE)) {
      labels.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, strong: true });
    }
    for (const m of spaced.matchAll(BARE_TOTAL_RE)) {
      const at = m.index ?? 0;
      if (labels.some((l) => l.strong && at >= l.start && at < l.end)) continue;
      labels.push({ start: at, end: at + m[0].length, strong: false });
    }
    labels.sort((a, b) => a.start - b.start);

    for (const label of labels) {
      let seg = segments.findIndex((_, i) => ends[i] >= label.end);
      if (seg === -1) seg = segments.length - 1;
      let windowEnd = ends[Math.min(segments.length - 1, seg + LABEL_LOOKAHEAD_ITEMS)];
      if (!label.strong) {
        const lineEnd = spaced.indexOf("\n", label.end);
        if (lineEnd !== -1) windowEnd = Math.min(windowEnd, lineEnd);
      }
      AMOUNT_TOKEN_RE.lastIndex = label.end;
      const m = AMOUNT_TOKEN_RE.exec(spaced);
      if (!m || m.index >= windowEnd) continue;
      const cents = tokenCents(m[1], m[2]);
      if (cents !== null && !found.includes(cents)) found.push(cents);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Scan classification (pure)
// ---------------------------------------------------------------------------

const visibleChars = (page: ScanPage) =>
  page.items.reduce((n, item) => n + normalizeForMatch(item.str).replace(/\s+/g, "").length, 0);

function notScanned(reason: NotScannedReason, hits: ReviewFlag[] = []): PdfScanResult {
  return hits.length > 0 ? { status: "not_scanned", reason, hits } : { status: "not_scanned", reason };
}

/**
 * Turns a document's structural facts and page content into a scan result:
 * scanned (with hits and labelled totals), or not scanned with a reason and
 * any hits found anyway. Forms, scripts and embedded files, an empty text
 * layer, or any near-empty page mean the content can't be fully scanned (R4).
 */
export function classifyScan(
  facts: PdfDocumentFacts,
  pages: readonly ScanPage[],
  fieldValues: readonly string[] = []
): PdfScanResult {
  const hits = detectInstructions(pages, fieldValues);
  if (facts.hasForms || facts.hasJavaScript || facts.hasEmbeddedFiles) {
    return notScanned("forms_or_scripts", hits);
  }
  const counts = pages.map(visibleChars);
  if (facts.pageCount === 0 || counts.length === 0 || counts.every((c) => c === 0)) {
    return notScanned("empty", hits);
  }
  if (counts.some((c) => c < NEAR_EMPTY_PAGE_CHARS)) return notScanned("near_empty_page", hits);
  return { status: "scanned", hits, labelledTotalsCents: findLabelledTotalsCents(pages) };
}

// ---------------------------------------------------------------------------
// unpdf wrapper
// ---------------------------------------------------------------------------

type PdfJs = Awaited<ReturnType<typeof getResolvedPDFJS>>;
type LoadingTask = ReturnType<PdfJs["getDocument"]>;
type PdfDocument = Awaited<LoadingTask["promise"]>;
type DocumentInit = NonNullable<Parameters<PdfJs["getDocument"]>[0]>;

export interface ScanOptions {
  maxBytes?: number;
  maxPages?: number;
  timeoutMs?: number;
}

/** Hardened pdf.js options: no eval, no network or filesystem fetches, strict errors. */
function documentInit(bytes: Uint8Array): DocumentInit {
  const init: DocumentInit & { isEvalSupported?: boolean } = {
    // pdf.js transfers (detaches) the buffer it is given, so pass a copy.
    data: bytes.slice(),
    // pdf.js 5+ has no eval code path (CVE-2024-4367); kept in case an older
    // build is ever swapped in.
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
    useWasm: false,
    enableXfa: false,
    cMapUrl: undefined,
    standardFontDataUrl: undefined,
    wasmUrl: undefined,
    iccUrl: undefined,
    // Anything pdf.js can't read becomes a parse error ("not scanned"), not
    // silently skipped content.
    stopAtErrors: true,
    verbosity: 0,
  };
  return init;
}

const isNonEmpty = (value: unknown): boolean => {
  if (!value) return false;
  if (value instanceof Map || value instanceof Set) return value.size > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
};

function pushStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    if (value.trim() !== "") out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) pushStrings(v, out);
  }
}

/** Text an annotation carries: contents, alt text, author, field value, appearance text. */
function annotationStrings(annotation: Record<string, unknown>): string[] {
  const out: string[] = [];
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
  pushStrings(obj(annotation.contentsObj)?.str, out);
  pushStrings(obj(annotation.titleObj)?.str, out);
  pushStrings(annotation.alternativeText, out);
  pushStrings(annotation.fieldValue, out);
  pushStrings(annotation.buttonValue, out);
  if (Array.isArray(annotation.textContent)) {
    const joined = annotation.textContent.filter((s) => typeof s === "string").join(" ");
    pushStrings(joined, out);
  }
  if (Array.isArray(annotation.options)) {
    for (const option of annotation.options) {
      pushStrings(obj(option)?.displayValue, out);
      pushStrings(obj(option)?.exportValue, out);
    }
  }
  const rich: string[] = [];
  const walk = (node: unknown) => {
    const n = obj(node);
    if (!n) return;
    pushStrings(n.value, rich);
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(annotation.richText);
  pushStrings(rich.join(" "), out);
  return out;
}

function fieldObjectValues(fields: Record<string, unknown[]> | null): string[] {
  const out: string[] = [];
  for (const list of Object.values(fields ?? {})) {
    for (const field of list ?? []) {
      if (!field || typeof field !== "object") continue;
      const f = field as Record<string, unknown>;
      pushStrings(f.value, out);
      pushStrings(f.defaultValue, out);
    }
  }
  return out;
}

/** One text-showing operation: its text and its origin in user space. */
export interface DrawnTextRun {
  text: string;
  x: number;
  y: number;
}

const compactOf = (text: string) => normalizeForMatch(text).replace(/\s+/g, "");

/**
 * Text the page draws that is missing from its visible text layer (pdf.js
 * drops characters outside the page's view box from getTextContent). Two
 * passes, both reported only when the text is absent from the visible layer:
 * consecutive runs whose origin is outside the view (catches text written one
 * glyph per operation), then any single run that is missing (e.g. a line cut
 * off at the page edge).
 */
export function findHiddenRuns(
  runs: readonly DrawnTextRun[],
  view: ScanPage["view"],
  visibleCompact: string
): string[] {
  const drawnLength = runs.reduce((n, r) => n + compactOf(r.text).length, 0);
  // Nothing was dropped if the text layer holds at least as much as was drawn.
  if (drawnLength <= visibleCompact.length) return [];

  const found: string[] = [];
  const foundCompact: string[] = [];
  const add = (text: string) => {
    const compact = compactOf(text);
    if (compact.length < 3 || visibleCompact.includes(compact)) return;
    if (foundCompact.some((f) => f.includes(compact))) return;
    found.push(text.replace(/\s+/g, " ").trim());
    foundCompact.push(compact);
  };

  const outside = (r: DrawnTextRun) =>
    isOutsideView({ str: r.text, x: r.x, y: r.y, width: 0, fontSize: 0 }, view);
  let group: DrawnTextRun[] = [];
  const flush = () => {
    if (group.length === 0) return;
    // Single-glyph runs join directly; whole-word runs get a space between.
    let text = "";
    group.forEach((r, i) => {
      const spaced = i > 0 && r.text.length > 1 && group[i - 1].text.length > 1;
      text += spaced ? ` ${r.text}` : r.text;
    });
    add(text);
    group = [];
  };
  for (const run of runs) {
    if (outside(run)) group.push(run);
    else flush();
  }
  flush();
  for (const run of runs) add(run.text);

  return found.slice(0, MAX_HIDDEN_RUNS_PER_PAGE);
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
/** m1 × m2 in PDF row-vector convention (apply m1, then m2). */
const multiply = (m1: Matrix, m2: Matrix): Matrix => [
  m1[0] * m2[0] + m1[1] * m2[2],
  m1[0] * m2[1] + m1[1] * m2[3],
  m1[2] * m2[0] + m1[3] * m2[2],
  m1[2] * m2[1] + m1[3] * m2[3],
  m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
  m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
];
const toMatrix = (v: unknown): Matrix | null => {
  if (!v || typeof v !== "object") return null;
  const a = v as ArrayLike<unknown>;
  const m = [0, 1, 2, 3, 4, 5].map((i) => Number(a[i]));
  return m.every(Number.isFinite) ? (m as Matrix) : null;
};

/**
 * Reads each showText operation's text and origin from an operator list.
 * Tracks the CTM (save/restore, cm, form XObjects) and the text line matrix
 * (Tm, Td, TD, T*); glyph advances within a line are not tracked, so a run's
 * origin is its line's start. That is enough to tell text placed off the page.
 */
function textRunsFromOperatorList(
  opList: { fnArray: number[]; argsArray: unknown[] },
  OPS: PdfJs["OPS"]
): DrawnTextRun[] {
  const runs: DrawnTextRun[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  let lm: Matrix = IDENTITY;
  let leading = 0;
  const translateLine = (tx: number, ty: number) => {
    if (Number.isFinite(tx) && Number.isFinite(ty)) lm = multiply([1, 0, 0, 1, tx, ty], lm);
  };
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = (opList.argsArray[i] ?? []) as unknown[];
    switch (fn) {
      case OPS.save:
        stack.push(ctm);
        break;
      case OPS.restore:
        ctm = stack.pop() ?? ctm;
        break;
      case OPS.transform: {
        const m = toMatrix(args);
        if (m) ctm = multiply(m, ctm);
        break;
      }
      case OPS.paintFormXObjectBegin: {
        stack.push(ctm);
        const m = toMatrix(args[0]);
        if (m) ctm = multiply(m, ctm);
        break;
      }
      case OPS.paintFormXObjectEnd:
        ctm = stack.pop() ?? ctm;
        break;
      case OPS.beginText:
        lm = IDENTITY;
        break;
      case OPS.setTextMatrix:
        lm = toMatrix(args[0]) ?? toMatrix(args) ?? lm;
        break;
      case OPS.setLeading:
        leading = Number(args[0]) || 0;
        break;
      case OPS.moveText:
        translateLine(Number(args[0]), Number(args[1]));
        break;
      case OPS.setLeadingMoveText:
        leading = -Number(args[1]) || 0;
        translateLine(Number(args[0]), Number(args[1]));
        break;
      case OPS.nextLine:
        translateLine(0, -leading);
        break;
      case OPS.showText: {
        const glyphs = args[0];
        if (!Array.isArray(glyphs)) break;
        let text = "";
        for (const g of glyphs) {
          if (typeof g === "number") {
            if (g <= -200) text += " "; // a wide TJ gap reads as a word break
          } else if (g && typeof g === "object") {
            const glyph = g as { unicode?: unknown; isSpace?: unknown };
            text += glyph.isSpace ? " " : typeof glyph.unicode === "string" ? glyph.unicode : "";
          }
        }
        const [x, y] = [
          lm[4] * ctm[0] + lm[5] * ctm[2] + ctm[4],
          lm[4] * ctm[1] + lm[5] * ctm[3] + ctm[5],
        ];
        runs.push({ text, x, y });
        break;
      }
    }
  }
  return runs;
}

function toScanItem(item: { str: string; transform: number[]; width: number; hasEOL: boolean }): ScanTextItem {
  const [a, b, c, d, e, f] = item.transform;
  return {
    str: item.str,
    x: e,
    y: f,
    width: item.width,
    fontSize: Math.min(Math.hypot(a, b), Math.hypot(c, d)),
    hasEOL: item.hasEOL,
  };
}

async function readDocument(
  pdfjs: PdfJs,
  doc: PdfDocument,
  maxPages: number,
  isCancelled: () => boolean
): Promise<PdfScanResult> {
  if (doc.numPages > maxPages) return notScanned("too_many_pages");

  const [meta, fieldObjects, fieldJs, docJs, attachments] = await Promise.all([
    doc.getMetadata(),
    doc.getFieldObjects(),
    doc.hasJSActions(),
    doc.getJSActions(),
    doc.getAttachments(),
  ]);
  const info = (meta.info ?? {}) as Record<string, unknown>;
  const facts: PdfDocumentFacts = {
    pageCount: doc.numPages,
    hasForms:
      info.IsAcroFormPresent === true ||
      info.IsXFAPresent === true ||
      doc.isPureXfa ||
      isNonEmpty(fieldObjects),
    hasJavaScript: fieldJs || isNonEmpty(docJs),
    hasEmbeddedFiles: info.IsCollectionPresent === true || isNonEmpty(attachments),
  };
  const fieldValues = fieldObjectValues(fieldObjects as Record<string, unknown[]> | null);

  const pages: ScanPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    if (isCancelled()) return notScanned("timeout");
    const page = await doc.getPage(n);
    const [content, annotations, pageJs, opList] = await Promise.all([
      page.getTextContent(),
      page.getAnnotations(),
      page.getJSActions(),
      page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE }),
    ]);

    const items = content.items
      .filter((it): it is Extract<typeof it, { str: string }> => "str" in it)
      .map(toScanItem);
    const visibleCompact = items.map((it) => compactOf(it.str)).join("");

    const annotationTexts: string[] = [];
    for (const raw of annotations as Array<Record<string, unknown>>) {
      annotationTexts.push(...annotationStrings(raw));
      if (raw.annotationType === pdfjs.AnnotationType.FILEATTACHMENT) facts.hasEmbeddedFiles = true;
      if (isNonEmpty(raw.actions)) facts.hasJavaScript = true;
    }
    if (isNonEmpty(pageJs)) facts.hasJavaScript = true;

    const view: ScanPage["view"] =
      page.view.length === 4 ? [page.view[0], page.view[1], page.view[2], page.view[3]] : null;
    pages.push({
      view,
      items,
      annotationTexts,
      hiddenTexts: findHiddenRuns(textRunsFromOperatorList(opList, pdfjs.OPS), view, visibleCompact),
    });
    page.cleanup();
  }

  return classifyScan(facts, pages, fieldValues);
}

const isPasswordError = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { name?: unknown }).name === "PasswordException";

/**
 * Scans a PDF's content. Returns scanned (with hits and labelled totals) or
 * not scanned with a reason: image, unsupported_type, too_large (checked before
 * parsing), encrypted, parse_error, too_many_pages, forms_or_scripts, empty,
 * near_empty_page or timeout. Non-PDF bytes never reach pdf.js.
 */
export async function scanPdf(bytes: Uint8Array, options: ScanOptions = {}): Promise<PdfScanResult> {
  const maxBytes = options.maxBytes ?? MAX_SCAN_BYTES;
  const maxPages = options.maxPages ?? MAX_SCAN_PAGES;
  const timeoutMs = options.timeoutMs ?? SCAN_TIMEOUT_MS;

  if (bytes.byteLength > maxBytes) return notScanned("too_large");
  const fileType = detectFileType(bytes);
  if (fileType !== "pdf") return notScanned(fileType === null ? "unsupported_type" : "image");

  const state: { task?: LoadingTask; cancelled: boolean } = { cancelled: false };
  let timer: ReturnType<typeof setTimeout> | undefined;

  const work = (async (): Promise<PdfScanResult> => {
    const pdfjs = await getResolvedPDFJS();
    const task = pdfjs.getDocument(documentInit(bytes));
    state.task = task;
    const doc = await task.promise;
    return readDocument(pdfjs, doc, maxPages, () => state.cancelled);
  })().catch((error: unknown) => notScanned(isPasswordError(error) ? "encrypted" : "parse_error"));

  const timedOut = new Promise<PdfScanResult>((resolve) => {
    timer = setTimeout(() => resolve(notScanned("timeout")), timeoutMs);
  });

  try {
    const result = await Promise.race([work, timedOut]);
    if (result.status === "not_scanned" && result.reason === "timeout") state.cancelled = true;
    return result;
  } finally {
    clearTimeout(timer);
    state.task?.destroy().catch(() => {});
  }
}
