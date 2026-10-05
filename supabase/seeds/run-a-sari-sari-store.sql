-- Adds "Run a Sari Sari store" (and its 12 gamepasses) to the shared XOB /
-- BudgetWise database. The Store has no write path for games or gamepasses:
-- both live in XOB-owned tables (public.games / public.gamepasses) and the
-- storefront only reads them through the store_games / store_gamepasses
-- views. Inserting here makes the game appear on both XOB and BudgetWise.
--
-- Run once in the Supabase SQL editor. Safe to re-run: it skips if a game
-- with this name already exists. Columns not listed take their table defaults.
--
-- Mapping from the price sheet (Robux | name | price | cost | profit | rating):
--   robux_amount = Robux, your_price = price, your_cost = cost.
--   Profit is price - cost and the rating is a judgement call, so neither is
--   stored here; add them from the XOB dashboard if it keeps them as columns.
--
-- Assumes public.games and public.gamepasses both carry a user_id owner
-- column (gamepasses does; games is copied the same way). The owner is taken
-- from an existing gamepass so the new rows belong to the same XOB account.

begin;

do $$
declare
  v_owner uuid;
  v_game  uuid;
begin
  if exists (select 1 from public.games where lower(trim(name)) = 'run a sari sari store') then
    raise notice 'Run a Sari Sari store already exists - nothing to do.';
    return;
  end if;

  select user_id into v_owner from public.gamepasses limit 1;
  if v_owner is null then
    raise exception 'No existing gamepass to copy user_id from; set v_owner manually.';
  end if;

  insert into public.games (user_id, name, sort_order, availability_status)
  values (
    v_owner,
    'Run a Sari Sari store',
    coalesce((select max(sort_order) from public.games), 0) + 1,
    'available'
  )
  returning id into v_game;

  insert into public.gamepasses
    (user_id, game_id, name, robux_amount, your_price, your_cost, is_active, availability_status)
  values
    (v_owner, v_game, 'VIP',                    225,  89, 65.25, true, 'available'),
    (v_owner, v_game, 'Fast Checkout Permit',   405, 145, 117.45, true, 'available'),
    (v_owner, v_game, 'Fast Load Permit',       405, 145, 117.45, true, 'available'),
    (v_owner, v_game, 'Auto Trash Permit',      135,  55,  39.15, true, 'available'),
    (v_owner, v_game, 'Starter Pack',            90,  35,  26.10, true, 'available'),
    (v_owner, v_game, 'More Colors & Textures',  45,  19,  13.05, true, 'available'),
    (v_owner, v_game, '2x Cash',                 90,  35,  26.10, true, 'available'),
    (v_owner, v_game, '2x Luck',                 45,  19,  13.05, true, 'available'),
    (v_owner, v_game, 'Ultra Luck',              90,  35,  26.10, true, 'available'),
    (v_owner, v_game, '500 Pesos',               23,   9,   6.67, true, 'available'),
    (v_owner, v_game, '2,500 Pesos',             90,  35,  26.10, true, 'available'),
    (v_owner, v_game, '7500 Pesos',             225,  89,  65.25, true, 'available');
end $$;

commit;

-- Verify (should return the game once and 12 rows):
-- select * from public.store_games where slug = 'run-a-sari-sari-store';
-- select name, robux_amount, price from public.store_gamepasses
--   where game_id = (select id from public.store_games where slug = 'run-a-sari-sari-store')
--   order by robux_amount desc;
