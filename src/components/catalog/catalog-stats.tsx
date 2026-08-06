"use client";

import { Gamepad2, Package, RefreshCw, Zap } from "lucide-react";
import { useStoreStatus } from "@/components/shared/store-status-provider";

export function CatalogStats({
  gameCount,
  productCount,
}: {
  gameCount: number;
  productCount: number;
}) {
  const status = useStoreStatus();

  const stats = [
    { icon: Gamepad2, text: `${gameCount} games` },
    { icon: Package, text: `${productCount}+ products` },
    { icon: RefreshCw, text: "Updated daily" },
    // A live-fulfillment claim doesn't belong here while orders aren't
    // actually being processed — the rest of the stats (catalog size,
    // freshness) stay true regardless of store status.
    ...(status === "open" ? [{ icon: Zap, text: "Fast delivery" }] : []),
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
