-- Marks "Run a Sari Sari store" as a verified Roblox game so the daily icon
-- backfill (and the sync script) will fetch its artwork. Production reads
-- Roblox identity from public.game_roblox_identity (ROBLOX_IDENTITY_SOURCE=db),
-- not from src/config/roblox-universe-ids.json.
--
-- Run once in the Supabase SQL editor, then re-run the "Deterministic Roblox
-- icon backfill" workflow from GitHub (Actions -> Run workflow).
--
-- Both ids were supplied by the store owner, not cross-checked against the
-- game's gamepass list (Roblox is unreachable from the dev environment):
--   place    104178853788462  (from the game's roblox.com URL)
--   universe 10126644530
-- The evidence column records that, so it is not mistaken for an
-- overlap-verified mapping.

insert into public.game_roblox_identity (
  game_id, status, universe_id, root_place_id,
  verification_method, verified_at, verification_evidence
)
values (
  'ebf8bb61-85d1-4f48-9ed4-01259f28aaa0',
  'verified',
  10126644530,
  104178853788462,
  'owner_confirmed',
  now(),
  '{"source": "store_owner", "basis": "Universe and place ids supplied by the store owner; not cross-checked against the Roblox game pass list."}'::jsonb
)
on conflict (game_id) do nothing;

-- Verify (should return one row with status = verified):
-- select game_id, status, universe_id from public.game_roblox_identity
--   where game_id = 'ebf8bb61-85d1-4f48-9ed4-01259f28aaa0';
