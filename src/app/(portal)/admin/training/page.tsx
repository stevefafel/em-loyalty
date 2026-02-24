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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import type { TrainingModule, QuizQuestion } from "@/types/database";

const emptyQuestion: QuizQuestion = {
  question: "",
  options: ["", "", "", ""],
  correct_index: 0,
};

export default function AdminTrainingPage() {
  const { isAdmin } = useAuth();
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<TrainingModule | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<TrainingModule | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pdfPath, setPdfPath] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);

  const fetchModules = useCallback(async () => {
    const res = await fetch("/api/training");
    const { data } = await res.json();
    setModules(data || []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchModules();
  }, [isAdmin, fetchModules]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPdfPath("");
    setQuestions([]);
    setEditingModule(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (mod: TrainingModule) => {
    setEditingModule(mod);
    setTitle(mod.title);
    setDescription(mod.description || "");
    setPdfPath(mod.pdf_path);
    setQuestions(
      Array.isArray(mod.questions) && mod.questions.length > 0
        ? (mod.questions as QuizQuestion[])
        : []
    );
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      title,
      description: description || undefined,
      pdf_path: pdfPath,
      questions,
    };

    const url = editingModule
      ? `/api/training/${editingModule.id}`
      : "/api/training";
    const method = editingModule ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setDialogOpen(false);
      resetForm();
      fetchModules();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/training/${deleteTarget.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setDeleteTarget(null);
      fetchModules();
    }
    setDeleting(false);
  };

  // Question helpers
  const addQuestion = () => {
    setQuestions([...questions, { ...emptyQuestion, options: ["", "", "", ""] }]);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: string, value: string) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    const updated = [...questions];
    const newOptions = [...updated[qIndex].options];
    newOptions[oIndex] = value;
    updated[qIndex] = { ...updated[qIndex], options: newOptions };
    setQuestions(updated);
  };

  const updateCorrectIndex = (qIndex: number, value: string) => {
    const updated = [...questions];
    updated[qIndex] = { ...updated[qIndex], correct_index: parseInt(value) };
    setQuestions(updated);
  };

  if (!isAdmin) return <p>Unauthorized</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-exxon-charcoal">
          Manage Training Modules
        </h1>
        <Button onClick={openCreate} className="bg-exxon-red text-white hover:bg-exxon-red/90">
          <Plus className="h-4 w-4 mr-1" />
          Add Module
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Modules</CardTitle>
          <CardDescription>Create, edit, and delete training modules</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : modules.length === 0 ? (
            <p className="text-muted-foreground">No training modules yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>PDF Path</TableHead>
                  <TableHead>Questions</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modules.map((mod) => (
                  <TableRow key={mod.id}>
                    <TableCell className="font-medium">{mod.title}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {mod.description || "—"}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate text-sm text-muted-foreground">
                      {mod.pdf_path}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {Array.isArray(mod.questions) ? mod.questions.length : 0}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(mod.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(mod)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeleteTarget(mod)}
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingModule ? "Edit Training Module" : "Create Training Module"}
            </DialogTitle>
            <DialogDescription>
              {editingModule
                ? "Update the module details below."
                : "Fill in the details to create a new training module."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Oil Change Fundamentals"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the module"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pdfPath">PDF Path *</Label>
              <Input
                id="pdfPath"
                value={pdfPath}
                onChange={(e) => setPdfPath(e.target.value)}
                placeholder="e.g. training-pdfs/oil-change-101.pdf"
              />
            </div>

            {/* Questions builder */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Quiz Questions ({questions.length})</Label>
                <Button type="button" size="sm" variant="outline" onClick={addQuestion}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Question
                </Button>
              </div>

              {questions.map((q, qIdx) => (
                <Card key={qIdx} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-2">
                      <Label>Question {qIdx + 1}</Label>
                      <Input
                        value={q.question}
                        onChange={(e) => updateQuestion(qIdx, "question", e.target.value)}
                        placeholder="Enter question text"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-red-500 mt-6"
                      onClick={() => removeQuestion(qIdx)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          Option {String.fromCharCode(65 + oIdx)}
                        </Label>
                        <Input
                          value={opt}
                          onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                          placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Correct Answer</Label>
                    <Select
                      value={String(q.correct_index)}
                      onValueChange={(val) => updateCorrectIndex(qIdx, val)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Option A</SelectItem>
                        <SelectItem value="1">Option B</SelectItem>
                        <SelectItem value="2">Option C</SelectItem>
                        <SelectItem value="3">Option D</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !title || !pdfPath}
              className="bg-exxon-red text-white hover:bg-exxon-red/90"
            >
              {saving ? "Saving..." : editingModule ? "Update Module" : "Create Module"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Training Module</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.title}&rdquo;? This will also
              remove all associated training logs. This action cannot be undone.
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
