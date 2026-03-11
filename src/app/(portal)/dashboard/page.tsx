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
  CalendarDays,
  Droplets,
  CreditCard,
  Percent,
  ArrowRight,
  BookOpen,
  FileText,
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

  const joinDate = activeShop?.created_at
    ? new Date(activeShop.created_at).toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
      })
    : "--";

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
    <div className="space-y-6">
      {/* Hero banner — inspired by Steer M1P+ */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-exxon-charcoal via-exxon-blue to-exxon-charcoal p-6 md:p-8">
        {/* Background M1 logo watermark */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mobil1-logo-white.svg"
          alt=""
          className="absolute right-4 top-1/2 -translate-y-1/2 h-28 md:h-36 opacity-10 pointer-events-none"
        />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mobil1-logo-white.svg" alt="Mobil 1" className="h-8" />
            <span className="text-white/60 text-sm font-medium">Premium Growth</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            Welcome, {activeShop?.name}
          </h1>
          <p className="text-white/70 mt-1 text-sm">
            Earn points on purchases, oil changes, and training to unlock rewards.
          </p>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

        {/* Date joined */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Member Since
            </CardTitle>
            <CalendarDays className="h-5 w-5 text-exxon-gray" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{joinDate}</div>
            <p className="text-xs text-muted-foreground mt-1">
              date joined
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tier progress — inspired by Steer tiers tracker */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Rewards Progress</CardTitle>
            <span className="text-sm text-muted-foreground">
              {currentPoints >= nextTier.threshold
                ? "All tiers unlocked!"
                : `${nextTier.threshold - currentPoints} more points to ${nextTier.name}`}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {/* Progress bar */}
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
        </CardContent>
      </Card>

      {/* Quick redeem section */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-exxon-blue/20 hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                  <CreditCard className="h-6 w-6 text-exxon-blue" />
                </div>
                <div>
                  <p className="font-semibold text-exxon-charcoal">Visa Gift Cards</p>
                  <p className="text-sm text-muted-foreground">
                    Redeem points for $25, $50, or $100 Visa cards
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/rewards">
                  Redeem
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-exxon-blue/20 hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                  <Percent className="h-6 w-6 text-exxon-blue" />
                </div>
                <div>
                  <p className="font-semibold text-exxon-charcoal">Steer CRM Discount</p>
                  <p className="text-sm text-muted-foreground">
                    Exclusive 20% off for Premium Growth members
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/rewards?tab=partner">
                  Claim
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resources & Tips — inspired by Steer */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-exxon-charcoal">Resources & Tips</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                  <BookOpen className="h-6 w-6 text-exxon-blue" />
                </div>
                <div>
                  <p className="font-semibold text-exxon-charcoal">
                    Complete Your Mobil 1 Training
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Earn 10 points per module and become a certified Mobil 1 expert.
                  </p>
                  <Link
                    href="/training"
                    className="text-sm font-medium text-exxon-red hover:underline mt-2 inline-flex items-center"
                  >
                    Start Training
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                  <FileText className="h-6 w-6 text-exxon-blue" />
                </div>
                <div>
                  <p className="font-semibold text-exxon-charcoal">
                    Upload Invoices to Earn Points
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Get 15% back on Mobil 1 purchases of $2,500+. Submit your invoices to earn.
                  </p>
                  <Link
                    href="/earn"
                    className="text-sm font-medium text-exxon-red hover:underline mt-2 inline-flex items-center"
                  >
                    Upload Invoice
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* M1 branding footer */}
      <div className="flex justify-center pt-4 opacity-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mobil1-logo-stacked.svg" alt="" className="h-40" />
      </div>
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
