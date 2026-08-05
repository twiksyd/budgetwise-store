-- Store Operations: lets an authorized admin temporarily disable products,
-- games, or the entire storefront without a redeploy. Everything here is
-- additive — existing `is_active` semantics on gamepasses, and the
-- Dashboard's own owner-scoped RLS on games/gamepasses, are untouched. All
-- writes to the new columns/tables happen exclusively through the Store's
-- service-role client (never the anon key, never RLS-mediated), gated by
-- admin_users — see src/lib/auth/admin.ts.

-- 1. Global store status, scheduling, and the customer-facing notice.
-- Singleton row (id is always `true`) so there's exactly one settings row
-- to read/update, ever.
create table public.store_settings (
  id boolean primary key default true,
  store_status text not null default 'open'
    check (store_status in ('open', 'maintenance', 'closed')),
  notice_message text,
  scheduled_status text
    check (scheduled_status in ('open', 'maintenance', 'closed')),
  scheduled_at timestamptz,
  scheduled_reopen_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint store_settings_singleton check (id)
);

insert into public.store_settings (id) values (true);

-- No RLS policies granted to anon/authenticated on purpose: this table is
-- only ever read or written by the service-role client (which bypasses RLS
-- entirely), so enabling RLS with zero policies makes "no public access"
-- the enforced default even if a future migration accidentally grants the
-- table to anon/authenticated.
alter table public.store_settings enable row level security;

-- 2. Which Supabase Auth users may act as an admin of this Store's
-- operations panel. Deliberately separate from any Dashboard-side notion
-- of "admin" — this only grants access to the Store's own /admin routes.
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- 3. Per-game and per-product availability.
alter table public.games
  add column availability_status text not null default 'available'
    check (availability_status in ('available', 'temporarily_unavailable', 'coming_soon', 'hidden'));

alter table public.gamepasses
  add column availability_status text not null default 'available'
    check (availability_status in ('available', 'out_of_stock', 'coming_soon', 'hidden'));

-- 4. Extend the public views to expose the new status columns. "Hidden"
-- items are excluded entirely; "Coming Soon" / "Temporarily Unavailable" /
-- "Out of Stock" stay visible on purpose so browsing still works. A
-- Coming Soon game is allowed to have zero active gamepasses (it hasn't
-- launched yet) — every other game still needs at least one visible,
-- active gamepass to appear, same as before this migration.
create or replace view public.store_games as
select
  id,
  name,
  regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g') as slug,
  category,
  color,
  icon_url,
  sort_order,
  is_discounted,
  availability_status
from public.games g
where availability_status <> 'hidden'
  and (
    availability_status = 'coming_soon'
    or exists (
      select 1 from public.gamepasses gp
      where gp.game_id = g.id
        and gp.is_active = true
        and gp.availability_status <> 'hidden'
    )
  )
order by sort_order;

create or replace view public.store_gamepasses as
select
  id,
  game_id,
  name,
  robux_amount,
  your_price as price,
  availability_status
from public.gamepasses
where is_active = true and availability_status <> 'hidden';

grant select on public.store_games to anon;
grant select on public.store_gamepasses to anon;
