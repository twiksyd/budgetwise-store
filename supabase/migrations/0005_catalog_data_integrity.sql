-- Catalog data integrity pass. Two independent fixes:
--
-- 1. Retire five specific games that were duplicating or superseding other
--    live inventory (decisions made explicitly, not inferred from name
--    similarity — see each comment below for the reasoning):
--
--    - "Blox Burg" vs "Bloxburg": both live with 20 active gamepasses each,
--      at different current prices. Keeping "Bloxburg" (has a category set);
--      hiding "Blox Burg". Pricing/inventory itself is untouched — this only
--      flips the same availability_status flag the Store Operations admin
--      panel already uses, so it's fully reversible from the Dashboard side.
--    - "Drag Simulator": already has zero active gamepasses (fully
--      deactivated back when it was replaced by "Drag Drive Simulator" —
--      see migration 0003's comment). This formalizes that as an explicit
--      status instead of relying on it staying hidden only as a side effect
--      of the store_games view's gamepass-existence check, which fix #2
--      below removes.
--    - "Robux Sell" (legacy, 24 items): superseded by "Robux Sell — Covered
--      Tax" and "Robux Sell — No Tax" (same Robux tiers, newer pricing) plus
--      "ROBUX PLUS" (same pattern for its "(Via Plus)" items). Two items had
--      no successor (a 50-Robux "Via Plus" tier, and an off-ladder "1001
--      Robux / 700 net Tax Covered" row) — confirmed intentionally retired,
--      not migrated anywhere.
--    - "Robux Sell — Covered Tax" and "Robux Sell — No Tax": no longer shown
--      as their own storefront cards — the Store now renders them as the two
--      sections of a single "Robux (Via Link)" page
--      (src/app/(shop)/games/robux-via-link/page.tsx), which queries their
--      gamepasses directly by these game ids. Hiding the parent `games` row
--      only removes their standalone catalog card; store_gamepasses is
--      unaffected since it filters on the gamepass's own status, not the
--      parent game's.
update public.games
set availability_status = 'hidden'
where id in (
  'ba8427f2-95bf-4a4c-b1ba-8c7709448c15', -- Blox Burg (duplicate of Bloxburg)
  '1e6a23e2-e6a5-4d2b-a685-b33c943bcf5a', -- Drag Simulator (duplicate of Drag Drive Simulator)
  'f67125ef-5a16-4e7d-83c0-ec375cfb1f53', -- Robux Sell (legacy, superseded)
  'bf10c2e9-d9f2-4f86-8c7d-5c94b7354a75', -- Robux Sell — Covered Tax (merged into Robux (Via Link))
  'e5318653-6b19-417c-9f89-1a7baa2331aa'  -- Robux Sell — No Tax (merged into Robux (Via Link))
);

-- 2. Automatic availability: previously, store_games only ever showed an
--    'available'-status game if it had at least one active, non-hidden
--    gamepass (migration 0003/0004) — otherwise the game vanished from the
--    storefront entirely rather than showing as unavailable. That's exactly
--    backwards from "the storefront should automatically reflect inventory
--    availability... do NOT remove the game card, mark it unavailable
--    instead" — if XOB deactivates every gamepass for a game (removes it
--    from inventory) without explicitly setting availability_status, the
--    card should stay visible and read as unavailable, not disappear.
--
--    Fix: stop using gamepass existence to decide *visibility* — only
--    `availability_status = 'hidden'` does that now, an explicit, admin-
--    controlled decision. Instead, a game whose own status is 'available'
--    but has zero purchasable gamepasses gets its status *derived* to
--    'temporarily_unavailable' in the view output. The existing unavailable
--    treatment (ribbon, disabled ordering) already handles that status —
--    no component changes needed. 'coming_soon' is untouched: zero
--    gamepasses is expected for a game that hasn't launched yet.
create or replace view public.store_games as
select
  g.id,
  g.name,
  regexp_replace(lower(trim(g.name)), '[^a-z0-9]+', '-', 'g') as slug,
  g.category,
  g.color,
  g.icon_url,
  g.sort_order,
  g.is_discounted,
  case
    when g.availability_status = 'available'
      and not exists (
        select 1 from public.gamepasses gp
        where gp.game_id = g.id
          and gp.is_active = true
          and gp.availability_status <> 'hidden'
      )
    then 'temporarily_unavailable'
    else g.availability_status
  end as availability_status
from public.games g
where g.availability_status <> 'hidden'
order by g.sort_order;

grant select on public.store_games to anon;
