"use client";

import { useState } from "react";
import { useShop } from "@/context/shop-context";
import { useRouter } from "next/navigation";
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
import { uploadInvoice } from "@/lib/supabase/storage";
import { formatCurrency } from "@/lib/utils";
import { MIN_INITIAL_INVOICE } from "@/lib/constants";
import { Upload, Clock, CheckCircle, XCircle } from "lucide-react";

export default function EnrollmentPage() {
  const { activeShop } = useShop();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  if (!activeShop) return null;

  if (activeShop.program_status === "approved") {
    router.replace("/dashboard");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!file) {
      setError("Please select a file");
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < MIN_INITIAL_INVOICE) {
      setError(`Invoice amount must be at least ${formatCurrency(MIN_INITIAL_INVOICE)}`);
      return;
    }

    setIsUploading(true);

    const { path, error: uploadError } = await uploadInvoice(
      activeShop.id,
      file
    );

    if (uploadError) {
      setError("Failed to upload file. Please try again.");
      setIsUploading(false);
      return;
    }

    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopId: activeShop.id,
        amount: amountNum,
        isInitial: true,
        filePath: path,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to submit invoice");
      setIsUploading(false);
      return;
    }

    // Trigger AI extraction (fire-and-forget)
    const { data: newInvoice } = await res.json();
    if (newInvoice?.id) {
      fetch(`/api/invoices/${newInvoice.id}/extract`, { method: "POST" });
    }

    router.refresh();
  };

  if (activeShop.program_status === "pending") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <Clock className="h-16 w-16 text-yellow-500" />
            </div>
            <CardTitle className="text-2xl">Application Under Review</CardTitle>
            <CardDescription>
              Your initial invoice has been submitted. An admin will review and
              approve your enrollment shortly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="border-yellow-500 text-yellow-700">
              Pending Review
            </Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activeShop.program_status === "rejected") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <XCircle className="h-16 w-16 text-red-500" />
            </div>
            <CardTitle className="text-2xl">Application Rejected</CardTitle>
            <CardDescription>
              Unfortunately your enrollment was not approved. Please contact
              support or submit a new qualifying invoice.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Status is "new" — show the upload form
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Upload className="h-12 w-12 text-exxon-red" />
          </div>
          <CardTitle className="text-2xl">Enroll in the Premium Growth Program</CardTitle>
          <CardDescription>
            Submit an initial invoice of at least{" "}
            <strong>{formatCurrency(MIN_INITIAL_INVOICE)}</strong> to qualify
            for the Mobil 1 Premium Growth Program.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="amount">Invoice Amount ($)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min={MIN_INITIAL_INVOICE}
                placeholder="2500.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="file">Invoice File (PDF)</Label>
              <Input
                id="file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            <Button
              type="submit"
              disabled={isUploading}
              className="w-full bg-exxon-red text-white hover:bg-exxon-red-dark"
            >
              {isUploading ? "Submitting..." : "Submit Initial Invoice"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
