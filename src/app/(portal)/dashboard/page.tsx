"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { useShop } from "@/context/shop-context";
import { useEnrollmentGuard } from "@/hooks/use-enrollment-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Award, FileText, GraduationCap, Store, ClipboardCheck, Upload } from "lucide-react";

export default function DashboardPage() {
  const { isAdmin } = useAuth();

  if (isAdmin) {
    return <AdminDashboard />;
  }

  return <ShopDashboard />;
}

function ShopDashboard() {
  const { activeShop } = useShop();
  const { isApproved, isLoading } = useEnrollmentGuard();
  const [invoiceCount, setInvoiceCount] = useState<number | null>(null);
  const [trainingCount, setTrainingCount] = useState<number | null>(null);

  const fetchStats = useCallback(async () => {
    if (!activeShop) return;

    const [invoicesRes, trainingRes] = await Promise.all([
      fetch(`/api/invoices?shop_id=${activeShop.id}`),
      fetch("/api/training"),
    ]);

    const invoicesData = await invoicesRes.json();
    setInvoiceCount(invoicesData.data?.length ?? 0);

    const trainingData = await trainingRes.json();
    // Count modules that have been completed (have completedAt)
    const completed = (trainingData.data || []).filter(
      (m: { completedAt?: string | null }) => m.completedAt
    ).length;
    setTrainingCount(completed);
  }, [activeShop]);

  useEffect(() => {
    if (isApproved) fetchStats();
  }, [isApproved, fetchStats]);

  if (isLoading || !isApproved) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-exxon-charcoal">
        Welcome, {activeShop?.name}
      </h1>
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Loyalty Points
            </CardTitle>
            <Award className="h-5 w-5 text-exxon-red" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {activeShop?.loyalty_points_balance || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              points available
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Invoices
            </CardTitle>
            <FileText className="h-5 w-5 text-exxon-blue" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {invoiceCount !== null ? invoiceCount : "--"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              total submitted
            </p>
          </CardContent>
        </Card>
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
        Loyalty Dashboard
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
