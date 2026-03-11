"use client";

import { useEffect, useRef, useCallback } from "react";

interface ScormPlayerProps {
  moduleId: string;
  onComplete?: (score: number) => void;
}

/**
 * SCORM Player component that provides SCORM 1.2 and 2004 API
 * and embeds the SCORM content in an iframe.
 *
 * The SCORM content is served via /api/training/[id]/scorm?file=...
 * which extracts files from the uploaded zip on the fly.
 */
export function ScormPlayer({ moduleId, onComplete }: ScormPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const completedRef = useRef(false);

  const handleCompletion = useCallback(
    (score: number) => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete?.(score);
    },
    [onComplete]
  );

  useEffect(() => {
    // Create SCORM 1.2 API (window.API)
    const scorm12Data: Record<string, string> = {
      "cmi.core.student_id": "user",
      "cmi.core.student_name": "User",
      "cmi.core.lesson_location": "",
      "cmi.core.lesson_status": "not attempted",
      "cmi.core.score.raw": "0",
      "cmi.core.score.min": "0",
      "cmi.core.score.max": "100",
      "cmi.suspend_data": "",
      "cmi.core.exit": "",
    };

    const API = {
      LMSInitialize: () => "true",
      LMSFinish: () => {
        const status = scorm12Data["cmi.core.lesson_status"];
        if (status === "completed" || status === "passed") {
          const score = parseInt(scorm12Data["cmi.core.score.raw"] || "0", 10);
          handleCompletion(score);
        }
        return "true";
      },
      LMSGetValue: (key: string) => scorm12Data[key] || "",
      LMSSetValue: (key: string, value: string) => {
        scorm12Data[key] = value;
        if (
          key === "cmi.core.lesson_status" &&
          (value === "completed" || value === "passed")
        ) {
          const score = parseInt(scorm12Data["cmi.core.score.raw"] || "0", 10);
          handleCompletion(score);
        }
        return "true";
      },
      LMSCommit: () => "true",
      LMSGetLastError: () => "0",
      LMSGetErrorString: () => "",
      LMSGetDiagnostic: () => "",
    };

    // Create SCORM 2004 API (window.API_1484_11)
    const scorm2004Data: Record<string, string> = {
      "cmi.learner_id": "user",
      "cmi.learner_name": "User",
      "cmi.location": "",
      "cmi.completion_status": "not attempted",
      "cmi.success_status": "unknown",
      "cmi.score.raw": "0",
      "cmi.score.min": "0",
      "cmi.score.max": "100",
      "cmi.score.scaled": "0",
      "cmi.suspend_data": "",
      "cmi.exit": "",
    };

    const API_1484_11 = {
      Initialize: () => "true",
      Terminate: () => {
        const status = scorm2004Data["cmi.completion_status"];
        if (status === "completed") {
          const score = parseInt(scorm2004Data["cmi.score.raw"] || "0", 10);
          handleCompletion(score);
        }
        return "true";
      },
      GetValue: (key: string) => scorm2004Data[key] || "",
      SetValue: (key: string, value: string) => {
        scorm2004Data[key] = value;
        if (key === "cmi.completion_status" && value === "completed") {
          const score = parseInt(scorm2004Data["cmi.score.raw"] || "0", 10);
          handleCompletion(score);
        }
        return "true";
      },
      Commit: () => "true",
      GetLastError: () => "0",
      GetErrorString: () => "",
      GetDiagnostic: () => "",
    };

    // Attach APIs to window so iframe content can find them
    // SCORM content traverses parent frames looking for these objects
    (window as unknown as Record<string, unknown>).API = API;
    (window as unknown as Record<string, unknown>).API_1484_11 = API_1484_11;

    return () => {
      delete (window as unknown as Record<string, unknown>).API;
      delete (window as unknown as Record<string, unknown>).API_1484_11;
    };
  }, [handleCompletion]);

  const scormUrl = `/api/training/${moduleId}/scorm?file=index.html`;

  return (
    <div className="w-full rounded-lg border bg-white overflow-hidden">
      <iframe
        ref={iframeRef}
        src={scormUrl}
        className="w-full h-[600px]"
        title="SCORM Training Content"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}
