"use client";

import { useState, useEffect, useCallback } from "react";
import { useEnrollmentGuard } from "@/hooks/use-enrollment-guard";
import { useAuth } from "@/context/auth-context";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, ArrowRight, Package } from "lucide-react";
import type { TrainingModule } from "@/types/database";

export default function TrainingPage() {
  const { isAdmin } = useAuth();
  const { isApproved, isLoading: guardLoading } = useEnrollmentGuard();
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchModules = useCallback(async () => {
    const res = await fetch("/api/training");
    if (res.ok) {
      const { data } = await res.json();
      setModules(data || []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  if (!isAdmin && (guardLoading || !isApproved)) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-exxon-charcoal">
        Training Modules
      </h1>
      <p className="text-muted-foreground">
        Complete training modules to learn about Mobil 1 products and earn
        certifications.
      </p>

      {/* Earn points callout */}
      <Card className="border-exxon-red/20 bg-gradient-to-r from-red-50 to-white">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-exxon-red/10">
              <GraduationCap className="h-5 w-5 text-exxon-red" />
            </div>
            <div>
              <p className="font-semibold text-exxon-charcoal">Earn 10 points per module</p>
              <p className="text-sm text-muted-foreground">
                Complete each training module once per year to earn Premium Growth points.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground">Loading modules...</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {modules.map((mod) => (
            <Link key={mod.id} href={`/training/${mod.id}`}>
              <Card className="cursor-pointer transition-shadow hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-exxon-blue/10">
                      {mod.content_type === "scorm" ? (
                        <Package className="h-5 w-5 text-exxon-blue" />
                      ) : (
                        <GraduationCap className="h-5 w-5 text-exxon-blue" />
                      )}
                    </div>
                    <Badge variant="outline">
                      {mod.content_type === "scorm"
                        ? "SCORM"
                        : `${mod.questions.length} Questions`}
                    </Badge>
                  </div>
                  <CardTitle className="mt-4">{mod.title}</CardTitle>
                  <CardDescription>{mod.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-sm text-exxon-red font-medium">
                    Start Module
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* M1 branding footer */}
      <div className="flex justify-center pt-4 opacity-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mobil1-logo-stacked.svg" alt="" className="h-24" />
      </div>
    </div>
  );
}
