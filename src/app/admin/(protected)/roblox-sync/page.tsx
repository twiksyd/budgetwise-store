import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/admin";
import { RobloxSyncDashboard } from "@/components/admin/roblox-sync-dashboard";
import { getRobloxSyncDashboardData } from "@/lib/queries/roblox-sync-dashboard";

export const metadata: Metadata = {
  title: "Roblox Sync",
  robots: { index: false, follow: false },
};

export default async function RobloxSyncPage() {
  // Must run before any privileged read: the layout guard renders in
  // parallel with this page and cannot stop its data from streaming.
  await requireAdmin();
  const data = await getRobloxSyncDashboardData();

  return <RobloxSyncDashboard data={data} />;
}
