import type { Metadata } from "next";
import { getStoreSettingsForAdmin } from "@/lib/store-status";
import {
  getAllGamesForAdmin,
  getAllGamepassesForAdmin,
} from "@/lib/queries/admin-catalog";
import { StoreStatusSection } from "@/components/admin/store-status-section";
import { ScheduleSection } from "@/components/admin/schedule-section";
import { GameAvailabilityTable } from "@/components/admin/game-availability-table";
import { ProductAvailabilityAccordion } from "@/components/admin/product-availability-accordion";

export const metadata: Metadata = {
  title: "Store Operations",
  robots: { index: false, follow: false },
};

export default async function StoreOperationsPage() {
  const [settings, games, gamepasses] = await Promise.all([
    getStoreSettingsForAdmin(),
    getAllGamesForAdmin(),
    getAllGamepassesForAdmin(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Store Operations
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Temporarily disable products, games, or the entire storefront
          without a redeploy.
        </p>
      </div>

      <StoreStatusSection
        initialStatus={settings.status}
        initialNotice={settings.noticeMessage}
      />

      <ScheduleSection
        initialScheduledStatus={settings.scheduledStatus}
        initialScheduledAt={settings.scheduledAt}
        initialScheduledReopenAt={settings.scheduledReopenAt}
      />

      <div>
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Game Availability
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Hidden games are removed from the storefront but stay listed here.
        </p>
        <div className="surface-premium mt-4 rounded-2xl p-2">
          <GameAvailabilityTable games={games} />
        </div>
      </div>

      <div>
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Product Availability
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Grouped by game. Hidden products are removed from the storefront
          but stay listed here.
        </p>
        <div className="surface-premium mt-4 rounded-2xl p-2">
          <ProductAvailabilityAccordion games={games} gamepasses={gamepasses} />
        </div>
      </div>
    </div>
  );
}
