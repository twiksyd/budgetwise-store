-- Lets an admin switch the merged "Robux (Via Link)" option off and back on
-- from Store Operations without a redeploy. It isn't a `games` row (see
-- src/config/robux-via-link.ts) and its two source games are already
-- 'hidden' by design, so the regular per-game availability control can't
-- express "turn Via Link off". Defaults to on so applying this changes
-- nothing until an admin flips it.
alter table public.store_settings
  add column robux_via_link_enabled boolean not null default true;
