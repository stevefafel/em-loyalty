"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2 } from "lucide-react";
import type { Shop, OilChangeCount } from "@/types/database";

export default function AdminOilChangesPage() {
  const { isAdmin } = useAuth();

  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>("");
  const [entries, setEntries] = useState<OilChangeCount[]>([]);
  const [isLoadingShops, setIsLoadingShops] = useState(true);
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [count, setCount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchShops = useCallback(async () => {
    const res = await fetch("/api/shops");
    const { data } = await res.json();
    setShops(data || []);
    setIsLoadingShops(false);
  }, []);

  const fetchEntries = useCallback(async (shopId: string) => {
    setIsLoadingEntries(true);
    const res = await fetch(`/api/oil-changes?shop_id=${shopId}`);
    const { data } = await res.json();
    setEntries(data || []);
    setIsLoadingEntries(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchShops();
  }, [isAdmin, fetchShops]);

  useEffect(() => {
    if (selectedShopId) fetchEntries(selectedShopId);
    else setEntries([]);
  }, [selectedShopId, fetchEntries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedShopId) {
      setError("Select a shop first");
      return;
    }
    const countNum = parseInt(count, 10);
    if (isNaN(countNum) || countNum < 0) {
      setError("Count must be a non-negative integer");
      return;
    }

    setIsSubmitting(true);
    const res = await fetch("/api/oil-changes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: selectedShopId, date, count: countNum }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to save");
      setIsSubmitting(false);
      return;
    }

    setCount("");
    setIsSubmitting(false);
    fetchEntries(selectedShopId);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    await fetch(`/api/oil-changes/${id}`, { method: "DELETE" });
    fetchEntries(selectedShopId);
  };

  if (!isAdmin) return <p>Unauthorized</p>;

  const selectedShop = shops.find((s) => s.id === selectedShopId);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-exxon-charcoal">
        Oil Change Tracking
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Select Shop</CardTitle>
          <CardDescription>
            Choose a shop to view and manage its oil change history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedShopId}
            onValueChange={setSelectedShopId}
            disabled={isLoadingShops}
          >
            <SelectTrigger className="w-full md:w-[360px]" aria-label="Select shop">
              <SelectValue placeholder={isLoadingShops ? "Loading shops..." : "Select a shop"} />
            </SelectTrigger>
            <SelectContent>
              {shops.map((shop) => (
                <SelectItem key={shop.id} value={shop.id}>
                  {shop.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedShopId && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Add / Update Entry</CardTitle>
              <CardDescription>
                Submitting a date that already exists will overwrite its count.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="oc-date">Date</Label>
                  <Input
                    id="oc-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    max={today}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="oc-count">Oil Changes</Label>
                  <Input
                    id="oc-count"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-exxon-red text-white hover:bg-exxon-red-dark"
                >
                  {isSubmitting ? "Saving..." : "Save Entry"}
                </Button>
                {error && <p className="text-sm text-red-500 w-full">{error}</p>}
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                History{selectedShop ? ` — ${selectedShop.name}` : ""}
              </CardTitle>
              <CardDescription>
                All recorded daily oil change counts for this shop.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingEntries ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : entries.length === 0 ? (
                <p className="text-muted-foreground">No entries yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Oil Changes</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          {new Date(entry.date).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          })}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {entry.count}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(entry.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            aria-label={`Delete entry for ${entry.date}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
