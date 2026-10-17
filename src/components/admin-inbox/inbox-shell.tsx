"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { ConversationList } from "@/components/admin-inbox/conversation-list";
import { cn } from "@/lib/utils";

/**
 * Desktop: list | chat (+ details). The list stays mounted while you switch
 * conversations — only the right-hand route segment changes.
 * Mobile: the list first; opening a chat shows only the chat; Back returns.
 */
export function InboxShell({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const hasConversation = Boolean(segment);

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        className={cn(
          "border-border/60 min-h-0 w-full flex-col border-r md:w-[320px] lg:w-[340px] md:shrink-0",
          hasConversation ? "hidden md:flex" : "flex",
        )}
      >
        <ConversationList />
      </aside>
      <main className={cn("min-h-0 min-w-0 flex-1 flex-col", hasConversation ? "flex" : "hidden md:flex")}>
        {children}
      </main>
    </div>
  );
}
