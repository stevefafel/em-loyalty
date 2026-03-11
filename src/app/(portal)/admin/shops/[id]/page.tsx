"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import { getSignedInvoiceUrl } from "@/lib/supabase/storage";
import { ArrowLeft, Eye, Award, Store, FileText, BookOpen } from "lucide-react";
import type { Shop, LoyaltyLedgerEntry } from "@/types/database";

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
}

const statusColors: Record<string, string> = {
  new: "border-gray-400 text-gray-600 bg-gray-50",
  pending: "border-yellow-500 text-yellow-700 bg-yellow-50",
  approved: "border-green-500 text-green-700 bg-green-50",
  rejected: "border-red-500 text-red-700 bg-red-50",
};

const invoiceStatusColors: Record<string, string> = {
  pending: "border-yellow-500 text-yellow-700 bg-yellow-50",
  approved: "border-green-500 text-green-700 bg-green-50",
  rejected: "border-red-500 text-red-700 bg-red-50",
};

export default function ShopDetailsPage() {
  const { isAdmin } = useAuth();
  const { id } = useParams<{ id: string }>();

  const [shop, setShop] = useState<Shop | null>(null);
  const [invoices, setInvoices] = useState<InvoiceWithRelations[]>([]);
  const [ledger, setLedger] = useState<LoyaltyLedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Preview modal state
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceWithRelations | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const fetchData = useCallback(async () => {
    const [shopRes, invoicesRes, ledgerRes] = await Promise.all([
      fetch(`/api/shops/${id}`),
      fetch(`/api/invoices?shop_id=${id}`),
      fetch(`/api/points?shop_id=${id}`),
    ]);

    const shopData = await shopRes.json();
    const invoicesData = await invoicesRes.json();
    const ledgerData = await ledgerRes.json();

    setShop(shopData.data || null);
    setInvoices(invoicesData.data || []);
    setLedger(ledgerData.data || []);
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    if (isAdmin && id) fetchData();
  }, [isAdmin, id, fetchData]);

  const openPreview = async (inv: InvoiceWithRelations) => {
    setPreviewInvoice(inv);
    setPreviewUrl(null);
    setLoadingPreview(true);

    const { url } = await getSignedInvoiceUrl(inv.file_path);
    setPreviewUrl(url || null);
    setLoadingPreview(false);
  };

  const closePreview = () => {
    setPreviewInvoice(null);
    setPreviewUrl(null);
  };

  if (!isAdmin) return <p>Unauthorized</p>;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="space-y-6">
        <p className="text-muted-foreground">Shop not found.</p>
        <Button variant="outline" asChild>
          <Link href="/admin/shops">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Shops
          </Link>
        </Button>
      </div>
    );
  }

  const pendingCount = invoices.filter((i) => i.status === "pending").length;
  const approvedCount = invoices.filter((i) => i.status === "approved").length;
  const rejectedCount = invoices.filter((i) => i.status === "rejected").length;

  // Compute running balance from oldest to newest
  const ledgerOldestFirst = [...ledger].reverse();
  let runningBalance = 0;
  const ledgerWithBalance = ledgerOldestFirst.map((entry) => {
    runningBalance += entry.points_delta;
    return { ...entry, runningBalance };
  });
  // Display newest first
  const ledgerDisplay = [...ledgerWithBalance].reverse();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/shops">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Link>
        </Button>
        <h1 className="text-3xl font-bold text-exxon-charcoal">{shop.name}</h1>
        <Badge
          variant="outline"
          className={statusColors[shop.program_status]}
        >
          {shop.program_status}
        </Badge>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">
            <Store className="h-4 w-4 mr-1" />
            Shop Details
          </TabsTrigger>
          <TabsTrigger value="invoices">
            <FileText className="h-4 w-4 mr-1" />
            Invoices
          </TabsTrigger>
          <TabsTrigger value="ledger">
            <BookOpen className="h-4 w-4 mr-1" />
            Points Ledger
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Shop Details */}
        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Shop Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-muted-foreground">Name</dt>
                  <dd className="font-medium">{shop.name}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Address</dt>
                  <dd className="font-medium">{shop.address || "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Phone</dt>
                  <dd className="font-medium">{shop.phone || "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Program Status</dt>
                  <dd>
                    <Badge
                      variant="outline"
                      className={statusColors[shop.program_status]}
                    >
                      {shop.program_status}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Points Balance</dt>
                  <dd className="text-2xl font-bold text-exxon-charcoal">
                    {shop.loyalty_points_balance}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Member Since</dt>
                  <dd className="font-medium">
                    {new Date(shop.created_at).toLocaleDateString()}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoice Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
                  <p className="text-sm text-muted-foreground">Approved</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-2xl font-bold text-red-600">{rejectedCount}</p>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-2xl font-bold text-exxon-charcoal">{invoices.length}</p>
                  <p className="text-sm text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Invoices */}
        <TabsContent value="invoices">
          <Card>
            <CardHeader>
              <CardTitle>Invoices ({invoices.length})</CardTitle>
              <CardDescription>
                All invoices submitted for {shop.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <p className="text-muted-foreground">No invoices yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Submitted By</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          {new Date(inv.created_at).toLocaleDateString()}
                        </TableCell>
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
                          <Badge
                            variant="outline"
                            className={invoiceStatusColors[inv.status]}
                          >
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openPreview(inv)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Points Ledger */}
        <TabsContent value="ledger" className="space-y-4">
          <Card className="border-exxon-red/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-exxon-red/10">
                  <Award className="h-8 w-8 text-exxon-red" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current Balance</p>
                  <p className="text-4xl font-bold text-exxon-charcoal">
                    {shop.loyalty_points_balance}
                  </p>
                  <p className="text-sm text-muted-foreground">premium growth points</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Points History</CardTitle>
              <CardDescription>
                All point transactions for {shop.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ledger.length === 0 ? (
                <p className="text-muted-foreground">No transactions yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Points</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerDisplay.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          {new Date(entry.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {entry.description || "Points transaction"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              entry.type === "credit"
                                ? "border-green-500 text-green-700 bg-green-50"
                                : "border-red-500 text-red-700 bg-red-50"
                            }
                          >
                            {entry.type}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold ${
                            entry.type === "credit"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {entry.type === "credit" ? "+" : ""}
                          {entry.points_delta}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {entry.runningBalance}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Invoice Preview Modal */}
      <Dialog open={!!previewInvoice} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="sm:max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Invoice Preview</DialogTitle>
            <DialogDescription>
              {previewInvoice && (
                <>
                  {formatCurrency(Number(previewInvoice.amount))} &middot;{" "}
                  {previewInvoice.is_initial ? "Initial invoice" : "Regular invoice"} &middot;{" "}
                  Submitted by {previewInvoice.users?.name || "Unknown"} on{" "}
                  {new Date(previewInvoice.created_at).toLocaleDateString()}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
