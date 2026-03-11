"use client";

import { useState, useEffect, useCallback } from "react";
import { useEnrollmentGuard } from "@/hooks/use-enrollment-guard";
import { useAuth } from "@/context/auth-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import type { Collateral } from "@/types/database";

export default function CollateralPage() {
  const { isAdmin } = useAuth();
  const { isApproved, isLoading: guardLoading } = useEnrollmentGuard();
  const [collateral, setCollateral] = useState<Collateral[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCollateral = useCallback(async () => {
    const res = await fetch("/api/collateral");
    const { data } = await res.json();
    setCollateral(data || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchCollateral();
  }, [fetchCollateral]);

  if (!isAdmin && (guardLoading || !isApproved)) return null;

  const handleDownload = async (item: Collateral) => {
    // Log the download
    await fetch(`/api/collateral/${item.id}/download`, {
      method: "POST",
    });

    toast.success("Download started", {
      description: `${item.title} download has been logged.`,
    });
  };

  // Group by category
  const grouped = collateral.reduce<Record<string, Collateral[]>>(
    (acc, item) => {
      const cat = item.category || "Uncategorized";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-exxon-charcoal">
        Marketing Materials
      </h1>
      <p className="text-muted-foreground">
        Download flyers, posters, and POS materials to promote Mobil 1 in your shop.
      </p>

      {/* Branded callout */}
      <Card className="border-exxon-blue/20 bg-gradient-to-r from-blue-50 to-white">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-exxon-blue/10">
              <FileText className="h-5 w-5 text-exxon-blue" />
            </div>
            <div>
              <p className="font-semibold text-exxon-charcoal">Premium Growth Marketing</p>
              <p className="text-sm text-muted-foreground">
                Use these materials to drive Mobil 1 awareness and boost your sales performance.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="space-y-4">
            <h2 className="text-xl font-semibold text-exxon-charcoal">
              {category}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <Card key={item.id}>
                  <CardHeader>
                    <div className="flex h-20 items-center justify-center rounded-lg bg-gray-100">
                      <FileText className="h-8 w-8 text-exxon-gray-light" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{item.category}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(item)}
                        className="text-exxon-blue border-exxon-blue hover:bg-exxon-blue/5"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      {/* M1 branding footer */}
      <div className="flex justify-center pt-4 opacity-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mobil1-logo-stacked.svg" alt="" className="h-24" />
      </div>
    </div>
  );
}
