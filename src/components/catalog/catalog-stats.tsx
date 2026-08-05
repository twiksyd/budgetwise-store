import { Gamepad2, Package, RefreshCw, Zap } from "lucide-react";

export function CatalogStats({
  gameCount,
  productCount,
}: {
  gameCount: number;
  productCount: number;
}) {
  const stats = [
    { icon: Gamepad2, text: `${gameCount} games` },
    { icon: Package, text: `${productCount}+ products` },
    { icon: RefreshCw, text: "Updated daily" },
    { icon: Zap, text: "Fast delivery" },
  ];

  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
      {stats.map(({ icon: Icon, text }) => (
        <span key={text} className="inline-flex items-center gap-1.5">
          <Icon className="size-3.5" />
          {text}
        </span>
      ))}
    </div>
  );
}
