import { MessageCircle } from "lucide-react";
import { getTikTokSupportLink } from "@/lib/support-links";

// General (non-order) questions only; order questions go through Order Chat.
export function SupportHelpLink({ className = "" }: { className?: string }) {
  const supportLink = getTikTokSupportLink();

  if (!supportLink) return null;

  return (
    <a
      href={supportLink}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm font-medium transition-colors ${className}`}
    >
      <MessageCircle className="size-3.5" />
      May general na tanong? Message kami sa TikTok
    </a>
  );
}
