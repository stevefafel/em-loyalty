"use client";

import { useState, useEffect, useCallback } from "react";
import { useShop } from "@/context/shop-context";
import { useEnrollmentGuard } from "@/hooks/use-enrollment-guard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { uploadInvoice } from "@/lib/supabase/storage";
import { formatCurrency } from "@/lib/utils";
import type { Invoice, LoyaltyLedgerEntry, OilChangeCount } from "@/types/database";
import {
  PEGASUS_THRESHOLD,
  aggregateOilChangesByMonth,
  computePegasusStatus,
} from "@/lib/pegasus";
import { Plus, Award, FileText, BookOpen, Upload, RefreshCw, GraduationCap, Eye } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function EarnAndTrackPage() {
  const { activeShop } = useShop();
  const { isApproved, isLoading: guardLoading } = useEnrollmentGuard();

  const [invoices, setInvoices] = useState<(Invoice & { users: { name: string } })[]>([]);
  const [ledger, setLedger] = useState<LoyaltyLedgerEntry[]>([]);
  const [oilChanges, setOilChanges] = useState<OilChangeCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    if (!activeShop) return;
    const [invoicesRes, ledgerRes, oilChangesRes] = await Promise.all([
      fetch(`/api/invoices?shop_id=${activeShop.id}`),
      fetch(`/api/points?shop_id=${activeShop.id}`),
      fetch(`/api/oil-changes?shop_id=${activeShop.id}`),
    ]);
    const invoicesData = await invoicesRes.json();
    const ledgerData = await ledgerRes.json();
    const oilChangesData = await oilChangesRes.json();
    setInvoices(invoicesData.data || []);
    setLedger(ledgerData.data || []);
    setOilChanges(oilChangesData.data || []);
    setIsLoading(false);
  }, [activeShop]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  type PointsView = "current" | "monthly" | "cumulative";
  const [pointsView, setPointsView] = useState<PointsView>("current");

  if (guardLoading || !isApproved) return null;

  const currentPoints = activeShop?.loyalty_points_balance || 0;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyEarned = ledger
    .filter((e: LoyaltyLedgerEntry) => e.type === "credit" && new Date(e.created_at) >= monthStart)
    .reduce((sum: number, e: LoyaltyLedgerEntry) => sum + e.points_delta, 0);
  const cumulativeEarned = ledger
    .filter((e: LoyaltyLedgerEntry) => e.type === "credit")
    .reduce((sum: number, e: LoyaltyLedgerEntry) => sum + e.points_delta, 0);
  const pointsDisplay = pointsView === "current" ? currentPoints : pointsView === "monthly" ? monthlyEarned : cumulativeEarned;
  const pointsLabel = pointsView === "current" ? "current balance" : pointsView === "monthly" ? "earned this month" : "total earned all time";

  // Pegasus status: 3 consecutive months of 25+ oil changes
  const pegasusBuckets = aggregateOilChangesByMonth(oilChanges, 3, now);
  const pegasusMonths = pegasusBuckets.map((b) => ({
    label: b.isCurrent ? "Current Month" : b.label,
    count: b.count,
  }));
  const { inPegasus, monthsToGo } = computePegasusStatus(pegasusBuckets);
  const pegasusThreshold = PEGASUS_THRESHOLD;
  const pegasusMaxCount = Math.max(...pegasusMonths.map((m) => m.count), pegasusThreshold);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!file || !activeShop) return;

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setIsUploading(true);

    const { path, error: uploadError } = await uploadInvoice(
      activeShop.id,
      file
    );

    if (uploadError) {
      setError("Failed to upload file");
      setIsUploading(false);
      return;
    }

    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopId: activeShop.id,
        amount: amountNum,
        isInitial: false,
        filePath: path,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to submit");
      setIsUploading(false);
      return;
    }

    // Trigger AI extraction (fire-and-forget)
    const { data: newInvoice } = await res.json();
    if (newInvoice?.id) {
      fetch(`/api/invoices/${newInvoice.id}/extract`, { method: "POST" });
    }

    setDialogOpen(false);
    setFile(null);
    setAmount("");
    setIsUploading(false);
    fetchData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-exxon-charcoal">
          Earn & Track Points
        </h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-exxon-red text-white hover:bg-exxon-red-dark">
              <Plus className="h-4 w-4 mr-2" />
              Upload Invoice
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload New Invoice</DialogTitle>
              <DialogDescription>
                Submit a Mobil 1 purchase invoice for program enrollment and
                purchase tracking.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="upload-amount">Amount ($)</Label>
                <Input
                  id="upload-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="500.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="upload-file">Invoice File</Label>
                <Input
                  id="upload-file"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  required
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button
                type="submit"
                disabled={isUploading}
                className="w-full bg-exxon-red text-white hover:bg-exxon-red-dark"
              >
                {isUploading ? "Uploading..." : "Submit Invoice"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Points balance card — compact with toggle */}
      <Card className="border-exxon-red/20">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-exxon-red/10">
              <Award className="h-6 w-6 text-exxon-red" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{pointsLabel}</p>
              <p className="text-3xl font-bold text-exxon-charcoal">{pointsDisplay}</p>
              <p className="text-xs text-muted-foreground">premium growth points</p>
              <div className="flex gap-1 mt-2">
                {(["current", "monthly", "cumulative"] as const).map((view) => (
                  <button
                    key={view}
                    onClick={() => setPointsView(view)}
                    className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                      pointsView === view
                        ? "bg-exxon-red text-white"
                        : "bg-gray-100 text-muted-foreground hover:bg-gray-200"
                    }`}
                  >
                    {view === "current" ? "Current" : view === "monthly" ? "Monthly" : "All Time"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CTA Buttons */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Button className="bg-exxon-red text-white hover:bg-exxon-red-dark h-auto py-2.5 px-3" onClick={() => setDialogOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Invoice
        </Button>
        <Button variant="outline" className="border-exxon-blue text-exxon-blue hover:bg-exxon-blue/5 h-auto py-2.5 px-3">
          <RefreshCw className="h-4 w-4 mr-2" />
          Sync Oil Change Data
        </Button>
        <Button variant="outline" className="border-exxon-red text-exxon-red hover:bg-exxon-red/5 h-auto py-2.5 px-3" asChild>
          <Link href="/training">
            <GraduationCap className="h-4 w-4 mr-2" />
            Complete Training
          </Link>
        </Button>
        <Button variant="outline" className="border-yellow-500 text-yellow-700 hover:bg-yellow-50 h-auto py-2.5 px-3" asChild>
          <Link href="/dashboard">
            <Eye className="h-4 w-4 mr-2" />
            View Tier Status
          </Link>
        </Button>
      </div>

      {/* How to earn info — compact tiles with Pegasus Status tracker */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Pegasus Status</p>
            <p className="text-xl font-bold text-exxon-red">10 pts</p>
            <p className="text-xs text-muted-foreground">every month in Pegasus Mode</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Performance Points</p>
            <p className="text-xl font-bold text-exxon-blue">1 pt</p>
            <p className="text-xs text-muted-foreground">per Mobil 1 oil change</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Training</p>
            <p className="text-xl font-bold text-exxon-charcoal">10 pts</p>
            <p className="text-xs text-muted-foreground">per training completed</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-200">
          <CardContent className="py-3">
            <div className="flex items-stretch gap-2">
              {/* Bar chart */}
              <div className="flex-1 flex items-end justify-around gap-1 h-28">
                {pegasusMonths.map((m) => {
                  const isPegasus = m.count >= pegasusThreshold;
                  const heightPct = (m.count / pegasusMaxCount) * 100;
                  return (
                    <div key={m.label} className="flex flex-col items-center h-full">
                      <span className="text-sm font-semibold text-exxon-charcoal mb-0.5">
                        {m.count}
                      </span>
                      <div className="flex-1 flex items-end">
                        <div
                          className="w-5 bg-exxon-blue rounded-t-sm"
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                      <div className="h-9 mt-1 flex items-center justify-center">
                        {isPegasus && (
                          <Image
                            src="/Mobil_Pegasus_red_RGB-TM.png"
                            alt="Pegasus Mode"
                            width={32}
                            height={32}
                          />
                        )}
                      </div>
                      <span className="text-sm font-medium text-muted-foreground text-center leading-tight">
                        {m.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* Status indicator */}
              <div className="flex flex-col items-center justify-center border-l pl-2 min-w-[72px]">
                <p className="text-sm font-bold text-exxon-charcoal text-center leading-tight">
                  {inPegasus
                    ? "Achieved!"
                    : `${monthsToGo} month${monthsToGo !== 1 ? "s" : ""} away`}
                </p>
                <p className="text-xs text-muted-foreground mt-1 text-center">Pegasus Status</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Invoices + Points Ledger */}
      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">
            <FileText className="h-4 w-4 mr-1" />
            Invoices
          </TabsTrigger>
          <TabsTrigger value="ledger">
            <BookOpen className="h-4 w-4 mr-1" />
            Points History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <Card>
            <CardHeader>
              <CardTitle>Invoice History</CardTitle>
              <CardDescription>
                All submitted invoices for {activeShop?.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : invoices.length === 0 ? (
                <p className="text-muted-foreground">No invoices submitted yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Submitted By</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
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
                            <Badge variant="outline">Initial</Badge>
                          ) : (
                            "Regular"
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              inv.status === "approved"
                                ? "border-green-500 text-green-700"
                                : inv.status === "rejected"
                                ? "border-red-500 text-red-700"
                                : "border-yellow-500 text-yellow-700"
                            }
                          >
                            {inv.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger">
          <Card>
            <CardHeader>
              <CardTitle>Points History</CardTitle>
              <CardDescription>
                All point transactions for {activeShop?.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : ledger.length === 0 ? (
                <p className="text-muted-foreground">No transactions yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Points</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.map((entry) => (
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
                                ? "border-green-500 text-green-700"
                                : "border-red-500 text-red-700"
                            }
                          >
                            {entry.type}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold ${
                            entry.type === "credit"
                              ? "text-green-700"
                              : "text-red-600"
                          }`}
                        >
                          {entry.type === "credit" ? "+" : "-"}
                          {entry.points_delta}
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

    </div>
  );
}
