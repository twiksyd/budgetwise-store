"use client";

import { useMemo, useState, useTransition } from "react";
import { Gamepad2, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  restorePlaceholderArtworkAction,
  restoreRobloxArtworkAction,
  saveProductArtworkUrlAction,
  uploadProductArtworkAction,
} from "@/app/admin/(protected)/product-assets/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AdminArtworkSource,
  AdminProductAsset,
} from "@/lib/queries/admin-product-assets";
import { cn } from "@/lib/utils";

type FilterValue = "all" | AdminArtworkSource;

const sourceLabels: Record<AdminArtworkSource, string> = {
  manual: "Manual artwork",
  roblox: "Roblox artwork",
  placeholder: "Placeholder",
  no_match: "No match",
  ambiguous: "Ambiguous",
};

const sourceBadgeClassNames: Record<AdminArtworkSource, string> = {
  manual: "bg-primary/10 text-primary",
  roblox: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  placeholder: "bg-muted text-muted-foreground",
  no_match: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  ambiguous: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

const robloxStatusLabels: Record<
  NonNullable<AdminProductAsset["robloxStatus"]>,
  string
> = {
  matched: "Matched",
  no_match: "No match",
  ambiguous: "Ambiguous",
};

function ArtworkPreview({
  src,
  label,
}: {
  src: string | null;
  label: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-xl">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={label}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <Gamepad2 className="text-muted-foreground absolute inset-0 m-auto size-5" />
      )}
    </div>
  );
}

function ProductAssetRow({ asset }: { asset: AdminProductAsset }) {
  const [pending, startTransition] = useTransition();
  const artworkSourceLabel =
    asset.artworkSource === "manual" && asset.manualKind === "upload"
      ? "Manual upload"
      : asset.artworkSource === "manual" && asset.manualKind === "remote"
        ? "Manual URL copy"
        : sourceLabels[asset.artworkSource];

  function handleUpload(formData: FormData) {
    formData.set("gamepassId", asset.id);
    startTransition(async () => {
      const result = await uploadProductArtworkAction(formData);
      if (result.success) {
        if (result.warning) toast.warning(result.warning);
        else toast.success("Artwork uploaded.");
      }
      else toast.error(result.error ?? "Upload failed.");
    });
  }

  function handleUrl(formData: FormData) {
    formData.set("gamepassId", asset.id);
    startTransition(async () => {
      const result = await saveProductArtworkUrlAction(formData);
      if (result.success) {
        if (result.warning) toast.warning(result.warning);
        else toast.success("Artwork URL saved.");
      }
      else toast.error(result.error ?? "URL was not saved.");
    });
  }

  function handleRestoreRoblox() {
    if (!asset.robloxUrl) return;
    if (!window.confirm("Restore cached Roblox artwork for this product?")) {
      return;
    }
    startTransition(async () => {
      const result = await restoreRobloxArtworkAction(asset.id);
      if (result.success) {
        if (result.warning) toast.warning(result.warning);
        else toast.success("Roblox artwork restored.");
      }
      else toast.error(result.error ?? "Could not restore Roblox artwork.");
    });
  }

  function handleRestorePlaceholder() {
    if (!window.confirm("Use the default placeholder for this product?")) {
      return;
    }
    startTransition(async () => {
      const result = await restorePlaceholderArtworkAction(asset.id);
      if (result.success) {
        if (result.warning) toast.warning(result.warning);
        else toast.success("Placeholder restored.");
      }
      else toast.error(result.error ?? "Could not restore placeholder.");
    });
  }

  return (
    <div className="grid gap-3 border-b p-3 last:border-b-0 md:grid-cols-[minmax(18rem,1fr)_minmax(15rem,0.9fr)_minmax(18rem,1.1fr)] md:items-center">
      <div className="flex min-w-0 gap-3">
        <ArtworkPreview
          src={asset.artworkUrl}
          label={`${asset.name} artwork`}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{asset.name}</p>
          {asset.displayName && (
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              Original: {asset.canonicalName}
            </p>
          )}
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {asset.gameName}
            {asset.gameCategory ? ` / ${asset.gameCategory}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge
              variant="ghost"
              className={cn(
                "h-6",
                sourceBadgeClassNames[asset.artworkSource],
              )}
            >
              {artworkSourceLabel}
            </Badge>
            {!asset.isActive && (
              <Badge variant="outline" className="h-6">
                inactive
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="text-muted-foreground grid gap-1 text-xs">
        <div className="flex justify-between gap-3">
          <span>Roblox status</span>
          <span className="text-foreground">
            {asset.robloxStatus
              ? robloxStatusLabels[asset.robloxStatus]
              : "None"}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Robux</span>
          <span className="text-foreground">
            {asset.robuxAmount.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Price</span>
          <span className="text-foreground">₱{asset.price}</span>
        </div>
        {asset.robloxCandidateCount ? (
          <div className="flex justify-between gap-3">
            <span>Candidates</span>
            <span className="text-foreground">
              {asset.robloxCandidateCount}
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid gap-2">
        <form action={handleUpload} className="flex gap-2">
          <Input
            name="file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={pending}
            className="h-9 text-xs file:mr-2"
          />
          <Button type="submit" size="sm" disabled={pending}>
            <Upload className="size-3.5" />
            Upload
          </Button>
        </form>

        <form action={handleUrl} className="flex gap-2">
          <Input
            name="iconUrl"
            type="url"
            placeholder="https://example.com/image.webp"
            defaultValue={asset.manualUrl ?? ""}
            disabled={pending}
            className="h-9 text-xs"
          />
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            Save URL
          </Button>
        </form>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !asset.robloxUrl}
            onClick={handleRestoreRoblox}
          >
            <RotateCcw className="size-3.5" />
            Restore Roblox
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={handleRestorePlaceholder}
          >
            Restore Placeholder
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ProductAssetsManager({
  assets,
}: {
  assets: AdminProductAsset[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return assets.filter((asset) => {
      const matchesFilter =
        filter === "all" || asset.artworkSource === filter;
      const matchesQuery =
        !normalizedQuery ||
        asset.name.toLowerCase().includes(normalizedQuery) ||
        asset.gameName.toLowerCase().includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [assets, filter, query]);

  const counts = useMemo(() => {
    return assets.reduce(
      (acc, asset) => {
        acc[asset.artworkSource] += 1;
        return acc;
      },
      {
        manual: 0,
        roblox: 0,
        placeholder: 0,
        no_match: 0,
        ambiguous: 0,
      } satisfies Record<AdminArtworkSource, number>,
    );
  }, [assets]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search product or game"
          className="h-10"
        />
        <Select
          value={filter}
          onValueChange={(value) => setFilter(value as FilterValue)}
        >
          <SelectTrigger className="h-10 w-full md:w-56">
            <SelectValue placeholder="Filter artwork" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All artwork</SelectItem>
            <SelectItem value="roblox">Roblox artwork</SelectItem>
            <SelectItem value="manual">Manual artwork</SelectItem>
            <SelectItem value="placeholder">Placeholder</SelectItem>
            <SelectItem value="no_match">No match</SelectItem>
            <SelectItem value="ambiguous">Ambiguous</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
        <span>{assets.length} products</span>
        <span>/</span>
        <span>{counts.manual} manual</span>
        <span>{counts.roblox} Roblox</span>
        <span>{counts.placeholder} placeholder</span>
        <span>{counts.no_match} no match</span>
        <span>{counts.ambiguous} ambiguous</span>
      </div>

      <div className="surface-premium overflow-hidden rounded-2xl">
        <div className="border-b px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:grid md:grid-cols-[minmax(18rem,1fr)_minmax(15rem,0.9fr)_minmax(18rem,1.1fr)]">
          <span>Product</span>
          <span className="hidden md:block">Status</span>
          <span className="hidden md:block">Actions</span>
        </div>
        {filteredAssets.length > 0 ? (
          filteredAssets.map((asset) => (
            <ProductAssetRow key={asset.id} asset={asset} />
          ))
        ) : (
          <div className="p-8 text-center">
            <p className="font-heading text-sm font-semibold">
              No matching products.
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Adjust the search or artwork filter.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
