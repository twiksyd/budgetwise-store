"use client";

import { useEffect, useState } from "react";
import { AppLoadError } from "@/components/shared/app-load-error";

function isChunkLoadProblem(value: unknown) {
  const text =
    value instanceof Error
      ? `${value.name} ${value.message}`
      : typeof value === "string"
        ? value
        : "";

  return /ChunkLoadError|Loading chunk|dynamically imported module|failed to fetch dynamically imported module|Importing a module script failed/i.test(
    text,
  );
}

export function ChunkLoadRecovery() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    function handleError(event: ErrorEvent) {
      if (isChunkLoadProblem(event.error) || isChunkLoadProblem(event.message)) {
        setFailed(true);
      }
    }

    function handleRejection(event: PromiseRejectionEvent) {
      if (isChunkLoadProblem(event.reason)) {
        setFailed(true);
      }
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  if (!failed) return null;

  return (
    <div className="bg-background/95 fixed inset-0 z-[100] overflow-y-auto backdrop-blur-sm">
      <AppLoadError detail="The website loaded an outdated or interrupted file. Reloading usually fixes this." />
    </div>
  );
}
