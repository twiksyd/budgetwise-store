-- Adds the missing "25,000 pesos" gamepass to "Run a Sari Sari store".
-- The original seed skips when the game already exists, so this is a
-- separate one-off. Safe to re-run: skips if the gamepass is already there.
-- Same column mapping as the original seed (Robux | name | price | cost).

insert into public.gamepasses
  (user_id, game_id, name, robux_amount, your_price, your_cost, is_active, availability_status)
select
  gp.user_id, g.id, '25,000 pesos', 630, 225, 182.70, true, 'available'
from public.games g
cross join lateral (select user_id from public.gamepasses limit 1) gp
where g.id = 'ebf8bb61-85d1-4f48-9ed4-01259f28aaa0'
  and not exists (
    select 1 from public.gamepasses x
    where x.game_id = g.id and lower(x.name) = '25,000 pesos'
  );

-- Verify (should now return 13 rows):
-- select name, robux_amount, price from public.store_gamepasses
--   where game_id = 'ebf8bb61-85d1-4f48-9ed4-01259f28aaa0' order by robux_amount desc;
