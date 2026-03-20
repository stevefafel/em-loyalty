"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { useShop } from "@/context/shop-context";
import { useEnrollmentGuard } from "@/hooks/use-enrollment-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Award,
  GraduationCap,
  Store,
  ClipboardCheck,
  Upload,
  Droplets,
  Gift,
  RefreshCw,
  Star,
  ShoppingCart,
} from "lucide-react";
import type { LoyaltyLedgerEntry } from "@/types/database";

export default function DashboardPage() {
  const { isAdmin } = useAuth();

  if (isAdmin) {
    return <AdminDashboard />;
  }

  return <ShopDashboard />;
}

type PointsView = "current" | "monthly" | "cumulative";

function ShopDashboard() {
  const { activeShop } = useShop();
  const { isApproved, isLoading } = useEnrollmentGuard();
  const [trainingCount, setTrainingCount] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LoyaltyLedgerEntry[]>([]);
  const [pointsView, setPointsView] = useState<PointsView>("current");

  const fetchStats = useCallback(async () => {
    if (!activeShop) return;

    const [trainingRes, ledgerRes] = await Promise.all([
      fetch("/api/training"),
      fetch(`/api/points?shop_id=${activeShop.id}`),
    ]);

    if (trainingRes.ok) {
      const trainingData = await trainingRes.json();
      const completed = (trainingData.data || []).filter(
        (m: { completedAt?: string | null }) => m.completedAt
      ).length;
      setTrainingCount(completed);
    }

    if (ledgerRes.ok) {
      const ledgerData = await ledgerRes.json();
      setLedger(ledgerData.data || []);
    }
  }, [activeShop]);

  useEffect(() => {
    if (isApproved) fetchStats();
  }, [isApproved, fetchStats]);

  if (isLoading || !isApproved) return null;

  // Calculate points views
  const currentPoints = activeShop?.loyalty_points_balance || 0;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyEarned = ledger
    .filter((e) => e.type === "credit" && new Date(e.created_at) >= monthStart)
    .reduce((sum, e) => sum + e.points_delta, 0);

  const cumulativeEarned = ledger
    .filter((e) => e.type === "credit")
    .reduce((sum, e) => sum + e.points_delta, 0);

  const pointsDisplay =
    pointsView === "current"
      ? currentPoints
      : pointsView === "monthly"
      ? monthlyEarned
      : cumulativeEarned;

  const pointsLabel =
    pointsView === "current"
      ? "current balance"
      : pointsView === "monthly"
      ? "earned this month"
      : "total earned all time";

  // Reward tiers based on cumulative points
  const tiers = [
    { name: "Tier 1", threshold: 250, reward: "$25 Visa" },
    { name: "Tier 2", threshold: 500, reward: "$50 Visa" },
    { name: "Tier 3", threshold: 1000, reward: "$100 Visa" },
  ];

  // Find current tier progress
  const nextTier = tiers.find((t) => currentPoints < t.threshold) || tiers[tiers.length - 1];
  const prevThreshold = tiers[tiers.indexOf(nextTier) - 1]?.threshold || 0;
  const progressPercent =
    currentPoints >= nextTier.threshold
      ? 100
      : Math.round(
          ((currentPoints - prevThreshold) / (nextTier.threshold - prevThreshold)) * 100
        );

  return (
    <div className="space-y-4">
      {/* Hero banner — split in half: text left, image right */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-exxon-charcoal via-exxon-blue to-exxon-charcoal">
        <div className="grid md:grid-cols-2">
          {/* Left half — text content */}
          <div className="relative z-10 p-5 md:p-6 flex flex-col justify-center">
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              Welcome, {activeShop?.name}
            </h1>
            <p className="text-white/80 text-sm font-semibold mt-2 uppercase tracking-wider">
              Premium Growth
            </p>
            <p className="text-white/70 mt-2 text-sm">
              Earn points on purchases, oil changes, and training to unlock rewards.
            </p>
          </div>
          {/* Right half — interchangeable banner image */}
          <div className="hidden md:flex items-center justify-center p-4 bg-white/5">
            <div className="w-full h-24 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center">
              <span className="text-white/40 text-sm">Banner Image</span>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Buttons row */}
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        <Button asChild className="bg-exxon-red text-white hover:bg-exxon-red-dark h-auto py-2 px-3">
          <Link href="/earn" className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            <span className="font-semibold">Upload Invoice</span>
          </Link>
        </Button>
        <Button asChild className="bg-exxon-blue text-white hover:bg-exxon-blue/90 h-auto py-2 px-3">
          <Link href="/rewards" className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            <span className="font-semibold">Redeem Points</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="border-exxon-blue text-exxon-blue hover:bg-exxon-blue/5 h-auto py-2 px-3">
          <Link href="/earn" className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            <span className="font-semibold">Sync Oil Change Data</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="border-exxon-red text-exxon-red hover:bg-exxon-red/5 h-auto py-2 px-3">
          <Link href="/training" className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            <span className="font-semibold">Complete Training</span>
          </Link>
        </Button>
      </div>

      {/* Stat tiles — 4 tiles: Stock-up on far left, then PG points, Oil changes, Training */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Stock-up Promotions (cumulative) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Stock-Up Promotions
            </CardTitle>
            <ShoppingCart className="h-5 w-5 text-exxon-red" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {ledger.filter((e) => e.type === "credit" && e.description?.toLowerCase().includes("invoice")).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">cumulative earned</p>
          </CardContent>
        </Card>

        {/* Points tracker with toggle */}
        <Card className="border-exxon-red/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Premium Growth Points
            </CardTitle>
            <Award className="h-5 w-5 text-exxon-red" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{pointsDisplay}</div>
            <p className="text-xs text-muted-foreground mt-1">{pointsLabel}</p>
            <div className="flex gap-1 mt-3">
              {(["current", "monthly", "cumulative"] as PointsView[]).map((view) => (
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
          </CardContent>
        </Card>

        {/* Oil change tracker */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              M1 Oil Changes
            </CardTitle>
            <Droplets className="h-5 w-5 text-exxon-blue" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">--</div>
            <p className="text-xs text-muted-foreground mt-1">this month</p>
            <p className="text-xs text-muted-foreground mt-1 italic">
              Data imported from external source
            </p>
          </CardContent>
        </Card>

        {/* Training completed */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Training
            </CardTitle>
            <GraduationCap className="h-5 w-5 text-exxon-blue" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {trainingCount !== null ? trainingCount : "--"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              modules completed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Month-over-month points bar chart (last 3 months) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Points Earned (Last 3 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4 h-24">
            {(() => {
              const months: { label: string; earned: number }[] = [];
              for (let i = 2; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
                const earned = ledger
                  .filter(
                    (e) =>
                      e.type === "credit" &&
                      new Date(e.created_at) >= d &&
                      new Date(e.created_at) <= end
                  )
                  .reduce((sum, e) => sum + e.points_delta, 0);
                months.push({
                  label: d.toLocaleDateString("en-US", { month: "short" }),
                  earned,
                });
              }
              const maxVal = Math.max(...months.map((m) => m.earned), 1);
              return months.map((m) => (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-semibold text-exxon-charcoal">
                    {m.earned}
                  </span>
                  <div className="w-full flex justify-center">
                    <div
                      className="w-10 rounded-t bg-gradient-to-t from-exxon-red to-exxon-blue transition-all duration-500"
                      style={{
                        height: `${Math.max((m.earned / maxVal) * 100, 4)}px`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{m.label}</span>
                </div>
              ));
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Gold Status Tracker */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              <CardTitle className="text-base">Gold Status Tracker</CardTitle>
            </div>
            <span className="text-sm text-muted-foreground">
              {currentPoints >= nextTier.threshold
                ? "All tiers unlocked!"
                : `${nextTier.threshold - currentPoints} more points to ${nextTier.name}`}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left side — Monthly progress tracker + progress bar */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Points Progress</p>
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold bg-exxon-red text-white px-2 py-0.5 rounded">
                    START
                  </span>
                  {tiers.map((tier) => (
                    <span
                      key={tier.name}
                      className={`text-xs font-medium ${
                        currentPoints >= tier.threshold
                          ? "text-exxon-blue"
                          : "text-muted-foreground"
                      }`}
                    >
                      {tier.name}
                    </span>
                  ))}
                </div>
                <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-exxon-red to-exxon-blue rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(progressPercent, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground">0 pts</span>
                  {tiers.map((tier) => (
                    <div key={tier.name} className="text-center">
                      <div
                        className={`text-xs font-semibold ${
                          currentPoints >= tier.threshold
                            ? "text-exxon-blue"
                            : "text-muted-foreground"
                        }`}
                      >
                        {tier.threshold}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{tier.reward}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right side — Gold Stars streak tracker */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Gold Stars (25+ Oil Changes/Month)</p>
              <div className="flex items-center gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <Star
                      className={`h-10 w-10 ${
                        i < 0 /* placeholder: no real oil change data yet */
                          ? "text-yellow-400 fill-yellow-400"
                          : "text-gray-200 fill-gray-100"
                      }`}
                    />
                    <span className="text-[10px] text-muted-foreground">Month {i + 1}</span>
                  </div>
                ))}
                <div className="ml-2 pl-3 border-l border-gray-200">
                  <div className="flex items-center gap-1.5">
                    <Star className="h-5 w-5 text-gray-200 fill-gray-100" />
                    <span className="text-sm font-semibold text-muted-foreground">Not in Gold</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    3 stars in a row = Gold Status (+10 pts/month)
                  </p>
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4 italic">
            Earn Gold Status by completing 3 consecutive months of 25+ oil changes. Gold shops earn an extra 10 points every month they maintain Gold.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminDashboard() {
  const [totalShops, setTotalShops] = useState<number | null>(null);
  const [pendingInvoices, setPendingInvoices] = useState<number | null>(null);
  const [pendingEnrollments, setPendingEnrollments] = useState<number | null>(null);

  const fetchStats = useCallback(async () => {
    const [shopsRes, invoicesRes] = await Promise.all([
      fetch("/api/shops"),
      fetch("/api/invoices"),
    ]);

    const shopsData = await shopsRes.json();
    const shops = shopsData.data || [];
    setTotalShops(shops.length);
    setPendingEnrollments(
      shops.filter((s: { program_status: string }) => s.program_status === "pending").length
    );

    const invoicesData = await invoicesRes.json();
    const invoices = invoicesData.data || [];
    setPendingInvoices(
      invoices.filter((i: { status: string }) => i.status === "pending").length
    );
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-exxon-charcoal">
        Premium Growth Dashboard
      </h1>
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Shops
            </CardTitle>
            <Store className="h-5 w-5 text-exxon-blue" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {totalShops !== null ? totalShops : "--"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Invoices
            </CardTitle>
            <ClipboardCheck className="h-5 w-5 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {pendingInvoices !== null ? pendingInvoices : "--"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Enrollments
            </CardTitle>
            <Upload className="h-5 w-5 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {pendingEnrollments !== null ? pendingEnrollments : "--"}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
