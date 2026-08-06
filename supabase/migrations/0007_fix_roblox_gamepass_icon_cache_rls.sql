-- Fixes a real bug in 0006: enabling row level security with zero policies
-- makes a table's rows invisible to every role except the owner/service
-- role — the `grant select ... to anon` in 0006 was silently ineffective.
-- (Verified live: the anon-key query the storefront actually uses returned
-- zero rows despite matching data existing.) That's the correct lockdown
-- for store_settings/admin_users (migration 0004), which want zero anon
-- access — it was copied here by mistake for a table that's supposed to be
-- publicly readable, same as any other catalog data.
create policy "Public read access"
  on public.roblox_gamepass_icon_cache
  for select
  to anon
  using (true);
