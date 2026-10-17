import { MessageSquare } from "lucide-react";

export default function AdminInboxIndexPage() {
  return (
    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <MessageSquare className="size-8" />
      <p className="text-sm">Select a conversation to start.</p>
      <p className="max-w-xs text-xs">
        New chats and messages appear on the left automatically — no need to refresh.
      </p>
    </div>
  );
}
