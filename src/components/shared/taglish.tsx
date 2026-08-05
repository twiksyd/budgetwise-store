import { cn } from "@/lib/utils";

// A short Taglish clarification rendered directly under an English primary
// text — the site's bilingual pattern (how-ordering-works, faq, terms,
// refund-policy, privacy, and contact). This is a brief supporting note for
// Filipino customers (the key takeaway, not a re-translation of the English
// above it), styled as quiet helper text rather than a quote: same font
// family as the English, regular weight, muted-foreground, ~80-85% size,
// slightly tighter leading, no italic. `size="md"` is for use under
// headings (still clearly a caption, just legible next to larger text);
// `size="sm"` (default) is for use under body copy.
export function Taglish({
  children,
  size = "sm",
  className,
}: {
  children: React.ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-muted-foreground mt-1 font-normal leading-snug",
        size === "sm" ? "text-[12px]" : "text-[13px]",
        className,
      )}
    >
      {children}
    </p>
  );
}
