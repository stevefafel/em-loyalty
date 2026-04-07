"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { useShop } from "@/context/shop-context";
import { useEnrollmentGuard } from "@/hooks/use-enrollment-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import {
  Award,
  GraduationCap,
  Store,
  ClipboardCheck,
  Upload,
  Droplets,
  Gift,
  RefreshCw,
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

  // Mock oil change data for last 3 months + current month
  const mockOilChanges: { label: string; count: number }[] = [];
  for (let i = 3; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    mockOilChanges.push({
      label: d.toLocaleDateString("en-US", { month: "short" }),
      count: i === 3 ? 30 : i === 2 ? 15 : i === 1 ? 28 : 12, // mock data
    });
  }

  // Pegasus status: 3 consecutive months of 25+ oil changes
  const pegasusThreshold = 25;
  let consecutivePegasusMonths = 0;
  for (let i = mockOilChanges.length - 1; i >= 0; i--) {
    if (mockOilChanges[i].count >= pegasusThreshold) {
      consecutivePegasusMonths++;
    } else {
      break;
    }
  }
  const inPegasus = consecutivePegasusMonths >= 3;
  const monthsToGo = inPegasus ? 0 : 3 - consecutivePegasusMonths;

  return (
    <div className="space-y-4">
      {/* Hero banner — split in half: text left, image right */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-exxon-charcoal via-exxon-blue to-exxon-charcoal">
        <div className="grid md:grid-cols-2">
          {/* Left half — text content */}
          <div className="relative z-10 p-5 md:p-6 flex flex-col justify-center">
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              Welcome,<br />
              <span className="whitespace-nowrap">{activeShop?.name}</span>
            </h1>
            <p className="text-white/80 text-sm font-semibold mt-2 uppercase tracking-wider">
              Premium Growth
            </p>
            <p className="text-white/70 mt-2 text-xs">
              Earn points on purchases, oil changes, and training to unlock rewards.
            </p>
          </div>
          {/* Right half — interchangeable banner image (hidden until upload is implemented) */}
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
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl font-bold">{pointsDisplay}</div>
                <p className="text-xs text-muted-foreground mt-1">{pointsLabel}</p>
              </div>
              <div className="flex flex-col gap-1">
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

      {/* Pegasus Status Tracker */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-bold">Pegasus Status Tracker</CardTitle>
            </div>
            <span className="text-base font-semibold text-muted-foreground">
              {inPegasus
                ? "Pegasus Status achieved!"
                : `${monthsToGo} more month${monthsToGo !== 1 ? "s" : ""} to Pegasus Status`}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center px-8">
            {mockOilChanges.map((m, idx) => {
              const isPegasus = m.count >= pegasusThreshold;
              return (
                <div key={m.label} className="flex items-center">
                  {/* Connector line before (except first) */}
                  {idx > 0 && (
                    <div className="w-16 md:w-24 h-1 bg-gradient-to-r from-gray-300 to-gray-400 rounded-full" />
                  )}
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-base font-semibold text-exxon-charcoal">
                      {m.count} oil changes
                    </span>
                    <div className="w-20 h-20 rounded-full flex items-center justify-center bg-exxon-charcoal ring-4 ring-gray-200">
                      {isPegasus && (
                        <Image
                          src="/Mobil_Pegasus_red_RGB-TM.png"
                          alt="Pegasus Mode"
                          width={64}
                          height={64}
                        />
                      )}
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">{m.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-8 mt-5 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-exxon-charcoal" />
              <span>Under 25 oil changes</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-exxon-charcoal flex items-center justify-center">
                <Image src="/Mobil_Pegasus_red_RGB-TM.png" alt="" width={14} height={14} />
              </div>
              <span>Pegasus Mode</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4 italic text-center">
            3 consecutive Pegasus months = Pegasus Status (+10 pts/month)
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
