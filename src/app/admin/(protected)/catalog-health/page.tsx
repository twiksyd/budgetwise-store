import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/admin";
import { CatalogHealthDashboard } from "@/components/admin/catalog-health-dashboard";
import { getCatalogHealthData } from "@/lib/queries/catalog-health";

export const metadata: Metadata = {
  title: "Catalog Health | BudgetWise Admin",
};

export default async function CatalogHealthPage() {
  // Must run before any privileged read: the layout guard renders in
  // parallel with this page and cannot stop its data from streaming.
  await requireAdmin();
  const data = await getCatalogHealthData();

  return <CatalogHealthDashboard data={data} />;
}
