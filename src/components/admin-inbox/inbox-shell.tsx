"use client";

import { MessageSquare } from "lucide-react";
import { ConversationList } from "@/components/admin-inbox/conversation-list";
import { ConversationView } from "@/components/admin-inbox/conversation-view";
import { useInbox } from "@/components/admin-inbox/inbox-provider";
import { cn } from "@/lib/utils";

/**
 * Desktop: list | chat (+ details). Mobile: the list first; opening a chat
 * shows only the chat; Back returns.
 *
 * The open conversation is client state (the URL follows it via
 * history.pushState), so switching chats never waits for a server round
 * trip and never remounts the list, the provider or the realtime channel —
 * only the conversation pane changes. The route pages still exist so a
 * reload or a shared link opens the right chat.
 */
export function InboxShell({ children }: { children: React.ReactNode }) {
  const { activeOrderNumber } = useInbox();
  const hasConversation = Boolean(activeOrderNumber);

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
        {activeOrderNumber ? (
          <ConversationView key={activeOrderNumber} orderNumber={activeOrderNumber} />
        ) : (
          <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <MessageSquare className="size-8" />
            <p className="text-sm">Select a conversation to start.</p>
            <p className="max-w-xs text-xs">
              New chats and messages appear on the left automatically — no need to refresh.
            </p>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
