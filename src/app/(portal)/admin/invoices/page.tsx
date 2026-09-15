"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDateUTC } from "@/lib/utils";
import { getSignedInvoiceUrl } from "@/lib/supabase/storage";
import { Eye, CheckCircle, XCircle, Undo2, Bot, AlertTriangle, Loader2, Trash2, Pencil, Save, RefreshCw } from "lucide-react";
import type { ApprovalDecision } from "@/lib/invoice-checks";
import {
  ReviewWarnings,
  hasExtractedValues,
  normalizeFlags,
  type ReviewExtraction,
} from "./review-warnings";

/** How often the review modal re-reads an extraction that is still running. */
const POLL_INTERVAL_MS = 3000;

/** GET/PATCH /api/invoices/:id for an admin. Only the fields this page reads. */
interface InvoiceDetail {
  id: string;
  amount: number | string;
  status: string;
  extraction: ReviewExtraction | null;
  approval?: ApprovalDecision;
}

async function loadInvoices(): Promise<InvoiceWithRelations[]> {
  const res = await fetch("/api/invoices");
  const { data } = await res.json();
  return data || [];
}

/** The admin detail for one invoice, or null when it couldn't be read. */
async function fetchInvoiceDetail(invoiceId: string): Promise<InvoiceDetail | null> {
  try {
    const res = await fetch(`/api/invoices/${invoiceId}`);
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    return body?.data ?? null;
  } catch {
    return null;
  }
}

interface EditForm {
  amount: string;
  vendor_name: string;
  invoice_number: string;
  invoice_date: string;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
}

interface InvoiceWithRelations {
  id: string;
  shop_id: string;
  file_path: string;
  amount: number;
  status: string;
  is_initial: boolean;
  created_at: string;
  users: { name: string };
  shops: { name: string };
  extraction_status: string | null;
}

const statusColors: Record<string, string> = {
  pending: "border-yellow-500 text-yellow-700 bg-yellow-50",
  approved: "border-green-500 text-green-700 bg-green-50",
  rejected: "border-red-500 text-red-700 bg-red-50",
};

export default function AdminInvoicesPage() {
  const { isAdmin } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Review modal state
  const [reviewTarget, setReviewTarget] = useState<InvoiceWithRelations | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [actionLoading, setActionLoading] = useState<"approve" | "reject" | null>(null);
  const [extractionData, setExtractionData] = useState<ReviewExtraction | null>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  // The server's approval decision for the displayed run. Never derived here.
  const [approval, setApproval] = useState<ApprovalDecision | null>(null);
  // The "I reviewed the original" confirmation, keyed to the run it was given
  // for: it counts only while that run is still the one displayed, so a
  // refetch, re-run or edit (each a new run_id) clears it.
  const [confirmation, setConfirmation] = useState<{ runId: string; checked: boolean } | null>(null);
  const [rerunning, setRerunning] = useState(false);
  // Inline error for approve, re-run and edit refusals shown above the footer.
  const [reviewError, setReviewError] = useState("");
  // The invoice the open modal shows. Late responses for any other are dropped.
  const activeReviewId = useRef<string | null>(null);

  // Manual-override edit state for the AI-extracted panel.
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<InvoiceWithRelations | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const fetchInvoices = useCallback(async () => {
    setInvoices(await loadInvoices());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    loadInvoices().then((data) => {
      if (cancelled) return;
      setInvoices(data);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  /** Shows a fetched detail, if its invoice is still the one under review. */
  const applyDetail = useCallback((invoiceId: string, detail: InvoiceDetail) => {
    if (activeReviewId.current !== invoiceId) return;
    setExtractionData(detail.extraction ?? null);
    setApproval(detail.approval ?? null);
    setReviewTarget((prev) =>
      prev && prev.id === invoiceId
        ? { ...prev, amount: Number(detail.amount), status: detail.status }
        : prev
    );
  }, []);

  const refreshDetail = useCallback(
    async (invoiceId: string) => {
      const detail = await fetchInvoiceDetail(invoiceId);
      if (detail) applyDetail(invoiceId, detail);
    },
    [applyDetail]
  );

  // While the run is still extracting, re-read it every few seconds. Stops as
  // soon as it finishes, the modal closes or the page unmounts.
  const reviewId = reviewTarget?.id ?? null;
  const extractionProcessing = extractionData?.status === "processing";
  useEffect(() => {
    if (!reviewId || !extractionProcessing || rerunning) return;
    let cancelled = false;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      const detail = await fetchInvoiceDetail(reviewId);
      inFlight = false;
      if (!cancelled && detail) applyDetail(reviewId, detail);
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [reviewId, extractionProcessing, rerunning, applyDetail]);

  const openReview = async (inv: InvoiceWithRelations) => {
    activeReviewId.current = inv.id;
    setReviewTarget(inv);
    setPreviewUrl(null);
    setExtractionData(null);
    setApproval(null);
    setConfirmation(null);
    setReviewError("");
    setRerunning(false);
    setLoadingPreview(true);
    setExtractionLoading(true);

    const [signedUrl, detail] = await Promise.all([
      getSignedInvoiceUrl(inv.file_path),
      fetchInvoiceDetail(inv.id),
    ]);
    if (activeReviewId.current !== inv.id) return;

    setPreviewUrl(signedUrl.url || null);
    setLoadingPreview(false);

    if (detail) applyDetail(inv.id, detail);
    setExtractionLoading(false);
  };

  const closeReview = () => {
    activeReviewId.current = null;
    setReviewTarget(null);
    setPreviewUrl(null);
    setActionLoading(null);
    setExtractionData(null);
    setApproval(null);
    setConfirmation(null);
    setReviewError("");
    setRerunning(false);
    setEditing(false);
    setEditForm(null);
    setEditError("");
  };

  // --- Review gate, from the displayed run and the server's decision --------
  const displayedRunId = extractionData?.run_id ?? null;
  const confirmed =
    displayedRunId !== null &&
    confirmation?.runId === displayedRunId &&
    confirmation.checked;
  const invoiceApproved =
    reviewTarget?.status === "approved" || !!extractionData?.approved_run_id;
  const showConfirmation =
    !!approval?.approvable &&
    approval.confirmationRequired &&
    displayedRunId !== null &&
    !invoiceApproved &&
    !rerunning &&
    !editing &&
    !extractionLoading;
  const canEdit =
    !editing &&
    !extractionLoading &&
    !rerunning &&
    extractionData?.status !== "processing" &&
    !invoiceApproved;
  // Any pending invoice that isn't approved can be (re-)extracted (KTD7).
  const canRerun =
    reviewTarget?.status === "pending" &&
    !invoiceApproved &&
    !editing &&
    !extractionLoading;

  let approveBlockedReason: string | null = null;
  if (reviewTarget && !extractionLoading) {
    if (invoiceApproved) {
      approveBlockedReason = "This invoice is already approved.";
    } else if (rerunning) {
      approveBlockedReason = "Wait for the extraction to finish.";
    } else if (editing) {
      approveBlockedReason = "Save or cancel your edits before approving.";
    } else if (!approval) {
      approveBlockedReason =
        "The review details didn't load, so this invoice can't be approved. Close and reopen the review.";
    } else if (approval.reasons.includes("processing")) {
      approveBlockedReason =
        "Extraction is still running. Approve becomes available when it finishes.";
    } else if (approval.reasons.includes("no_extraction") || displayedRunId === null) {
      approveBlockedReason =
        "This invoice has no extraction yet. Run extraction before approving.";
    } else if (!approval.approvable) {
      approveBlockedReason = "This invoice can't be approved yet.";
    } else if (approval.confirmationRequired && !confirmed) {
      approveBlockedReason =
        "Confirm you reviewed the original document to enable Approve.";
    }
  }
  const approveDisabled =
    !!actionLoading || extractionLoading || approveBlockedReason !== null;

  const startEdit = () => {
    setEditError("");
    setEditForm({
      amount: reviewTarget ? String(reviewTarget.amount) : "",
      vendor_name: extractionData?.vendor_name ?? "",
      invoice_number: extractionData?.invoice_number ?? "",
      invoice_date: extractionData?.invoice_date
        ? extractionData.invoice_date.slice(0, 10)
        : "",
      subtotal:
        extractionData?.subtotal != null ? String(extractionData.subtotal) : "",
      tax_amount:
        extractionData?.tax_amount != null
          ? String(extractionData.tax_amount)
          : "",
      total_amount:
        extractionData?.total_amount != null
          ? String(extractionData.total_amount)
          : "",
    });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditForm(null);
    setEditError("");
  };

  const updateEdit = (key: keyof EditForm) => (value: string) =>
    setEditForm((f) => (f ? { ...f, [key]: value } : f));

  const saveEdit = async () => {
    if (!reviewTarget || !editForm) return;
    setSavingEdit(true);
    setEditError("");

    const numOrNull = (s: string) => {
      const t = s.trim();
      if (t === "") return null;
      const n = parseFloat(t);
      return isNaN(n) ? null : n;
    };

    const amountNum = parseFloat(editForm.amount);
    const body: { amount?: number; extraction: Record<string, unknown> } = {
      extraction: {
        vendor_name: editForm.vendor_name.trim() || null,
        invoice_number: editForm.invoice_number.trim() || null,
        invoice_date: editForm.invoice_date || null,
        subtotal: numOrNull(editForm.subtotal),
        tax_amount: numOrNull(editForm.tax_amount),
        total_amount: numOrNull(editForm.total_amount),
      },
    };
    if (!isNaN(amountNum) && amountNum > 0) body.amount = amountNum;

    const invoiceId = reviewTarget.id;
    let res: Response;
    try {
      res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setSavingEdit(false);
      setEditError("Could not save changes. Check your connection and try again.");
      return;
    }
    const data = await res.json().catch(() => null);
    setSavingEdit(false);
    if (activeReviewId.current !== invoiceId) return;

    if (!res.ok) {
      const message =
        typeof data?.error === "string"
          ? data.error
          : "Could not save changes. Please check the values.";
      if (res.status === 409 && data?.code === "approved") {
        // Approved values are final; leave edit mode and show why.
        setEditing(false);
        setEditForm(null);
        setEditError("");
        setReviewError(message);
        fetchInvoices();
      } else {
        setEditError(message);
      }
      // The run changed or the invoice was approved: show its current state.
      if (res.status === 409) await refreshDetail(invoiceId);
      return;
    }

    // The edit started a new run (new run_id), which clears any confirmation.
    if (data?.data) applyDetail(invoiceId, data.data as InvoiceDetail);
    setReviewError("");
    setEditing(false);
    setEditForm(null);
    fetchInvoices();
  };

  const rerunExtraction = async () => {
    if (!reviewTarget) return;
    const invoiceId = reviewTarget.id;
    setRerunning(true);
    setReviewError("");
    setConfirmation(null);

    // Synchronous on the server (up to ~60s); the panel shows a running state.
    let message = "";
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/extract`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        message =
          typeof data?.error === "string"
            ? data.error
            : `Extraction could not be run (${res.status}).`;
      }
    } catch {
      message = "Extraction request failed. Check your connection and try again.";
    }
    if (activeReviewId.current !== invoiceId) return;

    await refreshDetail(invoiceId);
    if (activeReviewId.current !== invoiceId) return;
    setRerunning(false);
    if (message) setReviewError(message);
  };

  const handleApprove = async () => {
    if (!reviewTarget || !extractionData) return;
    const invoiceId = reviewTarget.id;
    const runId = extractionData.run_id;
    setActionLoading("approve");
    setReviewError("");

    let res: Response;
    try {
      res = await fetch(`/api/invoices/${invoiceId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          confirmed ? { runId, confirmReviewed: true } : { runId }
        ),
      });
    } catch {
      setReviewError("Approval failed. Check your connection and try again.");
      setActionLoading(null);
      return;
    }

    if (res.ok) {
      if (activeReviewId.current === invoiceId) closeReview();
      fetchInvoices();
      return;
    }

    const data = await res.json().catch(() => null);
    if (activeReviewId.current !== invoiceId) return;
    setReviewError(
      typeof data?.error === "string"
        ? data.error
        : `Approval failed (${res.status}). Please try again.`
    );
    // Any 409 means what's displayed is out of date: refetch. A new run_id
    // clears the confirmation, so the admin re-confirms for what they now see.
    if (res.status === 409) {
      await refreshDetail(invoiceId);
      if (data?.code === "already_approved") fetchInvoices();
    }
    if (activeReviewId.current === invoiceId) setActionLoading(null);
  };

  const handleReject = async () => {
    if (!reviewTarget) return;
    setActionLoading("reject");

    const res = await fetch(`/api/invoices/${reviewTarget.id}/reject`, {
      method: "POST",
    });

    if (res.ok) {
      closeReview();
      fetchInvoices();
    }
    setActionLoading(null);
  };

  const handleUnapprove = async (invoiceId: string) => {
    const res = await fetch(`/api/invoices/${invoiceId}/unapprove`, {
      method: "POST",
    });
    if (res.ok) fetchInvoices();
  };

  const handleUnreject = async (invoiceId: string) => {
    const res = await fetch(`/api/invoices/${invoiceId}/unreject`, {
      method: "POST",
    });
    if (res.ok) fetchInvoices();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");

    const res = await fetch(`/api/invoices/${deleteTarget.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setDeleteTarget(null);
      fetchInvoices();
    } else {
      const data = await res.json().catch(() => null);
      setDeleteError(
        typeof data?.error === "string"
          ? data.error
          : `Failed to delete invoice (${res.status}).`
      );
    }
    setDeleting(false);
  };

  if (!isAdmin) return <p>Unauthorized</p>;

  const pendingInvoices = invoices.filter((i) => i.status === "pending");
  const approvedInvoices = invoices.filter((i) => i.status === "approved");
  const rejectedInvoices = invoices.filter((i) => i.status === "rejected");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-exxon-charcoal">
        Review Invoices
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Pending Review ({pendingInvoices.length})</CardTitle>
          <CardDescription>
            Invoices awaiting admin approval
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : pendingInvoices.length === 0 ? (
            <p className="text-muted-foreground">No pending invoices.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Shop</TableHead>
                  <TableHead>Submitted By</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      {new Date(inv.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{inv.shops?.name || "—"}</TableCell>
                    <TableCell>{inv.users?.name || "—"}</TableCell>
                    <TableCell>{formatCurrency(Number(inv.amount))}</TableCell>
                    <TableCell>
                      {inv.is_initial ? (
                        <Badge className="bg-exxon-blue text-white">
                          Initial
                        </Badge>
                      ) : (
                        "Regular"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-exxon-blue hover:text-exxon-blue hover:bg-blue-50"
                          onClick={() => openReview(inv)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Review
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          aria-label="Delete invoice"
                          onClick={() => {
                            setDeleteError("");
                            setDeleteTarget(inv);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recently Approved ({approvedInvoices.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {approvedInvoices.length === 0 ? (
            <p className="text-muted-foreground">No approved invoices yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Shop</TableHead>
                  <TableHead>Submitted By</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvedInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      {new Date(inv.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{inv.shops?.name || "—"}</TableCell>
                    <TableCell>{inv.users?.name || "—"}</TableCell>
                    <TableCell>{formatCurrency(Number(inv.amount))}</TableCell>
                    <TableCell>
                      {inv.is_initial ? "Initial" : "Regular"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusColors.approved}
                      >
                        Approved
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUnapprove(inv.id)}
                        >
                          <Undo2 className="h-4 w-4 mr-1" />
                          Open for Review
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          aria-label="Delete invoice"
                          onClick={() => {
                            setDeleteError("");
                            setDeleteTarget(inv);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {rejectedInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Rejected ({rejectedInvoices.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Shop</TableHead>
                  <TableHead>Submitted By</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rejectedInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      {new Date(inv.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{inv.shops?.name || "—"}</TableCell>
                    <TableCell>{inv.users?.name || "—"}</TableCell>
                    <TableCell>{formatCurrency(Number(inv.amount))}</TableCell>
                    <TableCell>
                      {inv.is_initial ? "Initial" : "Regular"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusColors.rejected}
                      >
                        Rejected
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUnreject(inv.id)}
                        >
                          <Undo2 className="h-4 w-4 mr-1" />
                          Open for Review
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          aria-label="Delete invoice"
                          onClick={() => {
                            setDeleteError("");
                            setDeleteTarget(inv);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Review Modal */}
      <Dialog open={!!reviewTarget} onOpenChange={(open) => { if (!open) closeReview(); }}>
        <DialogContent className="sm:max-w-6xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Review Invoice</DialogTitle>
            <DialogDescription>
              {reviewTarget && (
                <>
                  {formatCurrency(Number(reviewTarget.amount))} &middot;{" "}
                  {reviewTarget.is_initial ? "Initial invoice" : "Regular invoice"} &middot;{" "}
                  Submitted by {reviewTarget.users?.name || "Unknown"} on{" "}
                  {new Date(reviewTarget.created_at).toLocaleDateString()}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex gap-4">
            {/* Left: Document preview */}
            <div className="flex-1 min-h-0">
              {loadingPreview ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Loading invoice...
                </div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-full rounded-md border"
                  title="Invoice preview"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Unable to load invoice preview.
                </div>
              )}
            </div>

            {/* Right: AI-extracted data panel */}
            <div className="w-80 shrink-0 overflow-y-auto border rounded-md p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  AI-Extracted Data
                </h3>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={startEdit}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
              {editing && editForm ? (
                <div className="space-y-3 text-sm">
                  <p className="text-xs text-muted-foreground">
                    Override the values detected by the AI. The invoice amount
                    below is what the program uses for approval and Stock-Up.
                  </p>
                  <div className="space-y-1">
                    <Label htmlFor="edit-amount">Invoice amount ($)</Label>
                    <Input
                      id="edit-amount"
                      type="number"
                      step="0.01"
                      value={editForm.amount}
                      onChange={(e) => updateEdit("amount")(e.target.value)}
                    />
                  </div>
                  <Separator />
                  <div className="space-y-1">
                    <Label htmlFor="edit-vendor">Vendor</Label>
                    <Input
                      id="edit-vendor"
                      value={editForm.vendor_name}
                      onChange={(e) => updateEdit("vendor_name")(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-number">Invoice #</Label>
                    <Input
                      id="edit-number"
                      value={editForm.invoice_number}
                      onChange={(e) =>
                        updateEdit("invoice_number")(e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-date">Invoice date</Label>
                    <Input
                      id="edit-date"
                      type="date"
                      value={editForm.invoice_date}
                      onChange={(e) =>
                        updateEdit("invoice_date")(e.target.value)
                      }
                    />
                  </div>
                  <Separator />
                  <div className="space-y-1">
                    <Label htmlFor="edit-subtotal">Subtotal ($)</Label>
                    <Input
                      id="edit-subtotal"
                      type="number"
                      step="0.01"
                      value={editForm.subtotal}
                      onChange={(e) => updateEdit("subtotal")(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-tax">Tax ($)</Label>
                    <Input
                      id="edit-tax"
                      type="number"
                      step="0.01"
                      value={editForm.tax_amount}
                      onChange={(e) => updateEdit("tax_amount")(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-total">Total ($)</Label>
                    <Input
                      id="edit-total"
                      type="number"
                      step="0.01"
                      value={editForm.total_amount}
                      onChange={(e) =>
                        updateEdit("total_amount")(e.target.value)
                      }
                    />
                  </div>
                  {editError && (
                    <p className="text-xs text-red-500">{editError}</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="flex-1 bg-exxon-red text-white hover:bg-exxon-red-dark"
                      onClick={saveEdit}
                      disabled={savingEdit}
                    >
                      <Save className="h-3.5 w-3.5 mr-1" />
                      {savingEdit ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={cancelEdit}
                      disabled={savingEdit}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : extractionLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : rerunning ? (
                <div className="rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-2 font-medium text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running extraction...
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The AI is reading the document and the checks are running.
                    This can take up to a minute.
                  </p>
                </div>
              ) : (
                <>
                  {/* Warnings panel: stored warnings + the server's decision */}
                  <ReviewWarnings extraction={extractionData} approval={approval} />

                  {extractionData &&
                    extractionData.status !== "processing" &&
                    (extractionData.status === "completed" ||
                      hasExtractedValues(extractionData)) && (
                    <>
                      <Separator />

                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Vendor:</span>{" "}
                          <bdi>{extractionData.vendor_name || "N/A"}</bdi>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Invoice #:</span>{" "}
                          <bdi>{extractionData.invoice_number || "N/A"}</bdi>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Date:</span>{" "}
                          {extractionData.invoice_date
                            ? formatDateUTC(extractionData.invoice_date)
                            : "N/A"}
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Subtotal:</span>{" "}
                          {extractionData.subtotal != null
                            ? formatCurrency(extractionData.subtotal)
                            : "N/A"}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Tax:</span>{" "}
                          {extractionData.tax_amount != null
                            ? formatCurrency(extractionData.tax_amount)
                            : "N/A"}
                        </div>
                        <div className="font-medium">
                          <span className="text-muted-foreground">Total:</span>{" "}
                          {extractionData.total_amount != null
                            ? formatCurrency(extractionData.total_amount)
                            : "N/A"}
                        </div>
                      </div>

                      {/* Amount comparison. A missing AI total can't confirm the
                          typed amount, so it still counts as a mismatch. */}
                      {reviewTarget && (
                        <div className="p-2 rounded bg-muted text-sm space-y-1">
                          <div>
                            <span className="text-muted-foreground">User submitted:</span>{" "}
                            {formatCurrency(Number(reviewTarget.amount))}
                          </div>
                          <div>
                            <span className="text-muted-foreground">AI extracted:</span>{" "}
                            {extractionData.total_amount != null
                              ? formatCurrency(Number(extractionData.total_amount))
                              : "Not found"}
                          </div>
                          {(extractionData.total_amount == null ||
                            Math.abs(
                              Number(reviewTarget.amount) -
                                Number(extractionData.total_amount)
                            ) > 0.01 ||
                            normalizeFlags(extractionData.review_flags).some(
                              (f) => f.code === "amount_mismatch"
                            )) && (
                            <Badge
                              variant="outline"
                              className="border-yellow-500 text-yellow-700 mt-1"
                            >
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Amount Mismatch
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Line items */}
                      {extractionData.line_items &&
                        extractionData.line_items.length > 0 && (
                          <>
                            <Separator />
                            <div>
                              <h4 className="font-medium text-sm mb-2">
                                Line Items ({extractionData.line_items.length})
                              </h4>
                              <div className="space-y-2">
                                {extractionData.line_items.map((item) => (
                                  <div
                                    key={item.id}
                                    className="text-xs border rounded p-2 space-y-1"
                                  >
                                    <div className="font-medium">
                                      <bdi>{item.description}</bdi>
                                    </div>
                                    <div className="flex justify-between text-muted-foreground">
                                      <span>
                                        {item.quantity != null
                                          ? `Qty: ${item.quantity}`
                                          : ""}
                                        {item.quantity != null &&
                                          item.unit_price != null &&
                                          ` x ${formatCurrency(item.unit_price)}`}
                                      </span>
                                      <span className="font-medium text-foreground">
                                        {formatCurrency(item.amount)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                    </>
                  )}
                </>
              )}

              {canRerun && (
                <div className="space-y-1">
                  <Separator />
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-3"
                    onClick={rerunExtraction}
                    disabled={rerunning || !!actionLoading || savingEdit}
                  >
                    {rerunning ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    )}
                    {rerunning
                      ? "Running extraction..."
                      : extractionData
                        ? "Re-run extraction"
                        : "Run extraction"}
                  </Button>
                  {extractionData && !rerunning && (
                    <p className="text-xs text-muted-foreground">
                      Reads the document again and replaces the values and
                      warnings shown above, including any edits.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Confirmation, why Approve is off, and inline refusals */}
          {reviewTarget &&
            (showConfirmation || approveBlockedReason || reviewError) && (
              <div className="space-y-2 border-t pt-3">
                {showConfirmation && displayedRunId && (
                  <label
                    htmlFor="confirm-reviewed"
                    className="flex items-start gap-3 text-sm leading-relaxed"
                  >
                    <input
                      id="confirm-reviewed"
                      type="checkbox"
                      checked={confirmed}
                      disabled={!!actionLoading}
                      onChange={(e) =>
                        setConfirmation({
                          runId: displayedRunId,
                          checked: e.target.checked,
                        })
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 accent-exxon-red"
                    />
                    <span>
                      I reviewed the original document and it supports this
                      amount ({formatCurrency(Number(reviewTarget.amount))})
                    </span>
                  </label>
                )}
                {approveBlockedReason && (
                  <p className="text-xs text-muted-foreground">
                    {approveBlockedReason}
                  </p>
                )}
                {reviewError && (
                  <p className="text-sm text-red-500" role="alert">
                    {reviewError}
                  </p>
                )}
              </div>
            )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={closeReview}
              disabled={!!actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!!actionLoading}
            >
              <XCircle className="h-4 w-4 mr-1" />
              {actionLoading === "reject" ? "Rejecting..." : "Reject"}
            </Button>
            <Button
              onClick={handleApprove}
              disabled={approveDisabled}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              {actionLoading === "approve" ? "Approving..." : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Invoice</DialogTitle>
            <DialogDescription>
              Permanently delete the{" "}
              <span className="font-semibold">
                {deleteTarget && formatCurrency(Number(deleteTarget.amount))}
              </span>{" "}
              invoice from{" "}
              <span className="font-semibold">{deleteTarget?.shops?.name}</span>
              ? The uploaded file and extracted data will also be removed.
              {deleteTarget?.status === "approved" && (
                <>
                  {" "}
                  This invoice was approved — any points it awarded will be
                  deducted from the shop&apos;s balance.
                </>
              )}
              {deleteTarget?.is_initial && (
                <>
                  {" "}
                  This is an initial enrollment invoice — the shop&apos;s
                  enrollment status will be recalculated.
                </>
              )}{" "}
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? "Deleting..." : "Delete Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
