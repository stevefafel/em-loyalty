"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { useShop } from "@/context/shop-context";
import { useEnrollmentGuard } from "@/hooks/use-enrollment-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Image from "next/image";
import {
  Award,
  GraduationCap,
  Store,
  ClipboardCheck,
  Upload,
  Droplets,
  Gift,
  ShoppingCart,
  Check,
  AlertTriangle,
} from "lucide-react";
import {
  ATTENTION_POINTS_THRESHOLD,
  ATTENTION_STREAK_MONTHS,
} from "@/lib/constants";
import type { LoyaltyLedgerEntry, OilChangeCount } from "@/types/database";
import {
  PEGASUS_THRESHOLD,
  aggregateOilChangesByMonth,
  computePegasusStatus,
} from "@/lib/pegasus";
import { stockUpPromotionBenefit, stockUpPromotionCount } from "@/lib/stock-up";

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
  const [oilChanges, setOilChanges] = useState<OilChangeCount[]>([]);
  const [stockUpCount, setStockUpCount] = useState(0);
  const [stockUpBenefit, setStockUpBenefit] = useState(0);
  const [pointsView, setPointsView] = useState<PointsView>("current");

  const fetchStats = useCallback(async () => {
    if (!activeShop) return;

    const [trainingRes, ledgerRes, oilChangesRes, invoicesRes] = await Promise.all([
      fetch("/api/training"),
      fetch(`/api/points?shop_id=${activeShop.id}`),
      fetch(`/api/oil-changes?shop_id=${activeShop.id}`),
      fetch(`/api/invoices?shop_id=${activeShop.id}`),
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

    if (oilChangesRes.ok) {
      const oilChangesData = await oilChangesRes.json();
      setOilChanges(oilChangesData.data || []);
    }

    if (invoicesRes.ok) {
      const invoicesData = await invoicesRes.json();
      const invoices = invoicesData.data || [];
      setStockUpCount(stockUpPromotionCount(invoices));
      setStockUpBenefit(stockUpPromotionBenefit(invoices));
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

  // Pegasus status: 3 consecutive months of 25+ oil changes
  const pegasusBuckets = aggregateOilChangesByMonth(oilChanges, 3, now);
  const oilChangeMonths = pegasusBuckets.map((b) => ({
    label: b.isCurrent
      ? "Current Month"
      : b.monthStart.toLocaleDateString("en-US", { month: "long" }),
    count: b.count,
  }));
  const pegasusThreshold = PEGASUS_THRESHOLD;
  const { inPegasus, consecutive } = computePegasusStatus(pegasusBuckets);
  const currentMonthOilChanges =
    pegasusBuckets.find((b) => b.isCurrent)?.count ?? 0;
  const pegasusBarMax = Math.max(
    ...oilChangeMonths.map((m) => m.count),
    pegasusThreshold
  );
  const gaugePct = Math.min((currentMonthOilChanges / 50) * 100, 100);

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
              Earn points on oil changes, training, and Pegasus Status to unlock rewards.
            </p>
          </div>
          {/* Right half — interchangeable banner image (hidden until upload is implemented) */}
        </div>
      </div>

      {/* CTA Buttons row */}
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-3">
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
        <Button asChild variant="outline" className="border-exxon-red text-exxon-red hover:bg-exxon-red/5 h-auto py-2 px-3">
          <Link href="/training" className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            <span className="font-semibold">Complete Training</span>
          </Link>
        </Button>
      </div>

      {/* Stat tiles — 5 tiles: Stock-Up count + benefit, then PG points, Oil changes, Training */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* Stock-Up Promotion Count — approved invoice uploads */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Stock-Up Promotion Count
            </CardTitle>
            <ShoppingCart className="h-5 w-5 text-exxon-red" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stockUpCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">approved invoices</p>
          </CardContent>
        </Card>

        {/* Stock-Up Promotion Benefit — whole $500 units across approved invoices */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Stock-Up Promotion Benefit
            </CardTitle>
            <ShoppingCart className="h-5 w-5 text-exxon-blue" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stockUpBenefit}
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
            <div className="text-3xl font-bold">{currentMonthOilChanges}</div>
            <p className="text-xs text-muted-foreground mt-1">this month</p>
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
          <CardTitle className="text-lg font-bold">Pegasus Status Tracker</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.75fr_0.5fr_0.75fr] gap-6 lg:gap-0 lg:divide-x divide-gray-200 lg:items-stretch">
            {/* Current-month gauge */}
            <div className="flex flex-col items-center justify-start text-center lg:px-6 w-full">
              <p className="text-sm font-bold text-exxon-charcoal leading-tight">
                Mobil 1 Oil Changes
              </p>
              <p className="text-sm font-bold text-exxon-charcoal leading-tight">
                (Current Month)
              </p>
              <div className="mt-16 relative w-full max-w-[200px]">
                <span
                  className="absolute -top-8 -translate-x-1/2 text-base font-bold text-exxon-charcoal"
                  style={{ left: `${gaugePct}%` }}
                >
                  {currentMonthOilChanges}
                </span>
                <div className="relative h-2 bg-gray-200 rounded-full">
                  <div
                    className="h-full bg-exxon-blue rounded-full transition-all"
                    style={{ width: `${gaugePct}%` }}
                  />
                  <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-0.5 h-5 bg-exxon-blue" />
                </div>
                <div className="flex justify-between text-xs font-semibold text-exxon-charcoal mt-2">
                  <span>Start</span>
                  <span>25</span>
                  <span>50+</span>
                </div>
                <p className="text-center text-sm font-bold text-exxon-charcoal mt-2">
                  Pegasus Mode
                </p>
              </div>
            </div>

            {/* Bar chart — 3 months */}
            <div className="flex flex-col justify-center mx-auto w-full lg:px-6">
              <div className="flex items-end justify-around gap-3 h-44 px-4 border-b-2 border-exxon-blue">
                {oilChangeMonths.map((m) => {
                  const heightPct = (m.count / pegasusBarMax) * 100;
                  return (
                    <div key={m.label} className="flex flex-col items-center h-full">
                      <span className="text-base font-semibold text-exxon-charcoal mb-1">
                        {m.count}
                      </span>
                      <div className="flex-1 flex items-end">
                        <div
                          className="w-12 bg-exxon-blue"
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-around gap-3 px-4 mt-2">
                {oilChangeMonths.map((m) => {
                  const isPegasus = m.count >= pegasusThreshold;
                  return (
                    <div key={m.label} className="flex flex-col items-center w-24">
                      <div className="h-10 flex items-center justify-center">
                        {isPegasus && (
                          <Image
                            src="/Mobil_Pegasus_red_RGB-TM.png"
                            alt="Pegasus Mode"
                            width={36}
                            height={36}
                          />
                        )}
                      </div>
                      <div className="border-t-2 border-exxon-charcoal w-full" />
                      <span className="text-sm font-bold text-exxon-charcoal mt-1 text-center leading-tight">
                        {m.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Big Pegasus Status icon with progress indicator */}
            <div className="flex flex-col items-center justify-center lg:px-6">
              {inPegasus && (
                <div className="flex flex-col items-center mb-4">
                  <span className="text-sm font-semibold text-green-700 text-center leading-tight">
                    Pegasus Mode Enabled
                  </span>
                  <div className="bg-green-500 rounded-full p-1 shadow-md ring-2 ring-white mt-1">
                    <Check className="h-4 w-4 text-white" strokeWidth={3} />
                  </div>
                </div>
              )}
              <div className="relative">
                <Image
                  src="/Mobil_Pegasus_red_RGB-TM.png"
                  alt="Pegasus Status"
                  width={80}
                  height={80}
                />
              </div>
              <div className="border-t-2 border-exxon-charcoal w-24 mt-2" />
              <span className="text-sm font-bold text-exxon-charcoal mt-1 text-center leading-tight">
                Pegasus<br />Status
              </span>
              <div className="flex gap-1.5 mt-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`h-2 w-6 rounded-full transition-colors ${
                      i < consecutive ? "bg-exxon-red" : "bg-gray-200"
                    }`}
                  />
                ))}
              </div>
              <span
                className={`text-xs font-semibold mt-1.5 ${
                  inPegasus ? "text-green-700" : "text-muted-foreground"
                }`}
              >
                {inPegasus ? "3 months in a row!" : `${consecutive} of 3 months`}
              </span>
            </div>

            {/* Legend */}
            <div className="flex flex-col justify-center lg:px-6 w-full">
              <div className="flex items-start gap-3">
                <Image
                  src="/Mobil_Pegasus_red_RGB-TM.png"
                  alt=""
                  width={36}
                  height={36}
                  className="shrink-0"
                />
                <div className="text-sm text-exxon-charcoal leading-snug">
                  <p className="font-bold">Pegasus Status</p>
                  <p className="text-muted-foreground">
                    3 months in a row of Pegasus Mode*
                  </p>
                </div>
              </div>
              <div className="my-3 border-t border-gray-200" />
              <div className="flex items-start gap-3">
                <Image
                  src="/Mobil_Pegasus_red_RGB-TM.png"
                  alt=""
                  width={24}
                  height={24}
                  className="shrink-0 mt-1"
                />
                <div className="text-sm text-exxon-charcoal leading-snug">
                  <p className="font-bold">Pegasus Mode</p>
                  <p className="text-muted-foreground">
                    25+ oil changes in 1 month
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="text-sm text-exxon-charcoal mt-6">
            Shops will receive a 10 point bonus each month they maintain{" "}
            <span className="font-bold">Pegasus Status</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

interface AttentionShop {
  id: string;
  name: string;
  program_status: string;
  loyalty_points_balance: number;
  monthlyCounts: number[];
  reasons: string[];
}

interface AttentionData {
  months: string[];
  shops: AttentionShop[];
}

function AdminDashboard() {
  const [totalShops, setTotalShops] = useState<number | null>(null);
  const [pendingInvoices, setPendingInvoices] = useState<number | null>(null);
  const [pendingEnrollments, setPendingEnrollments] = useState<number | null>(null);
  const [attention, setAttention] = useState<AttentionData | null>(null);

  const fetchStats = useCallback(async () => {
    const [shopsRes, invoicesRes, attentionRes] = await Promise.all([
      fetch("/api/shops"),
      fetch("/api/invoices"),
      fetch("/api/shops/attention"),
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

    if (attentionRes.ok) {
      const attentionData = await attentionRes.json();
      setAttention(attentionData.data || null);
    }
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
            <ClipboardCheck className="h-5 w-5 text-yellow-700" />
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
            <Upload className="h-5 w-5 text-yellow-700" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {pendingEnrollments !== null ? pendingEnrollments : "--"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-lg font-bold">
              Shops that Require Attention
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Awaiting program approval, balance above{" "}
              {ATTENTION_POINTS_THRESHOLD} points, {PEGASUS_THRESHOLD}+ oil
              changes in each of the previous {ATTENTION_STREAK_MONTHS} months,
              or approved without a welcome packet sent.
            </p>
          </div>
          <AlertTriangle className="h-5 w-5 text-yellow-700" />
        </CardHeader>
        <CardContent>
          {attention === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : attention.shops.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No shops currently require attention.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shop</TableHead>
                  <TableHead className="text-right">Points Balance</TableHead>
                  {attention.months.map((month) => (
                    <TableHead key={month} className="text-right">
                      {month} Oil Changes
                    </TableHead>
                  ))}
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attention.shops.map((shop) => (
                  <TableRow key={shop.id}>
                    <TableCell>
                      <Link
                        href={`/admin/shops/${shop.id}`}
                        className="font-medium text-exxon-blue hover:underline"
                      >
                        {shop.name}
                      </Link>
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
                        shop.loyalty_points_balance > ATTENTION_POINTS_THRESHOLD
                          ? "text-exxon-red"
                          : ""
                      }`}
                    >
                      {shop.loyalty_points_balance}
                    </TableCell>
                    {shop.monthlyCounts.map((count, i) => (
                      <TableCell
                        key={attention.months[i]}
                        className={`text-right ${
                          count >= PEGASUS_THRESHOLD
                            ? "font-semibold text-green-700"
                            : "text-muted-foreground"
                        }`}
                      >
                        {count}
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {shop.reasons.includes("awaiting_approval") && (
                          <Badge className="bg-yellow-500 text-white hover:bg-yellow-500">
                            Awaiting program approval
                          </Badge>
                        )}
                        {shop.reasons.includes("high_balance") && (
                          <Badge
                            variant="outline"
                            className="border-exxon-red text-exxon-red"
                          >
                            High point balance
                          </Badge>
                        )}
                        {shop.reasons.includes("oil_change_streak") && (
                          <Badge
                            variant="outline"
                            className="border-green-600 text-green-700"
                          >
                            {PEGASUS_THRESHOLD}+ oil changes,{" "}
                            {ATTENTION_STREAK_MONTHS} months straight
                          </Badge>
                        )}
                        {shop.reasons.includes("no_welcome_packet") && (
                          <Badge
                            variant="outline"
                            className="border-yellow-600 text-yellow-700"
                          >
                            Welcome packet not sent
                          </Badge>
                        )}
                      </div>
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
