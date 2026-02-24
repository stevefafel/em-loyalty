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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, FileText, Eye } from "lucide-react";
import { uploadCollateral, getCollateralUrl } from "@/lib/supabase/storage";
import type { Collateral } from "@/types/database";

export default function AdminCollateralPage() {
  const { isAdmin } = useAuth();
  const [materials, setMaterials] = useState<Collateral[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Collateral | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Preview dialog state
  const [previewTarget, setPreviewTarget] = useState<Collateral | null>(null);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<Collateral | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("");

  const fetchMaterials = useCallback(async () => {
    const res = await fetch("/api/collateral");
    const { data } = await res.json();
    setMaterials(data || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchMaterials();
  }, [isAdmin, fetchMaterials]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setFile(null);
    setCategory("");
    setEditingMaterial(null);
    setError("");
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (mat: Collateral) => {
    setEditingMaterial(mat);
    setTitle(mat.title);
    setDescription(mat.description || "");
    setFile(null);
    setCategory(mat.category || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");

    let filePath: string | undefined;

    // Upload file if one was selected
    if (file) {
      const { path, error: uploadError } = await uploadCollateral(file);
      if (uploadError) {
        setError("Failed to upload file. Please try again.");
        setSaving(false);
        return;
      }
      filePath = path;
    }

    // For new materials, a file is required
    if (!editingMaterial && !filePath) {
      setError("Please select a file to upload.");
      setSaving(false);
      return;
    }

    const payload: Record<string, unknown> = {
      title,
      description: description || undefined,
      category: category || undefined,
    };

    // Include file_path only if we uploaded a new file
    if (filePath) {
      payload.file_path = filePath;
    }

    const url = editingMaterial
      ? `/api/collateral/${editingMaterial.id}`
      : "/api/collateral";
    const method = editingMaterial ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setDialogOpen(false);
      resetForm();
      fetchMaterials();
    } else {
      const data = await res.json();
      setError(data.error ? JSON.stringify(data.error) : "Failed to save.");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/collateral/${deleteTarget.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setDeleteTarget(null);
      fetchMaterials();
    }
    setDeleting(false);
  };

  if (!isAdmin) return <p>Unauthorized</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-exxon-charcoal">
          Manage Marketing Materials
        </h1>
        <Button onClick={openCreate} className="bg-exxon-red text-white hover:bg-exxon-red/90">
          <Plus className="h-4 w-4 mr-1" />
          Add Material
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Materials ({materials.length})</CardTitle>
          <CardDescription>Create, edit, and delete marketing collateral</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : materials.length === 0 ? (
            <p className="text-muted-foreground">No marketing materials yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((mat) => (
                  <TableRow key={mat.id}>
                    <TableCell className="font-medium">{mat.title}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {mat.description || "—"}
                    </TableCell>
                    <TableCell>
                      {mat.category ? (
                        <Badge variant="outline">{mat.category}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                        <span className="max-w-[120px] truncate">
                          {mat.file_path.split("/").pop()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(mat.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-exxon-blue hover:text-exxon-blue hover:bg-blue-50"
                          onClick={() => setPreviewTarget(mat)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(mat)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeleteTarget(mat)}
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMaterial ? "Edit Marketing Material" : "Create Marketing Material"}
            </DialogTitle>
            <DialogDescription>
              {editingMaterial
                ? "Update the material details below."
                : "Fill in the details and upload a file to create a new marketing material."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Spring Promotion Flyer"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the material"
                rows={2}
              />
            </div>

            {!editingMaterial && (
              <div className="space-y-2">
                <Label htmlFor="file">File *</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Promotions, Branding, Signage"
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !title || (!editingMaterial && !file)}
              className="bg-exxon-red text-white hover:bg-exxon-red/90"
            >
              {saving ? "Uploading..." : editingMaterial ? "Update Material" : "Create Material"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewTarget} onOpenChange={(open) => { if (!open) setPreviewTarget(null); }}>
        <DialogContent className="sm:max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewTarget?.title}</DialogTitle>
            {previewTarget?.description && (
              <DialogDescription>{previewTarget.description}</DialogDescription>
            )}
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {previewTarget && (
              <iframe
                src={getCollateralUrl(previewTarget.file_path)}
                className="w-full h-full rounded-md border"
                title={previewTarget.title}
              />
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              asChild
            >
              <a
                href={previewTarget ? getCollateralUrl(previewTarget.file_path) : "#"}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in New Tab
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Marketing Material</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.title}&rdquo;? This will also
              remove all associated download logs. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
