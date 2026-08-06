-- Extends the pilot's icon cache into a general-purpose asset
-- synchronization system: where an asset came from, whether Roblox has
-- actually changed anything since last check, and a persisted admin-only
-- log of what changed on every sync run. Still Store-owned only — nothing
-- here touches XOB's games/gamepasses tables.

-- 1. Asset source tracking. Only meaningful for status = 'matched' rows —
-- 'roblox' is everything the sync script writes today. 'manual' is
-- reserved for a future override feature (not implemented yet) — the sync
-- script is written to skip any row it finds already marked 'manual'
-- rather than overwrite it, so that feature can land later as a pure
-- addition (a new write path), with zero changes to this table or to the
-- read side (getRobloxIconCache already just reads whatever status/icon_url
-- is on the row, regardless of source).
alter table public.roblox_gamepass_icon_cache
  add column source text check (source in ('manual', 'roblox'));

-- Backfill: every existing matched row came from the pilot sync script.
update public.roblox_gamepass_icon_cache
set source = 'roblox'
where status = 'matched';

-- 2. Version tracking, so a sync run can tell "nothing changed" without
-- guessing. Two Roblox-provided signals, not a separately computed hash:
--   - icon_url itself already changes when Roblox regenerates artwork
--     (the CDN path is content-addressed), so it doubles as the artwork
--     version signal — no separate thumbnail_hash needed.
--   - roblox_updated_at mirrors the game pass listing API's own `updated`
--     timestamp, which changes on renames/description edits even when the
--     icon doesn't — catches changes icon_url alone would miss.
-- last_verified_at bumps on every successful check, whether or not
-- anything changed. synced_at (already existed) now only bumps when the
-- cached value actually changes — so "synced_at == last_verified_at" means
-- this row was just reconfirmed unchanged.
alter table public.roblox_gamepass_icon_cache
  add column last_verified_at timestamptz not null default now(),
  add column roblox_updated_at timestamptz,
  add column first_flagged_at timestamptz;

comment on column public.roblox_gamepass_icon_cache.first_flagged_at is
  'Ambiguous rows only: when this product first became ambiguous. Used to suppress repeat log noise until the configurable retry window (see AMBIGUOUS_RETRY_DAYS in the sync script) has passed.';

-- 3. Roblox-side snapshot, independent of whether a pass matches one of
-- our products. This is what makes "new Game Pass discovered" and "Game
-- Pass removed" detectable — our own product-matching cache only ever
-- reasons about products we already sell; this tracks everything Roblox
-- actually has for a synced universe, so admins learn about passes before
-- deciding to add them to inventory.
create table public.roblox_gamepass_snapshot (
  roblox_universe_id bigint not null,
  roblox_gamepass_id bigint not null,
  name text not null,
  icon_url text,
  roblox_updated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (roblox_universe_id, roblox_gamepass_id)
);

-- Admin-only data — no anon/authenticated grant at all, same lockdown
-- pattern as store_settings/admin_users (migration 0004): RLS enabled with
-- zero policies means nothing but the service-role sync script can read or
-- write it, full stop.
alter table public.roblox_gamepass_snapshot enable row level security;

-- 4. Persisted, admin-only change log. One row per game per sync run.
-- `details` holds the human-readable bullet list (see
-- scripts/sync-roblox-gamepasses.mjs) so the same data that prints to the
-- console is queryable later without re-running anything.
create table public.roblox_sync_log (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null,
  roblox_universe_id bigint not null,
  synced_at timestamptz not null default now(),
  unchanged_count integer not null default 0,
  new_count integer not null default 0,
  artwork_updated_count integer not null default 0,
  renamed_count integer not null default 0,
  removed_count integer not null default 0,
  ambiguous_count integer not null default 0,
  no_match_count integer not null default 0,
  details jsonb not null default '[]'::jsonb
);

create index roblox_sync_log_game_idx on public.roblox_sync_log (game_id, synced_at desc);

-- Same admin-only lockdown as the snapshot table — this is explicitly "not
-- for customers" by requirement, not just by omission of a UI.
alter table public.roblox_sync_log enable row level security;
