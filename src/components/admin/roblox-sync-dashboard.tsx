"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Info, RefreshCw, RotateCcw } from "lucide-react";
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
  GameConfigurationStatus,
  MatchStatus,
  RenderedArtworkSource,
  RobloxSyncDashboardData,
  RobloxSyncLogEntry,
} from "@/lib/queries/roblox-sync-dashboard";
import { cn } from "@/lib/utils";

type AllValue = "all";
type MatchFilterValue = AllValue | "needs_review" | MatchStatus;

const matchLabels: Record<MatchStatus, string> = {
  matched: "Matched",
  no_match: "No match",
  ambiguous: "Ambiguous",
  no_sync_record: "No sync record",
};

const artworkLabels: Record<RenderedArtworkSource, string> = {
  manual_override: "Manual override",
  roblox_cache: "Roblox cache",
  forced_placeholder: "Forced placeholder",
  placeholder: "Placeholder",
};

const configurationLabels: Record<GameConfigurationStatus | "with_issues", string> = {
  configured: "Configured",
  not_configured: "Not configured",
  no_products: "No products",
  no_cache_activity: "No cache activity",
  with_issues: "With issues",
};

const badgeClassNames: Record<string, string> = {
  matched: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  no_match: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  ambiguous: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  no_sync_record: "bg-muted text-muted-foreground",
  manual_override: "bg-primary/10 text-primary",
  roblox_cache: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  forced_placeholder: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  placeholder: "bg-muted text-muted-foreground",
  configured: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  not_configured: "bg-muted text-muted-foreground",
  no_products: "bg-muted text-muted-foreground",
  no_cache_activity: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
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

function matchesDateRange(value: string | null, from: string, to: string) {
  if (!from && !to) return true;
  if (!value) return false;
  const time = new Date(value).getTime();
  if (from && time < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && time > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

function StatusBadge({ value, label }: { value: string; label: string }) {
  return (
    <Badge variant="ghost" className={cn("h-6", badgeClassNames[value])}>
      {label}
    </Badge>
  );
}

function MetricCard({
  label,
  value,
  help,
}: {
  label: string;
  value: string | number;
  help?: string;
}) {
  return (
    <div className="surface-premium rounded-2xl p-3">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="font-heading mt-1 text-2xl font-semibold tracking-tight">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      {help && <p className="text-muted-foreground mt-1 text-xs leading-snug">{help}</p>}
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

function DetailsBlock({ json }: { json: string }) {
  return (
    <pre className="bg-muted/70 mt-3 max-h-72 overflow-auto rounded-xl p-3 text-xs leading-relaxed whitespace-pre-wrap">
      {json}
    </pre>
  );
}

export function RobloxSyncDashboard({ data }: { data: RobloxSyncDashboardData }) {
  const [search, setSearch] = useState("");
  const [gameFilter, setGameFilter] = useState<AllValue | string>("all");
  const [matchFilter, setMatchFilter] = useState<MatchFilterValue>("needs_review");
  const [artworkFilter, setArtworkFilter] = useState<AllValue | RenderedArtworkSource>("all");
  const [configFilter, setConfigFilter] = useState<AllValue | GameConfigurationStatus | "with_issues">("all");
  const [changeTypeFilter, setChangeTypeFilter] = useState<AllValue | string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [rowsToShow, setRowsToShow] = useState("25");
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const normalizedSearch = search.trim().toLowerCase();

  function resetFilters() {
    setSearch("");
    setGameFilter("all");
    setMatchFilter("needs_review");
    setArtworkFilter("all");
    setConfigFilter("all");
    setChangeTypeFilter("all");
    setFromDate("");
    setToDate("");
    setRowsToShow("25");
  }

  function toggle(setter: (value: Set<string>) => void, current: Set<string>, id: string) {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  const filteredCoverage = useMemo(() => {
    return data.coverage.filter((game) => {
      if (gameFilter !== "all" && game.gameId !== gameFilter) return false;
      if (configFilter === "with_issues") {
        return (
          game.noMatchCount > 0 ||
          game.ambiguousCount > 0 ||
          game.noSyncRecordCount > 0 ||
          game.configurationStatus === "not_configured" ||
          game.configurationStatus === "no_cache_activity"
        );
      }
      if (configFilter !== "all" && game.configurationStatus !== configFilter) {
        return false;
      }
      if (!normalizedSearch) return true;
      return game.gameName.toLowerCase().includes(normalizedSearch);
    });
  }, [configFilter, data.coverage, gameFilter, normalizedSearch]);

  const filteredLogs = useMemo(() => {
    return data.recentLogs
      .filter((log) => {
        if (gameFilter !== "all" && log.gameId !== gameFilter) return false;
        if (!matchesDateRange(log.syncedAt, fromDate, toDate)) return false;
        if (!normalizedSearch) return true;
        return gameText(log).includes(normalizedSearch);
      })
      .slice(0, Number(rowsToShow));
  }, [data.recentLogs, fromDate, gameFilter, normalizedSearch, rowsToShow, toDate]);

  const filteredChanges = useMemo(() => {
    return data.recentChanges.filter((event) => {
      if (gameFilter !== "all" && event.gameId !== gameFilter) return false;
      if (changeTypeFilter !== "all" && event.type !== changeTypeFilter) return false;
      if (!matchesDateRange(event.detectedAt, fromDate, toDate)) return false;
      if (!normalizedSearch) return true;
      return [
        event.gameName,
        event.productName,
        event.robloxPassName,
        event.label,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [changeTypeFilter, data.recentChanges, fromDate, gameFilter, normalizedSearch, toDate]);

  const filteredReview = useMemo(() => {
    return data.matchReview.filter((item) => {
      if (gameFilter !== "all" && item.gameId !== gameFilter) return false;
      if (matchFilter === "needs_review" && item.matchStatus === "matched") {
        return false;
      }
      if (
        matchFilter !== "all" &&
        matchFilter !== "needs_review" &&
        item.matchStatus !== matchFilter
      ) {
        return false;
      }
      if (artworkFilter !== "all" && item.renderedArtworkSource !== artworkFilter) {
        return false;
      }
      if (
        configFilter !== "all" &&
        configFilter !== "with_issues" &&
        item.configurationStatus !== configFilter
      ) {
        return false;
      }
      if (configFilter === "with_issues" && item.matchStatus === "matched") {
        return false;
      }
      if (!normalizedSearch) return true;
      return [
        item.productName,
        item.gameName,
        item.matchedRobloxPassName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [artworkFilter, configFilter, data.matchReview, gameFilter, matchFilter, normalizedSearch]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 mt-1 flex size-9 shrink-0 items-center justify-center rounded-xl">
            <RefreshCw className="text-primary size-4" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Roblox Sync
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              Monitor Roblox Game Pass matching, artwork cache health, and recent synchronization activity.
            </p>
          </div>
        </div>
        <div className="bg-muted/70 text-muted-foreground rounded-2xl px-3 py-2 text-xs">
          To run the offline sync: <code className="text-foreground">pnpm sync:roblox-gamepasses</code>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Public catalog games" value={data.summary.storeGames} />
        <MetricCard label="Configured sync games" value={data.summary.configuredSyncGames} />
        <MetricCard label="Games without universe config" value={data.summary.gamesWithoutUniverseConfig} />
        <MetricCard label="Storefront products" value={data.summary.storefrontProducts} />
        <MetricCard label="Cache records" value={data.summary.cacheRecords} />
        <MetricCard label="Matched" value={data.summary.matched} />
        <MetricCard
          label="No match"
          value={data.summary.noMatch}
          help="Checked by the Roblox sync, but no reliable pass match was found."
        />
        <MetricCard label="Ambiguous" value={data.summary.ambiguous} />
        <MetricCard
          label="No sync record"
          value={data.summary.noSyncRecord}
          help="No Roblox cache record exists for this storefront product."
        />
        <MetricCard label="Manual artwork overrides" value={data.summary.manualOverrides} />
        <MetricCard label="Forced placeholders" value={data.summary.forcedPlaceholders} />
        <MetricCard label="Latest sync activity" value={formatDate(data.summary.latestSyncActivity)} />
      </section>

      <section className="surface-premium rounded-2xl p-4">
        <div className="flex items-start gap-2">
          <Info className="text-primary mt-0.5 size-4 shrink-0" />
          <div className="text-muted-foreground text-sm">
            <p className="text-foreground font-medium">Current schema limitations</p>
            <div className="mt-1 grid gap-1">
              {data.limitations.map((limitation) => (
                <p key={limitation}>{limitation}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-[1fr_11rem_11rem_11rem_auto]">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search game, product, or Roblox pass" />
        <Select value={gameFilter} onValueChange={setGameFilter}>
          <SelectTrigger><SelectValue placeholder="Game" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All games</SelectItem>
            {data.gameOptions.map((game) => (
              <SelectItem key={game.id} value={game.id}>{game.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={configFilter} onValueChange={(value) => setConfigFilter(value as typeof configFilter)}>
          <SelectTrigger><SelectValue placeholder="Config" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All config</SelectItem>
            <SelectItem value="configured">Configured</SelectItem>
            <SelectItem value="not_configured">Not configured</SelectItem>
            <SelectItem value="with_issues">With issues</SelectItem>
            <SelectItem value="no_products">No products</SelectItem>
            <SelectItem value="no_cache_activity">No cache activity</SelectItem>
          </SelectContent>
        </Select>
        <Select value={rowsToShow} onValueChange={setRowsToShow}>
          <SelectTrigger><SelectValue placeholder="Rows" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10 rows</SelectItem>
            <SelectItem value="25">25 rows</SelectItem>
            <SelectItem value="50">50 rows</SelectItem>
            <SelectItem value="100">100 rows</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={resetFilters}>
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Configuration Coverage"
          detail="Configured games have a Roblox universe ID. Unconfigured games are not failed syncs."
        />
        <div className="surface-premium overflow-hidden rounded-2xl">
          {filteredCoverage.length > 0 ? filteredCoverage.map((game) => (
            <div key={game.gameId} className="grid gap-3 border-b p-3 last:border-b-0 lg:grid-cols-[minmax(12rem,1fr)_8rem_8rem_8rem_8rem_9rem_9rem] lg:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{game.gameName}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Universe: {game.universeId ?? "Not available"}
                </p>
              </div>
              <StatusBadge value={game.configurationStatus} label={configurationLabels[game.configurationStatus]} />
              <SmallStat label="Products" value={game.productCount} />
              <SmallStat label="Cache rows" value={game.cacheRowCount} />
              <SmallStat label="Issues" value={game.noMatchCount + game.ambiguousCount + game.noSyncRecordCount} />
              <SmallStat label="Verified" value={formatDate(game.latestVerifiedAt)} />
              <SmallStat label="Log" value={formatDate(game.latestSyncLogAt)} />
            </div>
          )) : <EmptyState title="No matching games" detail="Adjust the filters to see synchronization coverage." />}
        </div>
      </section>

      <section className="surface-premium rounded-2xl p-4">
        <SectionHeading
          title="Latest Sync Activity"
          detail="Inferred from nearby per-game log timestamps. The current schema has no global sync-run ID."
        />
        {data.latestWindow ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Observed start" value={formatDate(data.latestWindow.observedStartAt)} />
            <MetricCard label="Observed end" value={formatDate(data.latestWindow.observedEndAt)} />
            <MetricCard label="Games in window" value={data.latestWindow.uniqueGames} />
            <MetricCard label="Thumbnail URL changed" value={data.latestWindow.counts.thumbnailUrlChanged} help="Legacy icon_url comparison, not a stable asset ID." />
            <MetricCard label="Unchanged" value={data.latestWindow.counts.unchanged} />
            <MetricCard label="New" value={data.latestWindow.counts.new} />
            <MetricCard label="Ambiguous" value={data.latestWindow.counts.ambiguous} />
            <MetricCard label="No match" value={data.latestWindow.counts.noMatch} />
          </div>
        ) : (
          <EmptyState title="No sync activity yet" detail="No per-game sync logs are available." />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading title="Recent Per-Game Sync Logs" />
        <DateFilters fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
        <div className="surface-premium overflow-hidden rounded-2xl">
          {filteredLogs.length > 0 ? filteredLogs.map((log) => (
            <SyncLogRow
              key={log.id}
              log={log}
              expanded={expandedLogs.has(log.id)}
              onToggle={() => toggle(setExpandedLogs, expandedLogs, log.id)}
            />
          )) : <EmptyState title="No sync logs" detail="No logs match the current filters." />}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Recent Changes"
          detail="Built only from events stored in roblox_sync_log.details."
        />
        <Select value={changeTypeFilter} onValueChange={setChangeTypeFilter}>
          <SelectTrigger className="w-full md:w-64"><SelectValue placeholder="Change type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All change types</SelectItem>
            {data.changeTypeOptions.map((type) => (
              <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data.recentChanges.length === 0 ? (
          <EmptyState title="No parsed change events" detail="Recent log rows do not contain structured details events." />
        ) : (
          <div className="surface-premium overflow-hidden rounded-2xl">
            {filteredChanges.length > 0 ? filteredChanges.map((event) => (
              <div key={event.id} className="border-b p-3 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{event.label}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">{event.gameName} / {formatDate(event.detectedAt)}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => toggle(setExpandedEvents, expandedEvents, event.id)}>
                    {expandedEvents.has(event.id) ? "Hide details" : "Details"}
                  </Button>
                </div>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <SmallStat label="Product" value={event.productName ?? "Not available"} />
                  <SmallStat label="Roblox pass" value={event.robloxPassName ?? "Not available"} />
                  <SmallStat label="Previous" value={event.previousValue ?? "Not available"} />
                  <SmallStat label="New" value={event.newValue ?? "Not available"} />
                </div>
                {expandedEvents.has(event.id) && <DetailsBlock json={event.rawJson} />}
              </div>
            )) : <EmptyState title="No matching changes" detail="Adjust filters to see recent change events." />}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Match Review"
          detail="Focused on no-match, ambiguous, and no-sync-record products by default."
        />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Select value={matchFilter} onValueChange={(value) => setMatchFilter(value as typeof matchFilter)}>
            <SelectTrigger><SelectValue placeholder="Match status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All match statuses</SelectItem>
              <SelectItem value="needs_review">Needs review</SelectItem>
              <SelectItem value="no_match">No match</SelectItem>
              <SelectItem value="ambiguous">Ambiguous</SelectItem>
              <SelectItem value="no_sync_record">No sync record</SelectItem>
              <SelectItem value="matched">Matched</SelectItem>
            </SelectContent>
          </Select>
          <Select value={artworkFilter} onValueChange={(value) => setArtworkFilter(value as typeof artworkFilter)}>
            <SelectTrigger><SelectValue placeholder="Artwork source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All artwork sources</SelectItem>
              <SelectItem value="manual_override">Manual override</SelectItem>
              <SelectItem value="roblox_cache">Roblox cache</SelectItem>
              <SelectItem value="forced_placeholder">Forced placeholder</SelectItem>
              <SelectItem value="placeholder">Placeholder</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="surface-premium overflow-hidden rounded-2xl">
          {filteredReview.length > 0 ? filteredReview.slice(0, Number(rowsToShow)).map((item) => (
            <div key={item.productId} className="grid gap-3 border-b p-3 last:border-b-0 lg:grid-cols-[minmax(14rem,1fr)_8rem_9rem_10rem_10rem] lg:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{item.productName}</p>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">{item.gameName}</p>
                {item.matchStatus === "ambiguous" && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Candidate details not stored.
                  </p>
                )}
                {item.matchStatus === "no_sync_record" && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    No cache row exists. Parent game is {item.configurationStatus === "configured" ? "configured" : "not configured"}.
                  </p>
                )}
              </div>
              <StatusBadge value={item.matchStatus} label={matchLabels[item.matchStatus]} />
              <StatusBadge value={item.renderedArtworkSource} label={artworkLabels[item.renderedArtworkSource]} />
              <SmallStat label="Roblox pass" value={item.matchedRobloxPassName ?? "Not available"} />
              <SmallStat label="Verified" value={formatDate(item.lastVerifiedAt)} />
            </div>
          )) : <EmptyState title="No matching products" detail="Adjust filters to review sync state." />}
        </div>
      </section>

      {data.summary.ambiguous === 0 && (
        <div className="surface-premium flex items-start gap-2 rounded-2xl p-4 text-sm">
          <AlertTriangle className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <p className="text-muted-foreground">No ambiguous matches are currently present.</p>
        </div>
      )}
    </div>
  );
}

function gameText(log: RobloxSyncLogEntry) {
  return `${log.gameName} ${log.universeId}`.toLowerCase();
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-[11px] font-medium">{label}</p>
      <p className="truncate text-xs font-medium">{typeof value === "number" ? formatNumber(value) : value}</p>
    </div>
  );
}

function DateFilters({
  fromDate,
  toDate,
  setFromDate,
  setToDate,
}: {
  fromDate: string;
  toDate: string;
  setFromDate: (value: string) => void;
  setToDate: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:max-w-md">
      <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="From date" />
      <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="To date" />
    </div>
  );
}

function SyncLogRow({
  log,
  expanded,
  onToggle,
}: {
  log: RobloxSyncLogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b p-3 last:border-b-0">
      <div className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_9rem_repeat(7,5rem)_5rem] lg:items-center">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{log.gameName}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">Universe {log.universeId}</p>
        </div>
        <SmallStat label="Synced" value={formatDate(log.syncedAt)} />
        <SmallStat label="Unchanged" value={log.unchangedCount} />
        <SmallStat label="New" value={log.newCount} />
        <SmallStat label="Renamed" value={log.renamedCount} />
        <SmallStat label="Removed" value={log.removedCount} />
        <SmallStat label="Thumb URL" value={log.thumbnailUrlChangedCount} />
        <SmallStat label="Ambiguous" value={log.ambiguousCount} />
        <SmallStat label="No match" value={log.noMatchCount} />
        <Button variant="ghost" size="sm" onClick={onToggle}>
          {expanded ? "Hide" : "Details"}
        </Button>
      </div>
      {expanded && <DetailsBlock json={log.detailsJson} />}
    </div>
  );
}
