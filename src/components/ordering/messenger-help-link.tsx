"use client";

import { MessageCircle } from "lucide-react";
import { getGeneralMessengerLink } from "@/lib/messenger";

export function MessengerHelpLink({ className = "" }: { className?: string }) {
  const messengerLink = getGeneralMessengerLink();

  if (!messengerLink) return null;

  return (
    <a
      href={messengerLink}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm font-medium transition-colors ${className}`}
    >
      <MessageCircle className="size-3.5" />
      May tanong? I-message ang BudgetWise
    </a>
  );
}
