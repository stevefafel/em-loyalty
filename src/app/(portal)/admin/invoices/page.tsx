"use client";

import { useState, useEffect, useCallback } from "react";
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
import { formatCurrency } from "@/lib/utils";
import { getSignedInvoiceUrl } from "@/lib/supabase/storage";
import { Eye, CheckCircle, XCircle, Undo2, Bot, AlertTriangle, Loader2 } from "lucide-react";
import type { InvoiceExtraction } from "@/types/database";

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
  const [extractionData, setExtractionData] = useState<InvoiceExtraction | null>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);

  const fetchInvoices = useCallback(async () => {
    const res = await fetch("/api/invoices");
    const { data } = await res.json();
    setInvoices(data || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchInvoices();
  }, [isAdmin, fetchInvoices]);

  const openReview = async (inv: InvoiceWithRelations) => {
    setReviewTarget(inv);
    setPreviewUrl(null);
    setExtractionData(null);
    setLoadingPreview(true);
    setExtractionLoading(true);

    const [signedUrl, detailRes] = await Promise.all([
      getSignedInvoiceUrl(inv.file_path),
      fetch(`/api/invoices/${inv.id}`),
    ]);

    setPreviewUrl(signedUrl.url || null);
    setLoadingPreview(false);

    if (detailRes.ok) {
      const { data } = await detailRes.json();
      setExtractionData(data.extraction || null);
    }
    setExtractionLoading(false);
  };

  const closeReview = () => {
    setReviewTarget(null);
    setPreviewUrl(null);
    setActionLoading(null);
    setExtractionData(null);
  };

  const handleApprove = async () => {
    if (!reviewTarget) return;
    setActionLoading("approve");

    const res = await fetch(`/api/invoices/${reviewTarget.id}/approve`, {
      method: "POST",
    });

    if (res.ok) {
      closeReview();
      fetchInvoices();
    }
    setActionLoading(null);
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
                  <TableHead>Points</TableHead>
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
                      +{Math.floor(Number(inv.amount) / 100)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-exxon-blue hover:text-exxon-blue hover:bg-blue-50"
                        onClick={() => openReview(inv)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Review
                      </Button>
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUnapprove(inv.id)}
                      >
                        <Undo2 className="h-4 w-4 mr-1" />
                        Open for Review
                      </Button>
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUnreject(inv.id)}
                      >
                        <Undo2 className="h-4 w-4 mr-1" />
                        Open for Review
                      </Button>
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
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Bot className="h-4 w-4" />
                AI-Extracted Data
              </h3>
              {extractionLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : !extractionData ? (
                <p className="text-sm text-muted-foreground">
                  No extraction data available.
                </p>
              ) : extractionData.status === "processing" ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </div>
              ) : extractionData.status === "failed" ? (
                <div className="text-sm text-red-500 space-y-2">
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" />
                    Extraction failed
                  </div>
                  {extractionData.error_message && (
                    <p className="text-xs text-muted-foreground">
                      {extractionData.error_message}
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (!reviewTarget) return;
                      setExtractionLoading(true);
                      setExtractionData(null);
                      await fetch(`/api/invoices/${reviewTarget.id}/extract`, { method: "POST" });
                      const detailRes = await fetch(`/api/invoices/${reviewTarget.id}`);
                      if (detailRes.ok) {
                        const { data } = await detailRes.json();
                        setExtractionData(data.extraction || null);
                      }
                      setExtractionLoading(false);
                    }}
                  >
                    Retry Extraction
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Vendor:</span>{" "}
                      {extractionData.vendor_name || "N/A"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Invoice #:</span>{" "}
                      {extractionData.invoice_number || "N/A"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Date:</span>{" "}
                      {extractionData.invoice_date
                        ? new Date(extractionData.invoice_date).toLocaleDateString()
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

                  {/* Amount comparison */}
                  {reviewTarget && extractionData.total_amount != null && (
                    <div className="p-2 rounded bg-muted text-sm space-y-1">
                      <div>
                        <span className="text-muted-foreground">User submitted:</span>{" "}
                        {formatCurrency(Number(reviewTarget.amount))}
                      </div>
                      <div>
                        <span className="text-muted-foreground">AI extracted:</span>{" "}
                        {formatCurrency(extractionData.total_amount)}
                      </div>
                      {Math.abs(
                        Number(reviewTarget.amount) - extractionData.total_amount
                      ) > 0.01 && (
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
                                  {item.description}
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
            </div>
          </div>
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
              disabled={!!actionLoading}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              {actionLoading === "approve" ? "Approving..." : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
