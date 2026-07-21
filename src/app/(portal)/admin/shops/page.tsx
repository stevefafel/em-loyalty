"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Eye, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Shop } from "@/types/database";

const statusColors: Record<string, string> = {
  new: "border-gray-400 text-gray-600 bg-gray-50",
  pending: "border-yellow-500 text-yellow-700 bg-yellow-50",
  approved: "border-green-500 text-green-700 bg-green-50",
  rejected: "border-red-500 text-red-700 bg-red-50",
};

const emptyShopForm = {
  name: "",
  address: "",
  phone: "",
  steer_shop_id: "",
  autoops_shop_id: "",
};

export default function AdminShopsPage() {
  const { isAdmin } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add shop dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyShopForm);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Shop | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const fetchShops = useCallback(async () => {
    const res = await fetch("/api/shops");
    const { data } = await res.json();
    setShops(data || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchShops();
  }, [isAdmin, fetchShops]);

  const handleStatusChange = async (shopId: string, newStatus: string) => {
    await fetch(`/api/shops/${shopId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ program_status: newStatus }),
    });
    fetchShops();
  };

  const handleMarkWelcomePacketSent = async (shopId: string) => {
    await fetch(`/api/shops/${shopId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sent_welcome_packet: true }),
    });
    fetchShops();
  };

  const openAdd = () => {
    setAddForm(emptyShopForm);
    setAddError("");
    setAddOpen(true);
  };

  const handleCreateShop = async () => {
    setAddSaving(true);
    setAddError("");

    const res = await fetch("/api/shops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });

    if (res.ok) {
      setAddOpen(false);
      fetchShops();
    } else {
      const data = await res.json().catch(() => null);
      const fieldError =
        data?.error && typeof data.error === "object"
          ? Object.values(data.error).flat().filter(Boolean).join(" ")
          : null;
      setAddError(
        typeof data?.error === "string"
          ? data.error
          : fieldError ||
              `Failed to create shop (${res.status}). Please check the fields and try again.`
      );
    }
    setAddSaving(false);
  };

  const handleDeleteShop = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");

    const res = await fetch(`/api/shops/${deleteTarget.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setDeleteTarget(null);
      fetchShops();
    } else {
      const data = await res.json().catch(() => null);
      setDeleteError(
        typeof data?.error === "string"
          ? data.error
          : `Failed to delete shop (${res.status}).`
      );
    }
    setDeleting(false);
  };

  if (!isAdmin) return <p>Unauthorized</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-exxon-charcoal">
          Manage Shops
        </h1>
        <Button
          onClick={openAdd}
          className="bg-exxon-red text-white hover:bg-exxon-red/90"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Shop
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Shops</CardTitle>
          <CardDescription>
            Manage shop enrollment status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shop Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Welcome Packet</TableHead>
                  <TableHead>Change Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shops.map((shop) => (
                  <TableRow key={shop.id}>
                    <TableCell className="font-medium">{shop.name}</TableCell>
                    <TableCell>{shop.address || "—"}</TableCell>
                    <TableCell>{shop.phone || "—"}</TableCell>
                    <TableCell>{shop.loyalty_points_balance}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusColors[shop.program_status]}
                      >
                        {shop.program_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {shop.sent_welcome_packet_at ? (
                        <Badge
                          variant="outline"
                          className="border-green-500 text-green-700 bg-green-50"
                        >
                          Sent {new Date(shop.sent_welcome_packet_at).toLocaleDateString()}
                        </Badge>
                      ) : shop.program_status === "approved" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMarkWelcomePacketSent(shop.id)}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Mark Sent
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={shop.program_status}
                        onValueChange={(val) =>
                          handleStatusChange(shop.id, val)
                        }
                      >
                        <SelectTrigger
                          className="w-[130px]"
                          aria-label={`Change status for ${shop.name}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/admin/shops/${shop.id}`}>
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          aria-label={`Delete ${shop.name}`}
                          onClick={() => {
                            setDeleteError("");
                            setDeleteTarget(shop);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Shop Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Shop</DialogTitle>
            <DialogDescription>
              Create a new shop. Platform cross-references can be added now or
              later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-shop-name">Shop Name</Label>
              <Input
                id="new-shop-name"
                value={addForm.name}
                onChange={(e) =>
                  setAddForm({ ...addForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-shop-address">Shop Address</Label>
              <Input
                id="new-shop-address"
                value={addForm.address}
                onChange={(e) =>
                  setAddForm({ ...addForm, address: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-shop-phone">Shop Phone</Label>
              <Input
                id="new-shop-phone"
                value={addForm.phone}
                onChange={(e) =>
                  setAddForm({ ...addForm, phone: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-steer-shop-id">Steer Shop ID</Label>
              <Input
                id="new-steer-shop-id"
                placeholder="UUID from the Steer platform"
                value={addForm.steer_shop_id}
                onChange={(e) =>
                  setAddForm({ ...addForm, steer_shop_id: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-autoops-shop-id">AutoOps Shop ID</Label>
              <Input
                id="new-autoops-shop-id"
                placeholder="ID from the AutoOps platform (e.g. cl_...)"
                value={addForm.autoops_shop_id}
                onChange={(e) =>
                  setAddForm({ ...addForm, autoops_shop_id: e.target.value })
                }
              />
            </div>
            {addError && <p className="text-sm text-red-600">{addError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={addSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateShop}
              disabled={addSaving}
              className="bg-exxon-red text-white hover:bg-exxon-red/90"
            >
              {addSaving ? "Creating..." : "Create Shop"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Shop</DialogTitle>
            <DialogDescription>
              Permanently delete{" "}
              <span className="font-semibold">{deleteTarget?.name}</span>? This
              also removes its invoices, points history, training records, and
              user assignments. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteShop}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? "Deleting..." : "Delete Shop"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
