import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/admin";
import { listQuickReplies, loadAdminDirectory } from "@/lib/queries/order-chat";
import { QuickRepliesManager } from "@/components/admin-inbox/quick-replies-manager";

export const metadata: Metadata = { title: "Quick Replies", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function QuickRepliesPage() {
  // Must run before any privileged read.
  await requireAdmin();
  const [replies, directory] = await Promise.all([listQuickReplies(), loadAdminDirectory()]);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Quick Replies</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Type <span className="font-mono">/shortcut</span> in any order chat to insert one. Inserting never sends — you can edit first.
          Variables: <span className="font-mono">{"{{customer_name}} {{order_number}} {{roblox_username}} {{total}}"}</span>.
        </p>
      </div>
      <QuickRepliesManager
        initialReplies={replies}
        directory={Object.fromEntries(directory.map((entry) => [entry.userId, entry.displayName]))}
      />
    </div>
  );
}
