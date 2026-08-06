import type { Metadata } from "next";
import { CatalogHealthDashboard } from "@/components/admin/catalog-health-dashboard";
import { getCatalogHealthData } from "@/lib/queries/catalog-health";

export const metadata: Metadata = {
  title: "Catalog Health | BudgetWise Admin",
};

export default async function CatalogHealthPage() {
  const data = await getCatalogHealthData();

  return <CatalogHealthDashboard data={data} />;
}
