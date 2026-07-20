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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Pencil, Trash2, UserPlus } from "lucide-react";
import { userFullName } from "@/lib/utils";
import type { User, UserRole } from "@/types/database";

interface AdminUser extends User {
  shops: { id: string; name: string }[];
}

interface UserForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: UserRole;
  shop_ids: string[];
}

const emptyForm: UserForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  role: "user",
  shop_ids: [],
};

/** API errors are either a string or zod fieldErrors ({ field: [messages] }). */
function formatApiError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const messages = Object.values(error).flat().filter(Boolean);
    if (messages.length > 0) return messages.join(" ");
  }
  return "Something went wrong. Please try again.";
}

export default function AdminUsersPage() {
  const { isAdmin, session } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog state: editingUser === null means "create new".
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    const [usersRes, shopsRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/shops"),
    ]);
    const { data: userData } = await usersRes.json();
    const { data: shopData } = await shopsRes.json();
    setUsers(userData || []);
    setShops(shopData || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin, fetchData]);

  const openCreate = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (user: AdminUser) => {
    setEditingUser(user);
    setForm({
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone: user.phone || "",
      role: user.role,
      shop_ids: user.shops.map((s) => s.id),
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const toggleShop = (shopId: string) => {
    setForm((f) => ({
      ...f,
      shop_ids: f.shop_ids.includes(shopId)
        ? f.shop_ids.filter((id) => id !== shopId)
        : [...f.shop_ids, shopId],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError(null);

    const res = await fetch(
      editingUser ? `/api/users/${editingUser.id}` : "/api/users",
      {
        method: editingUser ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }
    );

    if (!res.ok) {
      const { error } = await res.json();
      setFormError(formatApiError(error));
      setSaving(false);
      return;
    }

    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);

    const res = await fetch(`/api/users/${deleteTarget.id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const { error } = await res.json();
      setDeleteError(formatApiError(error));
      setDeleting(false);
      return;
    }

    setDeleting(false);
    setDeleteTarget(null);
    fetchData();
  };

  if (!isAdmin) return <p>Unauthorized</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-exxon-charcoal">
          Manage Users
        </h1>
        <Button
          onClick={openCreate}
          className="bg-exxon-red text-white hover:bg-exxon-red/90"
        >
          <UserPlus className="h-4 w-4 mr-1" />
          Add User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            Users who can sign in to the portal. Shop users also need a shop
            assignment to access their dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Shops</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {userFullName(user)}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.phone || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          user.role === "admin"
                            ? "bg-exxon-red text-white"
                            : "bg-exxon-blue text-white"
                        }
                      >
                        {user.role === "admin" ? "Admin" : "Shop User"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.role === "admin"
                        ? "—"
                        : user.shops.length > 0
                        ? user.shops.map((s) => s.name).join(", ")
                        : (
                          <span className="text-yellow-700">No shops</span>
                        )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(user)}
                          aria-label={`Edit ${userFullName(user)}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(user);
                          }}
                          disabled={user.id === session?.userId}
                          aria-label={`Delete ${userFullName(user)}`}
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

      {/* Create / Edit User Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Edit User" : "Add User"}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? "Update the user's details and shop assignments."
                : "The email must match the user's Steer (Keycloak) account for them to sign in."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="user-first-name">First Name</Label>
                <Input
                  id="user-first-name"
                  value={form.first_name}
                  onChange={(e) =>
                    setForm({ ...form, first_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-last-name">Last Name</Label>
                <Input
                  id="user-last-name"
                  value={form.last_name}
                  onChange={(e) =>
                    setForm({ ...form, last_name: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-phone">Phone (optional)</Label>
              <Input
                id="user-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-role">Role</Label>
              <Select
                value={form.role}
                onValueChange={(val) =>
                  setForm({ ...form, role: val as UserRole })
                }
              >
                <SelectTrigger id="user-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Shop User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role === "user" && (
              <div className="space-y-2">
                <Label>Shops</Label>
                {shops.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No shops available.
                  </p>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
                    {shops.map((shop) => (
                      <label
                        key={shop.id}
                        className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={form.shop_ids.includes(shop.id)}
                          onChange={() => toggleShop(shop.id)}
                          className="accent-exxon-red"
                        />
                        {shop.name}
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Shop users need at least one shop to use the portal.
                </p>
              </div>
            )}
            {formError && <p className="text-sm text-red-600">{formError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-exxon-red text-white hover:bg-exxon-red/90"
            >
              {saving
                ? "Saving..."
                : editingUser
                ? "Save Changes"
                : "Add User"}
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
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `Delete ${userFullName(deleteTarget)} (${deleteTarget.email})? Their shop assignments and submitted records will also be removed. This cannot be undone.`
                : null}
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
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? "Deleting..." : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
