"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  Gamepad2,
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  resetProductLayoutAction,
  saveProductDisplayNameAction,
  saveProductLayoutAction,
} from "@/app/admin/(protected)/catalog-layout/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  CatalogLayoutGame,
  CatalogProductLayoutData,
  CatalogProductLayoutProduct,
  CatalogProductLayoutSection,
} from "@/lib/queries/catalog-layout";
import { formatPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { PRODUCT_AVAILABILITY_LABELS } from "@/types/store-operations";

const UNCATEGORIZED_ID = "__uncategorized";
const MAX_SECTION_NAME_LENGTH = 48;
const MAX_DISPLAY_NAME_LENGTH = 80;

type EditableSection = CatalogProductLayoutSection;
type EditableProduct = CatalogProductLayoutProduct;

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function normalizeSections(sections: EditableSection[]) {
  return sections.map((section, index) => ({
    ...section,
    name: section.name.trim(),
    sortOrder: index,
  }));
}

function normalizeProducts(products: EditableProduct[], sections: EditableSection[]) {
  const orderedSections = [
    ...sections.map((section) => section.id),
    UNCATEGORIZED_ID,
  ];
  let normalized: EditableProduct[] = [];

  for (const sectionId of orderedSections) {
    const productsInSection = products.filter((product) =>
      sectionId === UNCATEGORIZED_ID
        ? product.sectionId === null
        : product.sectionId === sectionId,
    );
    normalized = [
      ...normalized,
      ...productsInSection.map((product, index) => ({
        ...product,
        sortOrder: index,
      })),
    ];
  }

  return normalized;
}

function snapshotLayout(sections: EditableSection[], products: EditableProduct[]) {
  return JSON.stringify({
    sections: normalizeSections(sections).map(({ id, name, sortOrder }) => ({
      id,
      name,
      sortOrder,
    })),
    products: normalizeProducts(products, sections).map(
      ({ id, sectionId, sortOrder }) => ({
        id,
        sectionId,
        sortOrder,
      }),
    ),
  });
}

function ProductThumb({ product }: { product: EditableProduct }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="bg-muted relative size-10 shrink-0 overflow-hidden rounded-lg">
      {product.artworkUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.artworkUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <Gamepad2 className="text-muted-foreground absolute inset-0 m-auto size-4" />
      )}
    </div>
  );
}

function ProductRow({
  product,
  sections,
  index,
  total,
  disabled,
  orderDisabled,
  onMove,
  onMoveSection,
  onDisplayNameChange,
  onDragStart,
  onDrop,
}: {
  product: EditableProduct;
  sections: EditableSection[];
  index: number;
  total: number;
  disabled: boolean;
  orderDisabled: boolean;
  onMove: (fromIndex: number, toIndex: number) => void;
  onMoveSection: (productId: string, sectionId: string | null) => void;
  onDisplayNameChange: (productId: string, displayName: string | null) => void;
  onDragStart: (index: number) => void;
  onDrop: (index: number) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(product.displayName ?? "");
  const [namePending, startNameTransition] = useTransition();
  const customerName = product.displayName?.trim() || product.name;

  function saveDisplayName(displayName: string | null) {
    startNameTransition(async () => {
      const result = await saveProductDisplayNameAction({
        gamepassId: product.id,
        displayName,
      });

      if (result.success) {
        const normalizedDisplayName = displayName?.trim() || null;
        onDisplayNameChange(product.id, normalizedDisplayName);
        setDraftName(normalizedDisplayName ?? "");
        setEditingName(false);
        toast.success(
          normalizedDisplayName
            ? "Display name saved."
            : "Display name reset.",
        );
      } else {
        toast.error(result.error ?? "Display name was not saved.");
      }
    });
  }

  return (
    <div
      draggable={!disabled && !orderDisabled}
      onDragStart={() => onDragStart(index)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(index)}
      className="grid gap-3 border-b p-2.5 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <GripVertical
          className={cn(
            "text-muted-foreground size-4 shrink-0",
            orderDisabled ? "opacity-30" : "cursor-grab",
          )}
        />
        <ProductThumb product={product} />
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{customerName}</p>
            {product.displayName && (
              <Badge variant="secondary" className="h-5">
                Display name
              </Badge>
            )}
          </div>
          {product.displayName && (
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              Original: {product.name}
            </p>
          )}
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span>{product.robuxAmount.toLocaleString()} R$</span>
            <span>{formatPrice(product.price)}</span>
            <Badge variant="outline" className="h-5">
              {PRODUCT_AVAILABILITY_LABELS[product.availabilityStatus]}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || namePending}
          onClick={() => {
            setDraftName(product.displayName ?? "");
            setEditingName((current) => !current);
          }}
        >
          <Pencil className="size-3.5" />
          Edit Display Name
        </Button>
        <select
          value={product.sectionId ?? UNCATEGORIZED_ID}
          disabled={disabled}
          onChange={(event) =>
            onMoveSection(
              product.id,
              event.target.value === UNCATEGORIZED_ID
                ? null
                : event.target.value,
            )
          }
          className="border-input bg-background h-8 min-w-36 rounded-lg border px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name || "Untitled category"}
            </option>
          ))}
          <option value={UNCATEGORIZED_ID}>Uncategorized</option>
        </select>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={disabled || orderDisabled || index === 0}
            onClick={() => onMove(index, index - 1)}
            aria-label={`Move ${product.name} up`}
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={disabled || orderDisabled || index === total - 1}
            onClick={() => onMove(index, index + 1)}
            aria-label={`Move ${product.name} down`}
          >
            <ArrowDown className="size-3.5" />
          </Button>
        </div>
      </div>

      {editingName && (
        <div className="bg-muted/40 grid gap-2 rounded-xl p-3 sm:col-span-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="grid gap-1 text-xs font-medium">
            <span>
              Display Name{" "}
              <span className="text-muted-foreground font-normal">
                Original: {product.name}
              </span>
            </span>
            <Input
              value={draftName}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              disabled={disabled || namePending}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder={product.name}
              className="h-9 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || namePending || !product.displayName}
              onClick={() => saveDisplayName(null)}
            >
              Reset to Original
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={disabled || namePending}
              onClick={() => saveDisplayName(draftName)}
            >
              {namePending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function buildInitialLayouts(productLayout: CatalogProductLayoutData) {
  return new Map(
    productLayout.games.map((game) => [
      game.gameId,
      {
        sections: game.sections,
        products: game.products,
        hasCustomLayout: game.hasCustomLayout,
      },
    ]),
  );
}

export function ProductLayoutManager({
  games,
  productLayout,
}: {
  games: CatalogLayoutGame[];
  productLayout: CatalogProductLayoutData;
}) {
  const initialLayouts = useMemo(
    () => buildInitialLayouts(productLayout),
    [productLayout],
  );
  const [selectedGameId, setSelectedGameId] = useState(games[0]?.id ?? "");
  const [layouts, setLayouts] = useState(initialLayouts);
  const [savedSnapshots, setSavedSnapshots] = useState(() => {
    const snapshots = new Map<string, string>();
    for (const [gameId, layout] of initialLayouts.entries()) {
      snapshots.set(gameId, snapshotLayout(layout.sections, layout.products));
    }
    return snapshots;
  });
  const [query, setQuery] = useState("");
  const [categoryDragIndex, setCategoryDragIndex] = useState<number | null>(null);
  const [productDrag, setProductDrag] = useState<{
    sectionId: string;
    index: number;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedGame = games.find((game) => game.id === selectedGameId) ?? games[0];
  const selectedLayout = selectedGame
    ? layouts.get(selectedGame.id) ?? { sections: [], products: [], hasCustomLayout: false }
    : { sections: [], products: [], hasCustomLayout: false };
  const sections = selectedLayout.sections;
  const products = selectedLayout.products;
  const normalizedQuery = query.trim().toLowerCase();
  const currentSnapshot = selectedGame
    ? snapshotLayout(sections, products)
    : "";
  const savedSnapshot = selectedGame
    ? savedSnapshots.get(selectedGame.id) ?? ""
    : "";
  const dirty = currentSnapshot !== savedSnapshot;

  function updateSelectedLayout(
    updater: (layout: {
      sections: EditableSection[];
      products: EditableProduct[];
      hasCustomLayout: boolean;
    }) => {
      sections: EditableSection[];
      products: EditableProduct[];
      hasCustomLayout: boolean;
    },
  ) {
    if (!selectedGame) return;
    setLayouts((current) => {
      const next = new Map(current);
      const layout =
        next.get(selectedGame.id) ?? {
          sections: [],
          products: [],
          hasCustomLayout: false,
        };
      next.set(selectedGame.id, updater(layout));
      return next;
    });
  }

  function addCategory() {
    if (!selectedGame) return;
    const id = crypto.randomUUID();
    updateSelectedLayout((layout) => ({
      ...layout,
      sections: [
        ...layout.sections,
        {
          id,
          gameId: selectedGame.id,
          name: "New Category",
          sortOrder: layout.sections.length,
        },
      ],
      hasCustomLayout: true,
    }));
  }

  function renameCategory(id: string, name: string) {
    updateSelectedLayout((layout) => ({
      ...layout,
      sections: layout.sections.map((section) =>
        section.id === id ? { ...section, name } : section,
      ),
      hasCustomLayout: true,
    }));
  }

  function deleteCategory(section: EditableSection) {
    const count = products.filter((product) => product.sectionId === section.id).length;
    if (
      !window.confirm(
        `Delete "${section.name}"?\n\n${count} product${
          count === 1 ? "" : "s"
        } will be moved to Uncategorized.\nNo products will be deleted.`,
      )
    ) {
      return;
    }

    updateSelectedLayout((layout) => ({
      ...layout,
      sections: normalizeSections(
        layout.sections.filter((item) => item.id !== section.id),
      ),
      products: layout.products.map((product) =>
        product.sectionId === section.id
          ? { ...product, sectionId: null }
          : product,
      ),
      hasCustomLayout: true,
    }));
  }

  function moveCategory(fromIndex: number, toIndex: number) {
    updateSelectedLayout((layout) => ({
      ...layout,
      sections: normalizeSections(moveItem(layout.sections, fromIndex, toIndex)),
      hasCustomLayout: true,
    }));
  }

  function moveProductWithinSection(
    sectionId: string,
    fromIndex: number,
    toIndex: number,
  ) {
    if (normalizedQuery) return;
    updateSelectedLayout((layout) => {
      const sectionProducts = layout.products.filter((product) =>
        sectionId === UNCATEGORIZED_ID
          ? product.sectionId === null
          : product.sectionId === sectionId,
      );
      const moved = moveItem(sectionProducts, fromIndex, toIndex);
      let cursor = 0;
      const productsInOtherSections = layout.products.filter((product) =>
        sectionId === UNCATEGORIZED_ID
          ? product.sectionId !== null
          : product.sectionId !== sectionId,
      );
      return {
        ...layout,
        products: normalizeProducts(
          [
            ...productsInOtherSections,
            ...moved.map((product) => ({ ...product, sortOrder: cursor++ })),
          ],
          layout.sections,
        ),
        hasCustomLayout: true,
      };
    });
  }

  function moveProductToSection(productId: string, sectionId: string | null) {
    updateSelectedLayout((layout) => {
      const movedProduct = layout.products.find((product) => product.id === productId);
      if (!movedProduct) return layout;
      const nextProducts = [
        ...layout.products.filter((product) => product.id !== productId),
        { ...movedProduct, sectionId },
      ];
      return {
        ...layout,
        products: normalizeProducts(nextProducts, layout.sections),
        hasCustomLayout: true,
      };
    });
  }

  function updateProductDisplayName(productId: string, displayName: string | null) {
    updateSelectedLayout((layout) => ({
      ...layout,
      products: layout.products.map((product) =>
        product.id === productId ? { ...product, displayName } : product,
      ),
    }));
  }

  function saveProductLayout() {
    if (!selectedGame) return;
    const trimmedSections = normalizeSections(sections);
    const invalidSection = trimmedSections.find(
      (section) =>
        !section.name ||
        section.name.length > MAX_SECTION_NAME_LENGTH,
    );
    if (invalidSection) {
      toast.error("Category names must be 1-48 characters.");
      return;
    }

    const normalizedProducts = normalizeProducts(products, trimmedSections);

    startTransition(async () => {
      const result = await saveProductLayoutAction({
        gameId: selectedGame.id,
        sections: trimmedSections,
        products: normalizedProducts.map((product) => ({
          gamepassId: product.id,
          sectionId: product.sectionId,
          sortOrder: product.sortOrder,
        })),
      });

      if (result.success) {
        updateSelectedLayout((layout) => ({
          ...layout,
          sections: trimmedSections,
          products: normalizedProducts,
          hasCustomLayout: true,
        }));
        setSavedSnapshots((current) => {
          const next = new Map(current);
          next.set(selectedGame.id, snapshotLayout(trimmedSections, normalizedProducts));
          return next;
        });
        toast.success("Product layout saved.");
      } else {
        toast.error(result.error ?? "Product layout was not saved.");
      }
    });
  }

  function resetProductLayout() {
    if (!selectedGame) return;
    if (
      !window.confirm(
        `Reset Product Layout for "${selectedGame.name}"?\n\nCustom categories and product ordering for this game will be removed. Products and prices will not be changed.`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await resetProductLayoutAction(selectedGame.id);
      if (result.success) {
        const resetProducts = products
          .map((product) => ({ ...product, sectionId: null }))
          .sort(
            (a, b) =>
              a.robuxAmount - b.robuxAmount ||
              a.name.localeCompare(b.name),
          )
          .map((product, index) => ({ ...product, sortOrder: index }));
        updateSelectedLayout((layout) => ({
          ...layout,
          sections: [],
          products: resetProducts,
          hasCustomLayout: false,
        }));
        setSavedSnapshots((current) => {
          const next = new Map(current);
          next.set(selectedGame.id, snapshotLayout([], resetProducts));
          return next;
        });
        toast.success("Product layout reset.");
      } else {
        toast.error(result.error ?? "Product layout was not reset.");
      }
    });
  }

  const displaySections = [
    ...sections.map((section) => ({
      id: section.id,
      name: section.name || "Untitled category",
      system: false,
      sortOrder: section.sortOrder,
    })),
    {
      id: UNCATEGORIZED_ID,
      name: "Uncategorized",
      system: true,
      sortOrder: sections.length,
    },
  ];

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            Product Layout
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Organize each game into customer-facing sections without changing
            XOB inventory, prices, or availability.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={dirty ? "default" : "outline"} className="h-8">
            {pending ? "Saving..." : dirty ? "Unsaved Changes" : "Saved"}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !selectedGame}
            onClick={resetProductLayout}
          >
            <RotateCcw className="size-3.5" />
            Reset Product Layout
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || !selectedGame || !dirty}
            onClick={saveProductLayout}
          >
            <Save className="size-3.5" />
            {pending ? "Saving..." : "Save Product Layout"}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
        <div className="grid gap-3 self-start">
          <label className="grid gap-1 text-sm font-medium">
            <span>Game</span>
            <select
              value={selectedGame?.id ?? ""}
              disabled={pending}
              onChange={(event) => {
                setSelectedGameId(event.target.value);
                setQuery("");
              }}
              className="border-input bg-background h-10 rounded-lg border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
          </label>

          <div className="surface-premium overflow-hidden rounded-2xl">
            <div className="border-b p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Categories</p>
                  <p className="text-muted-foreground text-xs">
                    Public section names
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending || !selectedGame}
                  onClick={addCategory}
                >
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>
            </div>
            {sections.length > 0 ? (
              sections.map((section, index) => (
                <div
                  key={section.id}
                  draggable={!pending}
                  onDragStart={() => setCategoryDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (categoryDragIndex === null) return;
                    moveCategory(categoryDragIndex, index);
                    setCategoryDragIndex(null);
                  }}
                  className="grid gap-2 border-b p-3 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="text-muted-foreground size-4 shrink-0 cursor-grab" />
                    <Input
                      value={section.name}
                      maxLength={MAX_SECTION_NAME_LENGTH}
                      disabled={pending}
                      onChange={(event) =>
                        renameCategory(section.id, event.target.value)
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      disabled={pending || index === 0}
                      onClick={() => moveCategory(index, index - 1)}
                      aria-label={`Move ${section.name} up`}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      disabled={pending || index === sections.length - 1}
                      onClick={() => moveCategory(index, index + 1)}
                      aria-label={`Move ${section.name} down`}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => deleteCategory(section)}
                      aria-label={`Delete ${section.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-5 text-sm">
                <p className="font-medium">No custom categories.</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Products will use the default storefront grouping until a
                  layout is saved.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="relative max-w-sm">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products"
              className="h-10 pl-9"
            />
          </div>

          {normalizedQuery && (
            <p className="text-muted-foreground text-xs">
              Search is filtering rows only. Clear search to reorder products.
            </p>
          )}

          <div className="grid gap-4">
            {displaySections.map((section) => {
              const sectionProducts = products.filter((product) => {
                const sameSection =
                  section.id === UNCATEGORIZED_ID
                    ? product.sectionId === null
                    : product.sectionId === section.id;
                if (!sameSection) return false;
                if (!normalizedQuery) return true;
                return (
                  product.name.toLowerCase().includes(normalizedQuery) ||
                  (product.displayName ?? "")
                    .toLowerCase()
                    .includes(normalizedQuery)
                );
              });

              if (section.system && sectionProducts.length === 0 && !normalizedQuery) {
                return null;
              }

              return (
                <div key={section.id} className="surface-premium overflow-hidden rounded-2xl">
                  <div className="bg-muted/50 flex items-center justify-between gap-3 border-b px-3 py-2.5">
                    <div>
                      <h3 className="text-sm font-semibold">{section.name}</h3>
                      <p className="text-muted-foreground text-xs">
                        {sectionProducts.length} product
                        {sectionProducts.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    {section.system && (
                      <Badge variant="outline" className="h-6">
                        Default
                      </Badge>
                    )}
                  </div>

                  {sectionProducts.length > 0 ? (
                    sectionProducts.map((product, index) => (
                      <ProductRow
                        key={product.id}
                        product={product}
                        sections={sections}
                        index={index}
                        total={sectionProducts.length}
                        disabled={pending}
                        orderDisabled={Boolean(normalizedQuery)}
                        onMove={(fromIndex, toIndex) =>
                          moveProductWithinSection(section.id, fromIndex, toIndex)
                        }
                        onMoveSection={moveProductToSection}
                        onDisplayNameChange={updateProductDisplayName}
                        onDragStart={(dragIndex) =>
                          setProductDrag({ sectionId: section.id, index: dragIndex })
                        }
                        onDrop={(dropIndex) => {
                          if (!productDrag || productDrag.sectionId !== section.id) {
                            return;
                          }
                          moveProductWithinSection(
                            section.id,
                            productDrag.index,
                            dropIndex,
                          );
                          setProductDrag(null);
                        }}
                      />
                    ))
                  ) : (
                    <div className="p-5 text-sm">
                      <p className="font-medium">No products here.</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Move products into this category using the row dropdown.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
