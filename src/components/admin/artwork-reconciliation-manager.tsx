"use client";

import { useMemo, useState, useTransition } from "react";
import { Gamepad2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { relinkProductArtworkOverrideAction } from "@/app/admin/(protected)/product-assets/actions";
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
  ArtworkReconciliationCandidate,
  OrphanedArtworkOverride,
} from "@/lib/queries/artwork-reconciliation";
import { cn } from "@/lib/utils";

function ArtworkPreview({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-xl">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
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

function ManualPicker({
  allProducts,
  onPick,
}: {
  allProducts: ArtworkReconciliationCandidate[];
  onPick: (gamepassId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return allProducts
      .filter(
        (p) =>
          p.name.toLowerCase().includes(normalized) ||
          p.gameName.toLowerCase().includes(normalized),
      )
      .slice(0, 8);
  }, [allProducts, query]);

  return (
    <div className="grid gap-1.5">
      <Input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(null);
        }}
        placeholder="Search current products by name or game"
        className="h-9 text-xs"
      />
      {filtered.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg border">
          {filtered.map((p) => (
            <button
              key={p.gamepassId}
              type="button"
              onClick={() => {
                setSelected(p.gamepassId);
                setQuery(`${p.name} — ${p.gameName}`);
              }}
              className={cn(
                "hover:bg-muted block w-full truncate px-2.5 py-1.5 text-left text-xs",
                selected === p.gamepassId && "bg-muted",
              )}
            >
              {p.name}{" "}
              <span className="text-muted-foreground">— {p.gameName}</span>
            </button>
          ))}
        </div>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!selected}
        onClick={() => selected && onPick(selected)}
      >
        <Link2 className="size-3.5" />
        Relink to selected product
      </Button>
    </div>
  );
}

function OrphanRow({
  orphan,
  allProducts,
  onResolved,
}: {
  orphan: OrphanedArtworkOverride;
  allProducts: ArtworkReconciliationCandidate[];
  onResolved: (oldGamepassId: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [chosenCandidate, setChosenCandidate] = useState<string | null>(
    orphan.candidates[0]?.gamepassId ?? null,
  );

  function relink(newGamepassId: string) {
    startTransition(async () => {
      const result = await relinkProductArtworkOverrideAction(
        orphan.oldGamepassId,
        newGamepassId,
      );
      if (result.success) {
        toast.success("Artwork relinked.");
        onResolved(orphan.oldGamepassId);
      } else {
        toast.error(result.error ?? "Could not relink artwork.");
      }
    });
  }

  return (
    <div className="grid gap-3 border-b p-3 last:border-b-0 md:grid-cols-[minmax(16rem,1fr)_minmax(18rem,1.2fr)] md:items-center">
      <div className="flex min-w-0 gap-3">
        <ArtworkPreview src={orphan.iconUrl} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {orphan.productName ?? "Unknown product"}
          </p>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {orphan.gameName ?? "Uploaded before name tracking was added"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="ghost" className="bg-primary/10 text-primary h-6">
              {orphan.source === "manual" && orphan.manualKind === "upload"
                ? "Manual upload"
                : orphan.source === "manual"
                  ? "Manual URL copy"
                  : "Forced placeholder"}
            </Badge>
            <Badge variant="outline" className="h-6">
              orphaned {new Date(orphan.updatedAt).toLocaleDateString()}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        {orphan.matchType === "exact-one" && orphan.candidates[0] && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Matched:</span>
            <span className="font-medium">
              {orphan.candidates[0].name} — {orphan.candidates[0].gameName}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => relink(orphan.candidates[0].gamepassId)}
            >
              <Link2 className="size-3.5" />
              Relink
            </Button>
          </div>
        )}

        {orphan.matchType === "multiple" && (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={chosenCandidate ?? undefined}
              onValueChange={setChosenCandidate}
            >
              <SelectTrigger className="h-9 w-full text-xs md:w-64">
                <SelectValue placeholder="Choose the matching product" />
              </SelectTrigger>
              <SelectContent>
                {orphan.candidates.map((c) => (
                  <SelectItem key={c.gamepassId} value={c.gamepassId}>
                    {c.name} — {c.gameName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              disabled={pending || !chosenCandidate}
              onClick={() => chosenCandidate && relink(chosenCandidate)}
            >
              <Link2 className="size-3.5" />
              Relink
            </Button>
          </div>
        )}

        {(orphan.matchType === "none" || orphan.matchType === "no-snapshot") && (
          <ManualPicker allProducts={allProducts} onPick={relink} />
        )}
      </div>
    </div>
  );
}

export function ArtworkReconciliationManager({
  orphans,
  allProducts,
}: {
  orphans: OrphanedArtworkOverride[];
  allProducts: ArtworkReconciliationCandidate[];
}) {
  const [remaining, setRemaining] = useState(orphans);

  if (remaining.length === 0) {
    return (
      <div className="surface-premium rounded-2xl p-8 text-center">
        <p className="font-heading text-sm font-semibold">
          No orphaned artwork.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          Every artwork override still points at a live product.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-muted-foreground text-xs">
        {remaining.length} orphaned override{remaining.length === 1 ? "" : "s"}{" "}
        — the product these were saved for no longer exists under that id,
        usually because it was re-imported with a new one.
      </div>
      <div className="surface-premium overflow-hidden rounded-2xl">
        {remaining.map((orphan) => (
          <OrphanRow
            key={orphan.oldGamepassId}
            orphan={orphan}
            allProducts={allProducts}
            onResolved={(oldId) =>
              setRemaining((prev) => prev.filter((o) => o.oldGamepassId !== oldId))
            }
          />
        ))}
      </div>
    </div>
  );
}
