"use client";

import { useEffect } from "react";
import { AppLoadError } from "@/components/shared/app-load-error";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global app shell failed", {
      name: error.name,
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <AppLoadError onRetry={reset} />
      </body>
    </html>
  );
}
