import { cn } from "@/lib/utils";

// A smaller Taglish clarification rendered directly under an English
// primary text — the site's bilingual pattern (see how-ordering-works,
// faq, terms, refund-policy, privacy, contact, checkout, and select
// homepage sections). This is a paraphrase/clarification for Filipino
// customers, not a literal translation, and must never outweigh the
// English text above it: muted (and slightly dimmer than the site's usual
// muted-foreground, since several English paragraphs it sits under are
// already that color), normal weight, italic (matching the convention
// used for it elsewhere), ~80-85% size, tighter leading. `size="md"` is
// for use under headings (still clearly a caption, just legible next to
// larger text); `size="sm"` (default) is for use under body copy.
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
        "text-muted-foreground/80 mt-1 font-normal italic leading-snug",
        size === "sm" ? "text-[13px]" : "text-sm",
        className,
      )}
    >
      {children}
    </p>
  );
}
