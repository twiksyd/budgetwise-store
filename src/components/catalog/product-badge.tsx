import { Crown, Flame, Sparkles, ThumbsUp, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { productBadgeLabels, type ProductBadgeKind } from "@/config/merchandising";

export type ProductBadgeValue = ProductBadgeKind | "best-value" | "limited";

const badgeConfig: Record<
  ProductBadgeValue,
  { label: string; icon: typeof Crown; variant: "gold" | "secondary" }
> = {
  "best-value": { label: "Best Value", icon: Crown, variant: "gold" },
  "most-popular": {
    label: productBadgeLabels["most-popular"],
    icon: Flame,
    variant: "secondary",
  },
  recommended: {
    label: productBadgeLabels.recommended,
    icon: ThumbsUp,
    variant: "secondary",
  },
  new: {
    label: productBadgeLabels.new,
    icon: Sparkles,
    variant: "secondary",
  },
  limited: {
    label: "Limited",
    icon: Timer,
    variant: "secondary",
  },
};

export function ProductBadge({ kind }: { kind: ProductBadgeValue }) {
  const { label, icon: Icon, variant } = badgeConfig[kind];

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}
