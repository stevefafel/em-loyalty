/**
 * The admin invoice review's warnings panel and its presentation helpers.
 * Plain components with no hooks, rendered inside the client review modal.
 */
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import type { InvoiceExtraction } from "@/types/database";
import { APPROVAL_STATE_REASONS, REVIEW_FLAG_LABELS, type ApprovalDecision } from "@/lib/invoice-checks";

/**
 * The extraction row as the admin GET returns it: the stored review-gate
 * fields on top of the extracted values (U5). `review_flags` is typed loosely
 * and normalized before rendering.
 */
export interface ReviewExtraction extends InvoiceExtraction {
  run_id: string;
  checks_version: number | null;
  review_flags: unknown;
  approved_run_id: string | null;
  confirmed_run_id: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
}

interface StoredFlag {
  code: string;
  detail: string;
  excerpt?: string;
}

/** Approval reasons that describe the extraction state rather than a stored warning. */
const STATE_REASONS: ReadonlySet<string> = new Set(APPROVAL_STATE_REASONS);

/** Friendly copy per stored `error_message` code. Raw text is never shown (KTD11). */
const EXTRACTION_FAILURE_MESSAGES: Record<string, string> = {
  unsupported_type: "The file isn't a PDF, PNG or JPEG, so it couldn't be read.",
  refused: "The AI declined to read this document.",
  empty_response: "The AI returned no result.",
  truncated: "The AI's answer was cut off, possibly because the document is very long.",
  content_filter: "The AI provider's content filter stopped the extraction.",
  invalid_response: "The AI returned a result in an unexpected format.",
  provider_error: "The AI service couldn't be reached or returned an error.",
  invalid_file_path: "The uploaded file's storage location isn't valid for this shop.",
  download_failed: "The uploaded file couldn't be downloaded from storage.",
  extraction_failed: "Something went wrong while saving the extraction.",
};

/** Friendly copy per `not_scanned` reason code (stored as the flag's detail). */
const NOT_SCANNED_MESSAGES: Record<string, string> = {
  image: "Images can't be scanned for hidden text. Only the AI read this file.",
  encrypted: "The PDF is encrypted, so its text couldn't be scanned.",
  parse_error: "The PDF couldn't be parsed for scanning.",
  empty: "The PDF has no text layer (it may be a scanned image).",
  near_empty_page: "A page has almost no text (it may be a scanned image).",
  forms_or_scripts: "The PDF contains form fields or scripts.",
  too_large: "The file is too large to scan.",
  too_many_pages: "The PDF has too many pages to scan.",
  timeout: "The scan took too long and stopped.",
  unsupported_type: "This file type can't be scanned.",
  not_run: "The scan didn't run.",
};

const lookup = (table: Record<string, string>, key: string | null | undefined) =>
  key != null && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;

const flagLabel = (code: string) =>
  lookup(REVIEW_FLAG_LABELS, code) ?? "Needs review";

/** Reads stored flags defensively; anything malformed is dropped. */
export function normalizeFlags(raw: unknown): StoredFlag[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((f): StoredFlag[] => {
    if (!f || typeof f !== "object") return [];
    const { code, detail, excerpt } = f as Record<string, unknown>;
    if (typeof code !== "string") return [];
    return [
      {
        code,
        detail: typeof detail === "string" ? detail : "",
        excerpt: typeof excerpt === "string" && excerpt !== "" ? excerpt : undefined,
      },
    ];
  });
}

/**
 * Control, bidi and zero-width characters that could hide text or reorder the
 * labels around an excerpt. \n and \t are kept as layout.
 */
function isHiddenCharacter(cp: number): boolean {
  return (
    (cp <= 0x1f && cp !== 0x0a && cp !== 0x09) ||
    (cp >= 0x7f && cp <= 0x9f) ||
    cp === 0x00ad ||
    cp === 0x061c ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x2064) ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    cp === 0xfeff
  );
}

/** Replaces hidden characters with visible markers such as ⟦U+202E⟧. */
function showHiddenCharacters(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    out += isHiddenCharacter(cp)
      ? `⟦U+${cp.toString(16).toUpperCase().padStart(4, "0")}⟧`
      : ch;
  }
  return out;
}

/** Quoted document text: untrusted, plain text only, isolated from its surroundings. */
function DocumentExcerpt({ text }: { text: string }) {
  return (
    <div className="mt-1">
      <p className="text-[11px] font-medium text-muted-foreground">
        Text found in the document
      </p>
      <pre
        dir="ltr"
        style={{ unicodeBidi: "isolate" }}
        className="mt-0.5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded border bg-background px-2 py-1 font-mono text-[11px] leading-snug text-foreground [overflow-wrap:anywhere]"
      >
        {showHiddenCharacters(text)}
      </pre>
    </div>
  );
}

/** The stored warnings, grouped by code, each excerpt rendered as plain text. */
function FlagGroups({ groups }: { groups: Map<string, StoredFlag[]> }) {
  return (
    <div className="rounded-md border border-yellow-500 bg-yellow-50 p-2 text-sm">
      <Badge variant="outline" className="border-yellow-500 bg-white text-yellow-700">
        <AlertTriangle className="h-3 w-3 mr-1" />
        {groups.size === 1 ? "1 warning" : `${groups.size} warnings`}
      </Badge>
      <p className="mt-1 text-xs text-yellow-800">
        Check the original document before approving.
      </p>
      <ul className="mt-2 space-y-3">
        {[...groups.entries()].map(([code, items]) => (
          <li key={code} className="space-y-1">
            <div className="flex items-start gap-1 font-medium text-yellow-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{flagLabel(code)}</span>
            </div>
            {items.map((item, i) => (
              <div key={i} className="pl-4">
                {item.detail && (
                  <p className="text-xs text-yellow-800">
                    {code === "not_scanned"
                      ? lookup(NOT_SCANNED_MESSAGES, item.detail) ?? item.detail
                      : item.detail}
                  </p>
                )}
                {item.excerpt && <DocumentExcerpt text={item.excerpt} />}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The warnings panel (U7): renders the stored warnings and the server's
 * approval decision. It never re-derives the decision on the client.
 */
export function ReviewWarnings({
  extraction,
  approval,
}: {
  extraction: ReviewExtraction | null;
  approval: ApprovalDecision | null;
}) {
  if (!approval) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">
        <div className="flex items-center gap-1 font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Couldn&apos;t load the review details
        </div>
        <p className="mt-1 text-xs">
          Close and reopen this review. Approve stays off until the details load.
        </p>
      </div>
    );
  }

  const reasons = approval.reasons;

  if (!extraction || reasons.includes("no_extraction")) {
    return (
      <div className="rounded-md border p-2 text-sm">
        <div className="flex items-center gap-1 font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
          Not extracted yet
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          The AI hasn&apos;t read this invoice, so nothing has been checked.
          Run extraction before approving.
        </p>
      </div>
    );
  }

  const flags = normalizeFlags(extraction.review_flags);
  const groups = new Map<string, StoredFlag[]>();
  for (const f of flags) groups.set(f.code, [...(groups.get(f.code) ?? []), f]);
  // A reason the server counted that has no stored flag to show still gets its label.
  for (const r of reasons) {
    if (!STATE_REASONS.has(r) && !groups.has(r)) groups.set(r, []);
  }

  // A re-run keeps the previous run's flags on the row until it finishes, so
  // they stay listed under the banner.
  if (extraction.status === "processing" || reasons.includes("processing")) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border p-2 text-sm">
          <div className="flex items-center gap-2 font-medium text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Extraction is running
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            This refreshes automatically. Approve becomes available when it
            finishes. If it hasn&apos;t finished after a couple of minutes,
            re-run extraction.
          </p>
        </div>

        {groups.size > 0 && <FlagGroups groups={groups} />}
      </div>
    );
  }

  const failed = reasons.includes("failed");
  const unchecked = reasons.includes("unchecked");
  const clean =
    approval.approvable && !approval.confirmationRequired && reasons.length === 0 && groups.size === 0;

  return (
    <div className="space-y-2">
      {failed && (
        <div className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          <div className="flex items-center gap-1 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Extraction failed
          </div>
          <p className="mt-1 text-xs">
            {lookup(EXTRACTION_FAILURE_MESSAGES, extraction.error_message) ??
              "The extraction failed for an unknown reason."}
          </p>
          <p className="mt-1 text-xs">
            Nothing was checked automatically. Re-run extraction, or check the
            original document yourself and confirm before approving.
          </p>
        </div>
      )}

      {unchecked && (
        <div className="rounded-md border border-yellow-500 bg-yellow-50 p-2 text-sm text-yellow-800">
          <Badge variant="outline" className="border-yellow-500 bg-white text-yellow-700">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Not checked automatically
          </Badge>
          <p className="mt-1 text-xs">
            This extraction ran before the automatic checks existed, or its
            values were entered by hand. Check the original document yourself
            and confirm before approving. Re-running extraction runs the checks.
          </p>
        </div>
      )}

      {groups.size > 0 && <FlagGroups groups={groups} />}

      {clean && (
        <div className="flex items-center gap-1 text-xs text-green-700">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Automatic checks found no problems.
        </div>
      )}
    </div>
  );
}

/** True when a row has any extracted or hand-entered value worth showing. */
export function hasExtractedValues(ex: ReviewExtraction): boolean {
  return (
    ex.vendor_name != null ||
    ex.invoice_number != null ||
    ex.invoice_date != null ||
    ex.subtotal != null ||
    ex.tax_amount != null ||
    ex.total_amount != null ||
    (ex.line_items?.length ?? 0) > 0
  );
}
