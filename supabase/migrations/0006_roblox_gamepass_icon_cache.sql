-- Store-owned cache of official Roblox Game Pass artwork, resolved via
-- Roblox's public, unauthenticated Game Passes + Thumbnails APIs. This is
-- pilot infrastructure for two games (see src/config/roblox-universe-ids.ts)
-- — not a full-catalog rollout.
--
-- Populated ONLY by an offline script (scripts/sync-roblox-gamepasses.mjs),
-- run manually, using the service-role client. The storefront itself never
-- calls Roblox and never writes to this table — it only reads the cache,
-- exactly like any other catalog data. This is what makes "Roblox's APIs
-- become unavailable" a non-event for customers: the read path never
-- touches Roblox at all.
--
-- Deliberately NOT a foreign key to public.gamepasses. That table is
-- XOB-owned; this pilot must not add any constraint, index, or dependency
-- onto XOB's schema. `gamepass_id` is a plain uuid the sync script already
-- knows from reading store_gamepasses — no coupling, no risk to XOB's
-- ability to manage its own table however it wants.
--
-- Every attempted product gets a row, even on failure. A 'no_match' or
-- 'ambiguous' row is not a *missing* cache entry — it's a completed,
-- deliberate decision not to show artwork — so a future sync run knows not
-- to re-attempt it. Only a genuinely missing row (a product added after the
-- last sync) gets retried automatically.
create table public.roblox_gamepass_icon_cache (
  gamepass_id uuid primary key,
  roblox_universe_id bigint not null,
  status text not null check (status in ('matched', 'no_match', 'ambiguous')),
  roblox_gamepass_id bigint,
  icon_url text,
  matched_name text,
  candidate_count integer not null default 0,
  synced_at timestamptz not null default now()
);

create index roblox_gamepass_icon_cache_universe_idx
  on public.roblox_gamepass_icon_cache (roblox_universe_id);

-- Public read, same as any other catalog table the storefront queries.
-- Writes happen exclusively through the service-role sync script — no
-- insert/update/delete grant to anon.
alter table public.roblox_gamepass_icon_cache enable row level security;
grant select on public.roblox_gamepass_icon_cache to anon;
