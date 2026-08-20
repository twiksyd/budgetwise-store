begin;

create table public.store_product_sections (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  name text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint store_product_sections_name_not_blank
    check (length(btrim(name)) > 0),
  constraint store_product_sections_name_length
    check (char_length(name) <= 48),
  constraint store_product_sections_sort_order_nonnegative
    check (sort_order >= 0)
);

create index store_product_sections_game_order_idx
  on public.store_product_sections (game_id, sort_order, name);

create table public.store_product_presentation (
  gamepass_id uuid primary key references public.gamepasses (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  section_id uuid references public.store_product_sections (id) on delete set null,
  sort_order integer not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint store_product_presentation_sort_order_nonnegative
    check (sort_order >= 0)
);

create index store_product_presentation_game_section_order_idx
  on public.store_product_presentation (game_id, section_id, sort_order);

create or replace function public.set_store_product_sections_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_store_product_sections_updated_at
before update on public.store_product_sections
for each row
execute function public.set_store_product_sections_updated_at();

create or replace function public.set_store_product_presentation_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_store_product_presentation_updated_at
before update on public.store_product_presentation
for each row
execute function public.set_store_product_presentation_updated_at();

alter table public.storefront_presentation_audit_log
  drop constraint storefront_presentation_audit_log_action_check;

alter table public.storefront_presentation_audit_log
  add constraint storefront_presentation_audit_log_action_check
  check (
    action in (
      'update_game_order',
      'update_featured_games',
      'reset_game_order',
      'update_product_layout',
      'reset_product_layout'
    )
  );

alter table public.store_product_sections enable row level security;
alter table public.store_product_presentation enable row level security;

create policy "Public can read product sections"
  on public.store_product_sections
  for select
  to anon, authenticated
  using (true);

create policy "Public can read product presentation"
  on public.store_product_presentation
  for select
  to anon, authenticated
  using (true);

create or replace function public.apply_store_product_layout(
  p_game_id uuid,
  p_sections jsonb,
  p_products jsonb,
  p_admin_user_id uuid,
  p_admin_email text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_section_count integer;
  v_distinct_section_count integer;
  v_product_count integer;
  v_distinct_product_count integer;
  v_matched_product_count integer;
  v_section_refs_count integer;
  v_matched_section_refs_count integer;
begin
  if p_game_id is null then
    raise exception 'p_game_id is required';
  end if;

  if not exists (select 1 from public.games where id = p_game_id) then
    raise exception 'Game % does not exist', p_game_id;
  end if;

  if p_sections is null or jsonb_typeof(p_sections) <> 'array' then
    raise exception 'p_sections must be a JSON array';
  end if;

  if p_products is null or jsonb_typeof(p_products) <> 'array' then
    raise exception 'p_products must be a JSON array';
  end if;

  with incoming_sections as (
    select *
    from jsonb_to_recordset(p_sections)
      as section(id uuid, name text, sort_order integer)
  )
  select count(*), count(distinct id)
  into v_section_count, v_distinct_section_count
  from incoming_sections;

  if v_section_count > 100 then
    raise exception 'Too many product sections supplied';
  end if;

  if v_section_count <> v_distinct_section_count then
    raise exception 'Duplicate section IDs are not allowed';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_sections)
      as section(id uuid, name text, sort_order integer)
    where id is null
      or name is null
      or length(btrim(name)) = 0
      or char_length(name) > 48
      or sort_order is null
      or sort_order < 0
  ) then
    raise exception 'Each section requires an id, 1-48 character name, and non-negative sort_order';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_sections)
      as section(id uuid, name text, sort_order integer)
    join public.store_product_sections existing
      on existing.id = section.id
    where existing.game_id <> p_game_id
  ) then
    raise exception 'Section IDs must belong to the selected game';
  end if;

  with incoming_products as (
    select *
    from jsonb_to_recordset(p_products)
      as product(gamepass_id uuid, section_id uuid, sort_order integer)
  )
  select count(*), count(distinct gamepass_id)
  into v_product_count, v_distinct_product_count
  from incoming_products;

  if v_product_count > 1000 then
    raise exception 'Too many products supplied';
  end if;

  if v_product_count <> v_distinct_product_count then
    raise exception 'Duplicate products are not allowed';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_products)
      as product(gamepass_id uuid, section_id uuid, sort_order integer)
    where gamepass_id is null
      or sort_order is null
      or sort_order < 0
  ) then
    raise exception 'Each product requires a gamepass_id and non-negative sort_order';
  end if;

  with incoming_products as (
    select *
    from jsonb_to_recordset(p_products)
      as product(gamepass_id uuid, section_id uuid, sort_order integer)
  )
  select count(*)
  into v_matched_product_count
  from incoming_products
  join public.gamepasses
    on public.gamepasses.id = incoming_products.gamepass_id
   and public.gamepasses.game_id = p_game_id;

  if v_product_count <> v_matched_product_count then
    raise exception 'All product IDs must reference products in the selected game';
  end if;

  with incoming_products as (
    select *
    from jsonb_to_recordset(p_products)
      as product(gamepass_id uuid, section_id uuid, sort_order integer)
  )
  select count(*)
  into v_section_refs_count
  from incoming_products
  where section_id is not null;

  with incoming_products as (
    select *
    from jsonb_to_recordset(p_products)
      as product(gamepass_id uuid, section_id uuid, sort_order integer)
  ),
  incoming_sections as (
    select *
    from jsonb_to_recordset(p_sections)
      as section(id uuid, name text, sort_order integer)
  )
  select count(*)
  into v_matched_section_refs_count
  from incoming_products
  join incoming_sections on incoming_sections.id = incoming_products.section_id
  where incoming_products.section_id is not null;

  if v_section_refs_count <> v_matched_section_refs_count then
    raise exception 'Product section IDs must reference sections in this save payload';
  end if;

  with incoming_sections as (
    select *
    from jsonb_to_recordset(p_sections)
      as section(id uuid, name text, sort_order integer)
  )
  delete from public.store_product_sections existing
  where existing.game_id = p_game_id
    and not exists (
      select 1 from incoming_sections where incoming_sections.id = existing.id
    );

  with incoming_sections as (
    select *
    from jsonb_to_recordset(p_sections)
      as section(id uuid, name text, sort_order integer)
  )
  insert into public.store_product_sections (
    id,
    game_id,
    name,
    sort_order,
    updated_by
  )
  select
    id,
    p_game_id,
    btrim(name),
    sort_order,
    p_admin_user_id
  from incoming_sections
  on conflict (id) do update
    set name = excluded.name,
        sort_order = excluded.sort_order,
        updated_by = p_admin_user_id;

  with incoming_products as (
    select *
    from jsonb_to_recordset(p_products)
      as product(gamepass_id uuid, section_id uuid, sort_order integer)
  )
  insert into public.store_product_presentation (
    gamepass_id,
    game_id,
    section_id,
    sort_order,
    updated_by
  )
  select
    gamepass_id,
    p_game_id,
    section_id,
    sort_order,
    p_admin_user_id
  from incoming_products
  on conflict (gamepass_id) do update
    set game_id = excluded.game_id,
        section_id = excluded.section_id,
        sort_order = excluded.sort_order,
        updated_by = p_admin_user_id;

  insert into public.storefront_presentation_audit_log (
    action,
    admin_user_id,
    admin_email,
    details
  )
  values (
    'update_product_layout',
    p_admin_user_id,
    p_admin_email,
    jsonb_build_object(
      'gameId',
      p_game_id,
      'sectionCount',
      v_section_count,
      'productCount',
      v_product_count
    )
  );
end;
$$;

revoke all on function public.apply_store_product_layout(
  uuid, jsonb, jsonb, uuid, text
) from public, anon, authenticated;

grant execute on function public.apply_store_product_layout(
  uuid, jsonb, jsonb, uuid, text
) to service_role;

create or replace function public.reset_store_product_layout(
  p_game_id uuid,
  p_admin_user_id uuid,
  p_admin_email text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_game_id is null then
    raise exception 'p_game_id is required';
  end if;

  if not exists (select 1 from public.games where id = p_game_id) then
    raise exception 'Game % does not exist', p_game_id;
  end if;

  delete from public.store_product_presentation
  where game_id = p_game_id;

  delete from public.store_product_sections
  where game_id = p_game_id;

  insert into public.storefront_presentation_audit_log (
    action,
    admin_user_id,
    admin_email,
    details
  )
  values (
    'reset_product_layout',
    p_admin_user_id,
    p_admin_email,
    jsonb_build_object('gameId', p_game_id)
  );
end;
$$;

revoke all on function public.reset_store_product_layout(
  uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.reset_store_product_layout(
  uuid, uuid, text
) to service_role;

grant select on public.store_product_sections to anon, authenticated;
grant select on public.store_product_presentation to anon, authenticated;

-- Seed the existing hardcoded storefront groupings into Store-owned
-- presentation metadata. These one-time seeds resolve current product IDs
-- during migration; future renames keep their placement because the saved
-- rows are keyed by gamepass_id.
with section_seed as (
  select
    '155d2360-c956-4982-9965-9a0b303d749e'::uuid as game_id,
    'b1111111-1111-4111-8111-111111111111'::uuid as section_id,
    'Gamepasses'::text as name,
    0 as sort_order
  union all
  select
    '155d2360-c956-4982-9965-9a0b303d749e'::uuid,
    'b2222222-2222-4222-8222-222222222222'::uuid,
    'EXP Boosts'::text,
    1
  union all
  select
    '155d2360-c956-4982-9965-9a0b303d749e'::uuid,
    'b3333333-3333-4333-8333-333333333333'::uuid,
    'Permanent Fruits'::text,
    2
  union all
  select
    'ec7b0020-d616-485b-a151-f5fc2d541c9b'::uuid,
    'a1111111-1111-4111-8111-111111111111'::uuid,
    'Gamepasses'::text,
    0
  union all
  select
    'ec7b0020-d616-485b-a151-f5fc2d541c9b'::uuid,
    'a2222222-2222-4222-8222-222222222222'::uuid,
    'Fall Egg'::text,
    1
)
insert into public.store_product_sections (id, game_id, name, sort_order)
select section_id, game_id, name, sort_order
from section_seed
where exists (select 1 from public.games where public.games.id = section_seed.game_id)
on conflict (id) do nothing;

with blox_fruits_sections as (
  select
    gamepasses.id as gamepass_id,
    gamepasses.game_id,
    case
      when gamepasses.name in (
        'Dark Blade',
        'Fruit Notifier',
        '2x Mastery',
        '2x Money',
        'Fast Boats',
        '2x Drop Chance',
        '1 Fruit Storage',
        'Change Race',
        'Refund Stats',
        'Respawn Bosses'
      ) then 'b1111111-1111-4111-8111-111111111111'::uuid
      when gamepasses.name ~* '\mEXP$' then 'b2222222-2222-4222-8222-222222222222'::uuid
      else 'b3333333-3333-4333-8333-333333333333'::uuid
    end as section_id,
    row_number() over (
      partition by
        case
          when gamepasses.name in (
            'Dark Blade',
            'Fruit Notifier',
            '2x Mastery',
            '2x Money',
            'Fast Boats',
            '2x Drop Chance',
            '1 Fruit Storage',
            'Change Race',
            'Refund Stats',
            'Respawn Bosses'
          ) then 'gamepasses'
          when gamepasses.name ~* '\mEXP$' then 'exp'
          else 'fruits'
        end
      order by gamepasses.robux_amount asc nulls last, gamepasses.name asc, gamepasses.id asc
    )::integer - 1 as sort_order
  from public.gamepasses
  where gamepasses.game_id = '155d2360-c956-4982-9965-9a0b303d749e'::uuid
    and gamepasses.is_active = true
    and gamepasses.availability_status <> 'hidden'
),
grow_garden_sections as (
  select
    gamepasses.id as gamepass_id,
    gamepasses.game_id,
    case
      when gamepasses.name ~* '^[0-9]+\s*roll\s*fall\s*egg$'
        then 'a2222222-2222-4222-8222-222222222222'::uuid
      else 'a1111111-1111-4111-8111-111111111111'::uuid
    end as section_id,
    row_number() over (
      partition by
        case
          when gamepasses.name ~* '^[0-9]+\s*roll\s*fall\s*egg$'
            then 'fall_egg'
          else 'gamepasses'
        end
      order by gamepasses.robux_amount asc nulls last, gamepasses.name asc, gamepasses.id asc
    )::integer - 1 as sort_order
  from public.gamepasses
  where gamepasses.game_id = 'ec7b0020-d616-485b-a151-f5fc2d541c9b'::uuid
    and gamepasses.is_active = true
    and gamepasses.availability_status <> 'hidden'
),
seeded_products as (
  select * from blox_fruits_sections
  union all
  select * from grow_garden_sections
)
insert into public.store_product_presentation (
  gamepass_id,
  game_id,
  section_id,
  sort_order
)
select
  gamepass_id,
  game_id,
  section_id,
  sort_order
from seeded_products
on conflict (gamepass_id) do nothing;

commit;
