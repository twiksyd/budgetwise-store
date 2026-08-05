-- Only list games that actually have at least one purchasable gamepass.
-- A game a customer can click into and find nothing to buy isn't useful
-- catalog noise — this also naturally hides "Drag Simulator" now that all
-- of its gamepasses were deactivated as a duplicate of "Drag Drive Simulator".
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
from public.games g
where exists (
  select 1 from public.gamepasses gp
  where gp.game_id = g.id and gp.is_active = true
)
order by sort_order;
