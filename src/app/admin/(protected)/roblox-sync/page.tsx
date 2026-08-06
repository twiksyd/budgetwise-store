import type { Metadata } from "next";
import { RobloxSyncDashboard } from "@/components/admin/roblox-sync-dashboard";
import { getRobloxSyncDashboardData } from "@/lib/queries/roblox-sync-dashboard";

export const metadata: Metadata = {
  title: "Roblox Sync",
  robots: { index: false, follow: false },
};

export default async function RobloxSyncPage() {
  const data = await getRobloxSyncDashboardData();

  return <RobloxSyncDashboard data={data} />;
}
