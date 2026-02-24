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
import { uploadInvoice } from "@/lib/supabase/storage";
import { formatCurrency } from "@/lib/utils";
import type { Invoice } from "@/types/database";
import { Plus } from "lucide-react";

export default function InvoicesPage() {
  const { activeShop } = useShop();
  const { isApproved, isLoading: guardLoading } = useEnrollmentGuard();
  const [invoices, setInvoices] = useState<(Invoice & { users: { name: string } })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  const fetchInvoices = useCallback(async () => {
    if (!activeShop) return;
    const res = await fetch(`/api/invoices?shop_id=${activeShop.id}`);
    const { data } = await res.json();
    setInvoices(data || []);
    setIsLoading(false);
  }, [activeShop]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  if (guardLoading || !isApproved) return null;

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
    fetchInvoices();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-exxon-charcoal">Invoices</h1>
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
                Submit a Mobil 1 purchase invoice to earn loyalty points.
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
    </div>
  );
}
