-- BudgetWise Store: public-safe read views for the customer-facing site.
--
-- The Store's anon key must never see gamepasses.your_cost / profit /
-- robux_rate / competitor_price / suggested_lower_price, or any column on
-- orders / order_items (cost, profit, roblox_account_id, buyer info, etc).
-- Row-level security can only filter rows, not columns, so the public
-- surface is instead a pair of views exposing only the columns the Store
-- needs. Views created without `security_invoker` run with the creating
-- role's rights (the Supabase SQL editor's role, which bypasses RLS on the
-- base tables), so they see every row regardless of the Dashboard's
-- owner-scoped RLS, while only ever returning the columns listed below.
--
-- This migration only changes grants for the `anon` role. It does not
-- touch `authenticated` or RLS policies, so the Dashboard's own
-- session-based access is unaffected.

create or replace view public.store_games as
select
  id,
  name,
  regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g') as slug,
  category,
  color,
  icon_url,
  sort_order,
  is_discounted
from public.games
order by sort_order;

create or replace view public.store_gamepasses as
select
  id,
  game_id,
  name,
  robux_amount,
  your_price as price
from public.gamepasses
where is_active = true;

grant usage on schema public to anon;
grant select on public.store_games to anon;
grant select on public.store_gamepasses to anon;

revoke all on public.games from anon;
revoke all on public.gamepasses from anon;
revoke all on public.orders from anon;
revoke all on public.order_items from anon;
