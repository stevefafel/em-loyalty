"use client";

import { useState, useEffect, useCallback } from "react";
import { useShop } from "@/context/shop-context";
import { useEnrollmentGuard } from "@/hooks/use-enrollment-guard";
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
import { Award } from "lucide-react";
import type { LoyaltyLedgerEntry } from "@/types/database";

export default function PointsPage() {
  const { activeShop } = useShop();
  const { isApproved, isLoading: guardLoading } = useEnrollmentGuard();
  const [ledger, setLedger] = useState<LoyaltyLedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLedger = useCallback(async () => {
    if (!activeShop) return;
    const res = await fetch(`/api/points?shop_id=${activeShop.id}`);
    const { data } = await res.json();
    setLedger(data || []);
    setIsLoading(false);
  }, [activeShop]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  if (guardLoading || !isApproved) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-exxon-charcoal">
        Points & Rewards
      </h1>

      <Card className="border-exxon-red/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-exxon-red/10">
              <Award className="h-8 w-8 text-exxon-red" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Balance</p>
              <p className="text-4xl font-bold text-exxon-charcoal">
                {activeShop?.loyalty_points_balance || 0}
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
                          ? "text-green-600"
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
    </div>
  );
}
