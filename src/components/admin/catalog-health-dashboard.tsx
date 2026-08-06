"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ExternalLink,
  ImageIcon,
  Info,
  RotateCcw,
  Search,
  ShieldAlert,
} from "lucide-react";
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
  CatalogHealthArtworkSource,
  CatalogHealthConfigStatus,
  CatalogHealthData,
  CatalogHealthIssue,
  CatalogHealthMatchStatus,
  CatalogHealthSeverity,
} from "@/lib/queries/catalog-health";
import { cn } from "@/lib/utils";

type AllValue = "all";

const severityLabels: Record<CatalogHealthSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
  information: "Information",
  healthy: "Healthy",
};

const severityClasses: Record<CatalogHealthSeverity, string> = {
  critical: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  information: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  healthy: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

const artworkLabels: Record<CatalogHealthArtworkSource, string> = {
  manual_override: "Manual",
  roblox_cache: "Roblox",
  forced_placeholder: "Forced placeholder",
  normal_placeholder: "Normal placeholder",
  broken_manual_override: "Broken manual",
  broken_roblox_cache: "Broken Roblox",
  not_available: "Not available",
};

const matchLabels: Record<CatalogHealthMatchStatus, string> = {
  matched: "Matched",
  no_match: "No match",
  ambiguous: "Ambiguous",
  no_sync_record: "No sync record",
  not_available: "Not available",
};

const configLabels: Record<CatalogHealthConfigStatus, string> = {
  configured: "Configured",
  not_configured: "Not configured",
  special_store_route: "Special Store route",
  not_available: "Not available",
};

const badgeClasses: Record<string, string> = {
  available: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  temporarily_unavailable: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  out_of_stock: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  coming_soon: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  hidden: "bg-muted text-muted-foreground",
  inactive: "bg-muted text-muted-foreground",
  not_visible: "bg-muted text-muted-foreground",
  missing: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  manual_override: "bg-primary/10 text-primary",
  roblox_cache: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  forced_placeholder: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  normal_placeholder: "bg-muted text-muted-foreground",
  broken_manual_override: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  broken_roblox_cache: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  matched: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  no_match: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  ambiguous: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  no_sync_record: "bg-muted text-muted-foreground",
  configured: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  not_configured: "bg-muted text-muted-foreground",
  special_store_route: "bg-primary/10 text-primary",
};

function formatNumber(value: number) {
  return value.toLocaleString();
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function titleCaseStatus(value: string) {
  return value.replaceAll("_", " ");
}

function StatusBadge({ value, label }: { value: string; label?: string }) {
  return (
    <Badge
      variant="ghost"
      className={cn("h-6 capitalize", badgeClasses[value])}
    >
      {label ?? titleCaseStatus(value)}
    </Badge>
  );
}

function SeverityBadge({ value }: { value: CatalogHealthIssue["severity"] }) {
  return (
    <Badge variant="ghost" className={cn("h-6", severityClasses[value])}>
      {severityLabels[value]}
    </Badge>
  );
}

function MetricCard({
  label,
  value,
  help,
  unavailableReason,
}: {
  label: string;
  value: number | null;
  help?: string;
  unavailableReason?: string;
}) {
  return (
    <div className="surface-premium rounded-2xl p-3">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="font-heading mt-1 text-2xl font-semibold tracking-tight">
        {value === null ? "Not available" : formatNumber(value)}
      </p>
      {(help || unavailableReason) && (
        <p className="text-muted-foreground mt-1 text-xs leading-snug">
          {unavailableReason ?? help}
        </p>
      )}
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="surface-premium rounded-2xl p-6 text-center">
      <p className="font-heading text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground mt-1 text-sm">{detail}</p>
    </div>
  );
}

function SectionHeading({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div>
      <h2 className="font-heading text-lg font-semibold tracking-tight">{title}</h2>
      {detail && <p className="text-muted-foreground mt-1 text-sm">{detail}</p>}
    </div>
  );
}

export function CatalogHealthDashboard({ data }: { data: CatalogHealthData }) {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<
    AllValue | CatalogHealthIssue["severity"]
  >("all");
  const [issueTypeFilter, setIssueTypeFilter] = useState<AllValue | string>("all");
  const [gameFilter, setGameFilter] = useState<AllValue | string>("all");
  const [productAvailabilityFilter, setProductAvailabilityFilter] =
    useState<AllValue | string>("all");
  const [gameAvailabilityFilter, setGameAvailabilityFilter] =
    useState<AllValue | string>("all");
  const [artworkFilter, setArtworkFilter] =
    useState<AllValue | CatalogHealthArtworkSource>("all");
  const [matchFilter, setMatchFilter] =
    useState<AllValue | CatalogHealthMatchStatus>("all");
  const [configFilter, setConfigFilter] =
    useState<AllValue | CatalogHealthConfigStatus>("all");

  const normalizedSearch = search.trim().toLowerCase();

  function resetFilters() {
    setSearch("");
    setSeverityFilter("all");
    setIssueTypeFilter("all");
    setGameFilter("all");
    setProductAvailabilityFilter("all");
    setGameAvailabilityFilter("all");
    setArtworkFilter("all");
    setMatchFilter("all");
    setConfigFilter("all");
  }

  const filteredIssues = useMemo(() => {
    return data.issues.filter((issue) => {
      if (severityFilter !== "all" && issue.severity !== severityFilter) return false;
      if (issueTypeFilter !== "all" && issue.type !== issueTypeFilter) return false;
      if (gameFilter !== "all" && issue.gameId !== gameFilter) return false;
      if (
        productAvailabilityFilter !== "all" &&
        issue.productAvailability !== productAvailabilityFilter
      ) {
        return false;
      }
      if (
        gameAvailabilityFilter !== "all" &&
        issue.gameAvailability !== gameAvailabilityFilter
      ) {
        return false;
      }
      if (artworkFilter !== "all" && issue.artworkSource !== artworkFilter) return false;
      if (matchFilter !== "all" && issue.robloxMatchStatus !== matchFilter) return false;
      if (configFilter !== "all" && issue.configurationStatus !== configFilter) {
        return false;
      }
      if (!normalizedSearch) return true;
      return [
        issue.type,
        issue.gameName,
        issue.productName,
        issue.currentState,
        issue.whyItMatters,
        issue.recommendedAction,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [
    artworkFilter,
    configFilter,
    data.issues,
    gameAvailabilityFilter,
    gameFilter,
    issueTypeFilter,
    matchFilter,
    normalizedSearch,
    productAvailabilityFilter,
    severityFilter,
  ]);

  const filteredGames = useMemo(() => {
    return data.gameCoverage.filter((game) => {
      if (gameFilter !== "all" && game.gameId !== gameFilter) return false;
      if (
        gameAvailabilityFilter !== "all" &&
        game.rawAvailability !== gameAvailabilityFilter &&
        game.storefrontAvailability !== gameAvailabilityFilter
      ) {
        return false;
      }
      if (configFilter !== "all" && game.configurationStatus !== configFilter) {
        return false;
      }
      if (!normalizedSearch) return true;
      return game.gameName.toLowerCase().includes(normalizedSearch);
    });
  }, [configFilter, data.gameCoverage, gameAvailabilityFilter, gameFilter, normalizedSearch]);

  const filteredProducts = useMemo(() => {
    return data.productHealth.filter((product) => {
      if (gameFilter !== "all" && product.gameId !== gameFilter) return false;
      if (
        productAvailabilityFilter !== "all" &&
        product.rawAvailability !== productAvailabilityFilter &&
        product.storefrontAvailability !== productAvailabilityFilter
      ) {
        return false;
      }
      if (
        gameAvailabilityFilter !== "all" &&
        product.parentGameAvailability !== gameAvailabilityFilter
      ) {
        return false;
      }
      if (artworkFilter !== "all" && product.artworkSource !== artworkFilter) return false;
      if (matchFilter !== "all" && product.robloxMatchStatus !== matchFilter) return false;
      if (configFilter !== "all" && product.configurationStatus !== configFilter) {
        return false;
      }
      if (!normalizedSearch) return true;
      return `${product.productName} ${product.gameName}`
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [
    artworkFilter,
    configFilter,
    data.productHealth,
    gameAvailabilityFilter,
    gameFilter,
    matchFilter,
    normalizedSearch,
    productAvailabilityFilter,
  ]);

  const hasCritical = data.issues.some((issue) => issue.severity === "critical");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 mt-1 flex size-9 shrink-0 items-center justify-center rounded-xl">
            <Activity className="text-primary size-4" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Catalog Health
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              Read-only diagnostics for storefront visibility, pricing, artwork, Roblox sync coverage, and catalog relationships.
            </p>
          </div>
        </div>
        <div className="bg-muted/70 text-muted-foreground rounded-2xl px-3 py-2 text-xs">
          This page does not repair, disable, delete, sync, or mutate catalog data.
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {data.summary.map((metric) => (
          <MetricCard key={metric.id} {...metric} />
        ))}
      </section>

      <section className="surface-premium rounded-2xl p-4">
        <div className="flex items-start gap-2">
          {data.sourceStatus.every((source) => source.ok) ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold">Data sources</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.sourceStatus.map((source) => (
                <div
                  key={source.source}
                  className="bg-muted/50 rounded-xl px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{source.source}</span>
                    <StatusBadge
                      value={source.ok ? "matched" : "ambiguous"}
                      label={source.ok ? "OK" : "Check"}
                    />
                  </div>
                  {source.message && (
                    <p className="text-muted-foreground mt-1 line-clamp-2">
                      {source.message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1fr_10rem_12rem_12rem]">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search issue, game, product, or recommendation"
            className="pl-9"
          />
        </div>
        <Select
          value={severityFilter}
          onValueChange={(value) => setSeverityFilter(value as typeof severityFilter)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="information">Information</SelectItem>
          </SelectContent>
        </Select>
        <Select value={issueTypeFilter} onValueChange={setIssueTypeFilter}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Issue type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All issue types</SelectItem>
            {data.filters.issueTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={gameFilter} onValueChange={setGameFilter}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Game" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All games</SelectItem>
            {data.filters.games.map((game) => (
              <SelectItem key={game.id} value={game.id}>
                {game.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
        <Select
          value={productAvailabilityFilter}
          onValueChange={setProductAvailabilityFilter}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Product status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All product statuses</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="out_of_stock">Out of stock</SelectItem>
            <SelectItem value="coming_soon">Coming soon</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="not_visible">Not visible</SelectItem>
          </SelectContent>
        </Select>
        <Select value={gameAvailabilityFilter} onValueChange={setGameAvailabilityFilter}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Game status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All game statuses</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="temporarily_unavailable">Temporarily unavailable</SelectItem>
            <SelectItem value="coming_soon">Coming soon</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
            <SelectItem value="not_visible">Not visible</SelectItem>
            <SelectItem value="missing">Missing</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={artworkFilter}
          onValueChange={(value) => setArtworkFilter(value as typeof artworkFilter)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Artwork" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All artwork</SelectItem>
            {Object.entries(artworkLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={matchFilter} onValueChange={(value) => setMatchFilter(value as typeof matchFilter)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Roblox match" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All matches</SelectItem>
            {Object.entries(matchLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={configFilter} onValueChange={(value) => setConfigFilter(value as typeof configFilter)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Config" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All config</SelectItem>
            {Object.entries(configLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={resetFilters}>
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Priority Issues"
          detail="Critical and warning items that deserve review before lower-severity cleanup."
        />
        {data.priorityIssues.length > 0 ? (
          <div className="grid gap-3">
            {data.priorityIssues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={hasCritical ? "No priority issues match" : "No critical or warning issues"}
            detail="The current catalog has no high-priority issues in this section."
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="All Issues"
          detail={`${filteredIssues.length.toLocaleString()} issue${filteredIssues.length === 1 ? "" : "s"} match the current filters.`}
        />
        {filteredIssues.length > 0 ? (
          <div className="grid gap-3">
            {filteredIssues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No matching issues"
            detail="Reset filters or change the search query to inspect more catalog health checks."
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Game Coverage"
          detail="Raw XOB game state compared with public Store visibility and Roblox sync configuration."
        />
        {filteredGames.length > 0 ? (
          <div className="surface-premium overflow-hidden rounded-2xl">
            {filteredGames.map((game) => (
              <div
                key={game.gameId}
                className="grid gap-3 border-b p-3 last:border-b-0 lg:grid-cols-[minmax(12rem,1fr)_8rem_8rem_8rem_8rem_10rem_8rem] lg:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{game.gameName}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Universe {game.universeId ?? "Not available"}
                  </p>
                </div>
                <StatusBadge value={game.rawAvailability} />
                <StatusBadge value={game.storefrontAvailability} />
                <SmallStat label="Products" value={game.rawProductCount} />
                <SmallStat label="Public" value={game.storefrontProductCount} />
                <SmallStat label="Latest sync" value={formatDate(game.latestSyncAt)} />
                <div className="flex flex-wrap gap-2">
                  <StatusBadge
                    value={game.configurationStatus}
                    label={configLabels[game.configurationStatus]}
                  />
                  {game.publicHref && <SmallLink href={game.publicHref} label="Open" />}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No matching games" detail="No game coverage rows match the current filters." />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Product Health"
          detail="Per-product visibility, price, parent game, artwork, and Roblox match status."
        />
        {filteredProducts.length > 0 ? (
          <div className="surface-premium overflow-hidden rounded-2xl">
            {filteredProducts.map((product) => (
              <div
                key={product.productId}
                className="grid gap-3 border-b p-3 last:border-b-0 xl:grid-cols-[minmax(14rem,1fr)_7rem_7rem_7rem_8rem_8rem_8rem_7rem] xl:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{product.productName}</p>
                  <p className="text-muted-foreground mt-0.5 truncate text-xs">
                    {product.gameName}
                  </p>
                </div>
                <SmallStat
                  label="Price"
                  value={product.price === null ? "Not available" : `PHP ${product.price}`}
                />
                <SmallStat
                  label="Robux"
                  value={product.robuxAmount === null ? "Not available" : product.robuxAmount}
                />
                <StatusBadge
                  value={product.storefrontVisible ? product.storefrontAvailability : "not_visible"}
                />
                <StatusBadge
                  value={product.artworkSource}
                  label={artworkLabels[product.artworkSource]}
                />
                <StatusBadge
                  value={product.robloxMatchStatus}
                  label={matchLabels[product.robloxMatchStatus]}
                />
                <StatusBadge
                  value={product.configurationStatus}
                  label={configLabels[product.configurationStatus]}
                />
                <div className="flex items-center gap-2">
                  <SmallStat label="Issues" value={product.issueCount} />
                  {product.publicHref && <SmallLink href={product.publicHref} label="Open" />}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No matching products" detail="No product rows match the current filters." />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Orphaned Store Records"
          detail="Store-owned presentation records whose related XOB product is no longer present."
        />
        {data.orphanedRecords.length > 0 ? (
          <div className="grid gap-3">
            {data.orphanedRecords.map((record) => (
              <div key={record.id} className="surface-premium rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {record.recordType === "roblox_cache"
                        ? "Roblox cache row"
                        : "Artwork override"}
                    </p>
                    <p className="text-muted-foreground mt-1 break-all text-xs">
                      {record.recordId}
                    </p>
                  </div>
                  <StatusBadge value="ambiguous" label="Manual review" />
                </div>
                <p className="text-muted-foreground mt-3 text-sm">{record.currentState}</p>
                <p className="mt-2 text-sm">{record.recommendedAction}</p>
                <p className="text-muted-foreground mt-2 text-xs">
                  Detected: {formatDate(record.detectedAt)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No orphaned Store records"
            detail="Roblox cache and artwork overrides all point to current XOB products."
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Possible Duplicates"
          detail="Name similarity only. Manual review is required before any inventory decision."
        />
        {data.duplicateGroups.length > 0 ? (
          <div className="grid gap-3">
            {data.duplicateGroups.map((group) => (
              <div key={group.id} className="surface-premium rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {group.recordType === "game"
                        ? "Duplicate-looking game names"
                        : "Duplicate-looking product names"}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Normalized as &quot;{group.normalizedName}&quot;
                    </p>
                  </div>
                  <StatusBadge value="no_sync_record" label="Review only" />
                </div>
                {group.gameName && (
                  <p className="text-muted-foreground mt-2 text-xs">
                    Game: {group.gameName}
                  </p>
                )}
                <div className="mt-3 grid gap-2">
                  {group.records.map((record) => (
                    <div
                      key={record.id}
                      className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs"
                    >
                      <span className="font-medium">{record.name}</span>
                      <span className="text-muted-foreground">{record.availability}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No duplicate-looking names"
            detail="No game or same-game product names currently normalize to the same value."
          />
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <RulesBlock icon={Boxes} title="Visibility and Price Rules" rules={[...data.rules.storefrontVisibility, ...data.rules.priceValidation]} />
        <RulesBlock icon={ImageIcon} title="Artwork, Orphans, and Duplicates" rules={[...data.rules.artworkFallback, ...data.rules.orphanDetection, ...data.rules.duplicateDetection]} />
      </section>
    </div>
  );
}

function IssueCard({ issue }: { issue: CatalogHealthIssue }) {
  return (
    <article className="surface-premium rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge value={issue.severity} />
            <p className="text-sm font-semibold">{issue.type}</p>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {issue.gameName ?? "No game"} {issue.productName ? `/ ${issue.productName}` : ""}
          </p>
        </div>
        {issue.severity === "critical" ? (
          <ShieldAlert className="size-4 text-rose-600 dark:text-rose-300" />
        ) : issue.severity === "warning" ? (
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-300" />
        ) : (
          <Info className="size-4 text-sky-600 dark:text-sky-300" />
        )}
      </div>

      <div className="mt-3 grid gap-2 text-sm lg:grid-cols-3">
        <InfoBlock label="Current state" value={issue.currentState} />
        <InfoBlock label="Why it matters" value={issue.whyItMatters} />
        <InfoBlock label="Recommended action" value={issue.recommendedAction} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <StatusBadge value={issue.gameAvailability} />
        <StatusBadge value={issue.productAvailability} />
        <StatusBadge value={issue.artworkSource} label={artworkLabels[issue.artworkSource]} />
        <StatusBadge
          value={issue.robloxMatchStatus}
          label={matchLabels[issue.robloxMatchStatus]}
        />
        <StatusBadge
          value={issue.configurationStatus}
          label={configLabels[issue.configurationStatus]}
        />
      </div>

      {(issue.relatedLinks.length > 0 || issue.detectedAt) && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {issue.relatedLinks.map((link) => (
            <SmallLink key={`${issue.id}-${link.href}-${link.label}`} href={link.href} label={link.label} />
          ))}
          {issue.detectedAt && (
            <span className="text-muted-foreground text-xs">
              Detected {formatDate(issue.detectedAt)}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-xl px-3 py-2">
      <p className="text-muted-foreground text-[11px] font-medium">{label}</p>
      <p className="mt-1 text-xs leading-relaxed">{value}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-[11px] font-medium">{label}</p>
      <p className="truncate text-xs font-medium">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
    </div>
  );
}

function SmallLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-primary inline-flex min-h-7 items-center gap-1 rounded-lg text-xs font-medium hover:underline"
    >
      {label}
      <ExternalLink className="size-3" />
    </Link>
  );
}

function RulesBlock({
  icon: Icon,
  title,
  rules,
}: {
  icon: typeof Boxes;
  title: string;
  rules: string[];
}) {
  return (
    <div className="surface-premium rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <div className="bg-primary/10 flex size-8 items-center justify-center rounded-xl">
          <Icon className="text-primary size-4" />
        </div>
        <h2 className="font-heading text-sm font-semibold">{title}</h2>
      </div>
      <div className="mt-3 grid gap-2">
        {rules.map((rule) => (
          <p key={rule} className="text-muted-foreground text-xs leading-relaxed">
            {rule}
          </p>
        ))}
      </div>
    </div>
  );
}
