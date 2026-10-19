"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Gamepad2, LayoutGrid, PackagePlus, Search, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProductCardViewerContext, ProductRecommendationCard } from "@/components/chat/product-card";
import type { ChatMessageDto } from "@/lib/chat/dto.mjs";
import type { ProductCardDto } from "@/lib/chat/recommendation.mjs";
import { fetchJson, jsonInit, newClientId, RequestError } from "@/lib/chat/client/fetch-json";
import { formatPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

interface GameOption {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  available: boolean;
  productCount: number;
}
interface ProductOption {
  id: string;
  gameId: string;
  gameName: string;
  gameSlug: string;
  name: string;
  price: number;
  robuxAmount: number;
  imageUrl: string | null;
  available: boolean;
}
type Catalog = { games: GameOption[]; products: ProductOption[] };
type Mode = "game" | "product";

// Shared by every open chat in this tab; refreshed after a minute.
const CATALOG_TTL_MS = 60_000;
let catalogCache: { at: number; data: Catalog } | null = null;
let catalogRequest: Promise<Catalog> | null = null;

function loadCatalog(force = false): Promise<Catalog> {
  if (!force && catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return Promise.resolve(catalogCache.data);
  catalogRequest ??= fetchJson<Catalog>("/api/admin/catalog/picker")
    .then((data) => {
      catalogCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      catalogRequest = null;
    });
  return catalogRequest;
}

const MAX_RESULTS = 60;

function matches(haystack: string, tokens: string[]) {
  const text = haystack.toLowerCase();
  return tokens.every((token) => text.includes(token));
}

/**
 * "Send from catalog" in the admin composer (0033): a whole game's
 * pricelist, or one specific product, as a card the customer taps to order.
 * Only real catalog items can be chosen; the server rebuilds the card from
 * the live catalog when it is sent. The preview is exactly the customer's
 * card.
 */
export function ProductPickerDialog({ orderNumber, onSent }: { orderNumber: string; onSent: (message: ChatMessageDto) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("game");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [catalog, setCatalog] = useState<Catalog | null>(catalogCache?.data ?? null);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // One id per chosen item: a double-click or a retry sends one card.
  const clientMessageId = useMemo(() => (selectedId ? newClientId() : ""), [selectedId]);

  useEffect(() => {
    if (!open) return;
    setLoadError(false);
    loadCatalog()
      .then(setCatalog)
      .catch(() => setLoadError(true));
  }, [open]);

  const tokens = deferredQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const games = useMemo(
    () => (catalog?.games ?? []).filter((game) => matches(game.name, tokens)).slice(0, MAX_RESULTS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, deferredQuery],
  );
  const products = useMemo(
    () =>
      (catalog?.products ?? [])
        .filter((product) => matches(`${product.name} ${product.gameName} ${product.robuxAmount}`, tokens))
        .slice(0, MAX_RESULTS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, deferredQuery],
  );

  const selectedGame = mode === "game" ? (catalog?.games.find((game) => game.id === selectedId) ?? null) : null;
  const selectedProduct = mode === "product" ? (catalog?.products.find((product) => product.id === selectedId) ?? null) : null;
  const preview: ProductCardDto | null = selectedGame
    ? {
        type: "game",
        gameName: selectedGame.name,
        gameSlug: selectedGame.slug,
        gameImageUrl: selectedGame.imageUrl,
        gamepassId: null,
        productName: null,
        productImageUrl: null,
        price: null,
        sentPrice: null,
        priceChanged: false,
        robuxAmount: null,
        status: selectedGame.available ? "available" : "unavailable",
        orderedAs: null,
      }
    : selectedProduct
      ? {
          type: "product",
          gameName: selectedProduct.gameName,
          gameSlug: selectedProduct.gameSlug,
          gameImageUrl: null,
          gamepassId: selectedProduct.id,
          productName: selectedProduct.name,
          productImageUrl: selectedProduct.imageUrl,
          price: selectedProduct.price,
          sentPrice: selectedProduct.price,
          priceChanged: false,
          robuxAmount: selectedProduct.robuxAmount,
          status: selectedProduct.available ? "available" : "unavailable",
          orderedAs: null,
        }
      : null;

  function reset() {
    setSelectedId(null);
    setQuery("");
  }

  function switchMode(next: Mode) {
    setMode(next);
    setSelectedId(null);
    requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
  }

  async function send() {
    if (sending || (!selectedGame && !selectedProduct)) return;
    setSending(true);
    try {
      const body = await fetchJson<{ message: ChatMessageDto }>(
        `/api/admin/orders/${encodeURIComponent(orderNumber)}/recommendations`,
        jsonInit(
          "POST",
          selectedProduct
            ? { type: "product", gameId: selectedProduct.gameId, gamepassId: selectedProduct.id, clientMessageId }
            : { type: "game", gameId: selectedGame!.id, clientMessageId },
        ),
      );
      onSent(body.message);
      toast.success(selectedProduct ? "Product sent. The customer can order it from the chat." : "Pricelist sent.");
      setOpen(false);
      reset();
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) void loadCatalog(true).then(setCatalog).catch(() => undefined);
      toast.error(error instanceof RequestError ? error.message : "Could not send. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const list = mode === "game" ? games : products;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-10 shrink-0 gap-1.5 rounded-lg px-3 text-xs"
          aria-label="Send from catalog"
          title="Send a pricelist or product"
          data-testid="product-picker-trigger"
        >
          <PackagePlus className="size-4" />
          <span>Products</span>
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(event) => {
            // Phones: no keyboard over the list until they tap the search.
            if (!window.matchMedia("(min-width: 640px)").matches) event.preventDefault();
          }}
          className={cn(
            "bg-background fixed z-50 flex flex-col shadow-2xl outline-none",
            // Phone: a bottom sheet. Desktop: a centered panel.
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)]",
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[min(88dvh,46rem)] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-0",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4 sm:data-[state=open]:zoom-in-[0.98] sm:data-[state=open]:slide-in-from-bottom-0 duration-200 motion-reduce:animate-none",
          )}
          data-testid="product-picker"
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-zinc-300 sm:hidden dark:bg-zinc-700" aria-hidden />
          <div className="flex items-start justify-between gap-3 px-5 pt-3 sm:pt-5">
            <div>
              <DialogPrimitive.Title className="font-heading text-lg font-semibold">Send from catalog</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-muted-foreground mt-0.5 text-sm">
                The customer taps the card to order. Prices are always current.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="hover:bg-muted -mr-1.5 rounded-full p-2" aria-label="Close">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="px-5 pt-4">
            <div className="bg-muted grid grid-cols-2 gap-1 rounded-xl p-1" role="tablist" aria-label="What to send">
              {(
                [
                  ["game", "Game pricelist", LayoutGrid],
                  ["product", "Specific product", Sparkles],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => switchMode(value)}
                  className={cn(
                    "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold transition-[background-color,color,box-shadow] duration-150",
                    mode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            <label className="relative mt-3 block">
              <span className="sr-only">Search</span>
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && list[0] && !selectedId) {
                    event.preventDefault();
                    setSelectedId(list[0].id);
                  }
                }}
                placeholder={mode === "game" ? "Search games…" : "Search products or games…"}
                className="border-input focus-visible:ring-ring/40 h-11 w-full rounded-xl border pr-3 pl-9 text-base outline-none focus-visible:ring-3 sm:text-sm"
                data-testid="product-picker-search"
              />
            </label>
          </div>

          <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2" role="listbox" aria-label={mode === "game" ? "Games" : "Products"}>
            {loadError ? (
              <div className="text-muted-foreground py-10 text-center text-sm">
                Couldn&apos;t load the catalog.{" "}
                <button
                  type="button"
                  className="text-primary font-semibold underline"
                  onClick={() => {
                    setLoadError(false);
                    loadCatalog(true).then(setCatalog).catch(() => setLoadError(true));
                  }}
                >
                  Try again
                </button>
              </div>
            ) : !catalog ? (
              <ul className="space-y-1 px-2 pt-1" aria-busy="true" aria-label="Loading catalog">
                {Array.from({ length: 6 }, (_, index) => (
                  <li key={index} className="flex items-center gap-3 py-2">
                    <span className="bg-muted size-11 animate-pulse rounded-xl" />
                    <span className="flex-1 space-y-1.5">
                      <span className="bg-muted block h-3.5 w-2/3 animate-pulse rounded" />
                      <span className="bg-muted block h-3 w-1/3 animate-pulse rounded" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : list.length === 0 ? (
              <p className="text-muted-foreground py-10 text-center text-sm">Nothing matches “{query.trim()}”.</p>
            ) : mode === "game" ? (
              games.map((game) => (
                <OptionRow
                  key={game.id}
                  selected={selectedId === game.id}
                  disabled={!game.available}
                  onSelect={() => setSelectedId(game.id)}
                  image={game.imageUrl}
                  title={game.name}
                  subtitle={game.available ? `${game.productCount} item${game.productCount === 1 ? "" : "s"}` : "Unavailable right now"}
                />
              ))
            ) : (
              products.map((product) => (
                <OptionRow
                  key={product.id}
                  selected={selectedId === product.id}
                  disabled={!product.available}
                  onSelect={() => setSelectedId(product.id)}
                  image={product.imageUrl}
                  title={product.name}
                  subtitle={`${product.gameName}${product.robuxAmount ? ` · ${product.robuxAmount.toLocaleString()} Robux` : ""}`}
                  trailing={product.available ? formatPrice(product.price) : "Unavailable"}
                />
              ))
            )}
          </div>

          <div className="border-border/60 bg-muted/30 border-t px-5 pt-3 pb-4">
            {preview ? (
              <div className="bw-card-in" key={selectedId}>
                <p className="text-muted-foreground mb-2 text-[11px] font-bold tracking-wider uppercase">Customer sees</p>
                <div className="pointer-events-none flex justify-center">
                  <ProductCardViewerContext.Provider value="customer">
                    <ProductRecommendationCard card={preview} messageId="" createdAt="" isMine={false} />
                  </ProductCardViewerContext.Provider>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground flex items-center justify-center gap-1.5 py-2 text-xs">
                <Gamepad2 className="size-3.5" aria-hidden />
                {mode === "game" ? "Choose a game to send its full pricelist." : "Choose the exact product to send."}
              </p>
            )}
            <Button
              type="button"
              className="mt-3 h-11 w-full gap-1.5"
              disabled={!preview || preview.status !== "available" || sending}
              onClick={() => void send()}
              data-testid="product-picker-send"
            >
              <Send className="size-4" aria-hidden />
              {sending ? "Sending…" : selectedProduct ? "Send product" : "Send pricelist"}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function OptionRow({
  selected,
  disabled,
  onSelect,
  image,
  title,
  subtitle,
  trailing,
}: {
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  image: string | null;
  title: string;
  subtitle: string;
  trailing?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors duration-100",
        selected ? "bg-primary/10 ring-primary/40 ring-1" : "hover:bg-muted/70",
        disabled && "opacity-50",
      )}
    >
      <span className="bg-muted flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- catalog artwork from several hosts
          <img src={image} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <Gamepad2 className="text-muted-foreground size-5" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground block truncate text-xs">{subtitle}</span>
      </span>
      {trailing && <span className="shrink-0 text-sm font-semibold [font-variant-numeric:tabular-nums]">{trailing}</span>}
    </button>
  );
}
