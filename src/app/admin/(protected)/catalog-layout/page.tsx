import type { Metadata } from "next";
import { CatalogLayoutManager } from "@/components/admin/catalog-layout-manager";
import { getCatalogLayoutData } from "@/lib/queries/catalog-layout";

export const metadata: Metadata = {
  title: "Catalog Layout",
  robots: { index: false, follow: false },
};

export default async function CatalogLayoutPage() {
  const { games, featuredGameLimit } = await getCatalogLayoutData();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Catalog Layout
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Control storefront game order and the customer-facing Featured Games
          selection without changing XOB inventory.
        </p>
      </div>

      <CatalogLayoutManager
        games={games}
        featuredGameLimit={featuredGameLimit}
      />
    </div>
  );
}
