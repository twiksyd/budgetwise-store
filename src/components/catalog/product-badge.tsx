import { Clock, Crown, Flame, PackageX, Sparkles, ThumbsUp, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { productBadgeLabels, type ProductBadgeKind } from "@/config/merchandising";

export type ProductBadgeValue =
  | ProductBadgeKind
  | "best-value"
  | "limited"
  | "out-of-stock"
  | "coming-soon";

const badgeConfig: Record<
  ProductBadgeValue,
  { label: string; icon: typeof Crown; variant: "gold" | "secondary" | "outline" }
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
  "out-of-stock": {
    label: "Out of Stock",
    icon: PackageX,
    variant: "outline",
  },
  "coming-soon": {
    label: "Coming Soon",
    icon: Clock,
    variant: "outline",
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
