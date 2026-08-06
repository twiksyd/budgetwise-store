"use client";

import { useEffect } from "react";
import { AppLoadError } from "@/components/shared/app-load-error";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App route failed", {
      name: error.name,
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return <AppLoadError onRetry={reset} />;
}
