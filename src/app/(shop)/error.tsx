"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center">
      <TriangleAlert className="text-muted-foreground size-8" />
      <p className="font-heading mt-4 text-base font-semibold">
        Something went wrong
      </p>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">
        We couldn&apos;t load this page. Please try again in a moment.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
