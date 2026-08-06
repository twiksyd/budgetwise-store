import type { Metadata } from "next";
import { getProductAssetsForAdmin } from "@/lib/queries/admin-product-assets";
import { ProductAssetsManager } from "@/components/admin/product-assets-manager";

export const metadata: Metadata = {
  title: "Product Assets",
  robots: { index: false, follow: false },
};

export default async function ProductAssetsPage() {
  const assets = await getProductAssetsForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Product Assets
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Manage Store-owned product artwork without changing XOB inventory,
          pricing, or availability.
        </p>
      </div>

      <ProductAssetsManager assets={assets} />
    </div>
  );
}
