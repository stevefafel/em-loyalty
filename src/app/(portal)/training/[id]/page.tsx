"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useEnrollmentGuard } from "@/hooks/use-enrollment-guard";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, FileText, ExternalLink } from "lucide-react";
import { getTrainingPdfUrl } from "@/lib/supabase/storage";
import { ScormPlayer } from "@/components/training/scorm-player";
import type { TrainingModule, TrainingLogEntry } from "@/types/database";
import { toast } from "sonner";

export default function TrainingModulePage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();
  const { isApproved, isLoading: guardLoading } = useEnrollmentGuard();
  const [module, setModule] = useState<TrainingModule | null>(null);
  const [logs, setLogs] = useState<TrainingLogEntry[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{
    score: number;
    total: number;
    pointsAwarded?: number;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchModule = useCallback(async () => {
    const res = await fetch(`/api/training/${id}`);
    const { data } = await res.json();
    if (data) {
      setModule(data.module);
      setLogs(data.logs);
      setAnswers(new Array(data.module.questions.length).fill(-1));
    }
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    fetchModule();
  }, [fetchModule]);

  if (!isAdmin && (guardLoading || !isApproved)) return null;
  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;
  if (!module) return <p>Module not found</p>;

  const handleAnswerChange = (questionIndex: number, optionIndex: number) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[questionIndex] = optionIndex;
      return next;
    });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const res = await fetch(`/api/training/${id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });

    const { data } = await res.json();
    setResult(data);
    setIsSubmitting(false);
    if (data?.pointsAwarded > 0) {
      toast.success(`+${data.pointsAwarded} points earned!`, {
        description: "Training completion points awarded.",
      });
    }
    fetchModule(); // Refresh logs
  };

  const handleScormComplete = (score: number) => {
    toast.success("Training completed!", {
      description: `SCORM module finished with score: ${score}`,
    });
    // Call the training complete endpoint to record and award points
    fetch(`/api/training/${id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: [], scormScore: score }),
    }).then(() => fetchModule());
  };

  const isScorm = module.content_type === "scorm";
  const allAnswered = answers.every((a) => a >= 0);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-exxon-charcoal">
          {module.title}
        </h1>
        <p className="text-muted-foreground mt-1">{module.description}</p>
        {isScorm && (
          <Badge variant="outline" className="mt-2 border-exxon-blue text-exxon-blue">
            Interactive SCORM Training
          </Badge>
        )}
      </div>

      {/* SCORM Content */}
      {isScorm && module.scorm_path && (
        <Card>
          <CardHeader>
            <CardTitle>Interactive Training</CardTitle>
            <CardDescription>
              Complete the interactive module below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScormPlayer
              moduleId={module.id}
              onComplete={handleScormComplete}
            />
          </CardContent>
        </Card>
      )}

      {/* PDF Reference Material (for pdf_quiz type) */}
      {!isScorm && module.pdf_path && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Reference Material
            </CardTitle>
            <CardDescription>
              Review the reference material below before taking the quiz
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border overflow-hidden" style={{ height: "600px" }}>
              <iframe
                src={getTrainingPdfUrl(module.pdf_path)}
                className="w-full h-full"
                title={`${module.title} - Reference Material`}
              />
            </div>
            <Button variant="outline" asChild>
              <a
                href={getTrainingPdfUrl(module.pdf_path)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Open in New Tab
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quiz (for pdf_quiz type) */}
      {!isScorm && module.questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Quiz</CardTitle>
            <CardDescription>
              Answer all {module.questions.length} questions to complete this module
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {module.questions.map((q, qIndex) => (
              <div key={qIndex} className="space-y-3">
                <Label className="text-base font-semibold">
                  {qIndex + 1}. {q.question}
                </Label>
                <div className="space-y-2">
                  {q.options.map((option, oIndex) => {
                    const isSelected = answers[qIndex] === oIndex;
                    const showResult = result !== null;
                    const isCorrect = oIndex === q.correct_index;

                    return (
                      <label
                        key={oIndex}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          showResult && isCorrect
                            ? "border-green-500 bg-green-50"
                            : showResult && isSelected && !isCorrect
                            ? "border-red-500 bg-red-50"
                            : isSelected
                            ? "border-exxon-red bg-exxon-red/5"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`question-${qIndex}`}
                          checked={isSelected}
                          onChange={() => handleAnswerChange(qIndex, oIndex)}
                          disabled={result !== null}
                          className="accent-exxon-red"
                        />
                        <span className="text-sm">{option}</span>
                        {showResult && isCorrect && (
                          <CheckCircle className="ml-auto h-4 w-4 text-green-600" />
                        )}
                        {showResult && isSelected && !isCorrect && (
                          <XCircle className="ml-auto h-4 w-4 text-red-600" />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

            {result ? (
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold">
                  Score: {result.score}/{result.total}
                </p>
                <p className="text-muted-foreground mt-1">
                  {result.score === result.total
                    ? "Perfect score!"
                    : result.score >= 3
                    ? "Good job!"
                    : "Keep studying and try again!"}
                </p>
                {result.pointsAwarded !== undefined && result.pointsAwarded > 0 && (
                  <p className="text-sm text-green-600 font-semibold mt-2">
                    +{result.pointsAwarded} points earned!
                  </p>
                )}
                <Button
                  onClick={() => {
                    setResult(null);
                    setAnswers(
                      new Array(module.questions.length).fill(-1)
                    );
                  }}
                  className="mt-4 bg-exxon-red text-white hover:bg-exxon-red-dark"
                >
                  Retake Quiz
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!allAnswered || isSubmitting}
                className="w-full bg-exxon-red text-white hover:bg-exxon-red-dark"
              >
                {isSubmitting ? "Submitting..." : "Submit Answers"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* History */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Attempt History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      {new Date(log.completed_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {isScorm ? `${log.score}%` : `${log.score}/5`}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          isScorm
                            ? log.score >= 80
                              ? "border-green-500 text-green-700"
                              : log.score >= 60
                              ? "border-yellow-500 text-yellow-700"
                              : "border-red-500 text-red-700"
                            : log.score >= 4
                            ? "border-green-500 text-green-700"
                            : log.score >= 3
                            ? "border-yellow-500 text-yellow-700"
                            : "border-red-500 text-red-700"
                        }
                      >
                        {isScorm
                          ? log.score >= 80
                            ? "Excellent"
                            : log.score >= 60
                            ? "Passed"
                            : "Needs Improvement"
                          : log.score >= 4
                          ? "Excellent"
                          : log.score >= 3
                          ? "Passed"
                          : "Needs Improvement"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
