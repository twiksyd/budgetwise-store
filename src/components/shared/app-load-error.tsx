"use client";

import { MessageCircle, RefreshCcw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

function messengerHref() {
  return siteConfig.messengerPageId
    ? `https://m.me/${siteConfig.messengerPageId}`
    : null;
}

export function AppLoadError({
  onRetry,
  detail = "Something interrupted the page while it was loading. Please retry or reload the website.",
}: {
  onRetry?: () => void;
  detail?: string;
}) {
  const messengerLink = messengerHref();

  return (
    <div className="bg-background text-foreground flex min-h-[70vh] items-center justify-center px-6 py-16">
      <div className="mx-auto flex max-w-sm flex-col items-center text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <RefreshCcw className="text-muted-foreground size-5" />
        </div>
        <h1 className="font-heading mt-4 text-xl font-semibold tracking-tight">
          BudgetWise could not load properly.
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {detail}
        </p>
        <div className="mt-6 flex w-full flex-col gap-2.5">
          {onRetry ? (
            <Button type="button" onClick={onRetry} className="h-11 w-full">
              <RotateCcw className="size-4" />
              Retry
            </Button>
          ) : null}
          <Button
            type="button"
            variant={onRetry ? "outline" : "default"}
            onClick={() => window.location.reload()}
            className="h-11 w-full"
          >
            <RefreshCcw className="size-4" />
            Reload Website
          </Button>
          {messengerLink ? (
            <Button type="button" variant="outline" asChild className="h-11 w-full">
              <a href={messengerLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-4" />
                Open Messenger
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
