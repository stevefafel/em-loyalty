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
import { GraduationCap, ArrowRight } from "lucide-react";
import type { TrainingModule } from "@/types/database";

export default function TrainingPage() {
  const { isAdmin } = useAuth();
  const { isApproved, isLoading: guardLoading } = useEnrollmentGuard();
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchModules = useCallback(async () => {
    const res = await fetch("/api/training");
    const { data } = await res.json();
    setModules(data || []);
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
                      <GraduationCap className="h-5 w-5 text-exxon-blue" />
                    </div>
                    <Badge variant="outline">5 Questions</Badge>
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
    </div>
  );
}
