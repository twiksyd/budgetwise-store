import type { Metadata } from "next";
import { getArtworkReconciliationData } from "@/lib/queries/artwork-reconciliation";
import { ArtworkReconciliationManager } from "@/components/admin/artwork-reconciliation-manager";

export const metadata: Metadata = {
  title: "Artwork Recovery",
  robots: { index: false, follow: false },
};

export default async function ArtworkRecoveryPage() {
  const { orphans, allProducts } = await getArtworkReconciliationData();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Artwork Recovery
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          When XOB re-imports a product under a new id, its saved artwork is
          still here — just pointing at the old id. Relink it to the current
          product instead of re-uploading.
        </p>
      </div>

      <ArtworkReconciliationManager orphans={orphans} allProducts={allProducts} />
    </div>
  );
}
