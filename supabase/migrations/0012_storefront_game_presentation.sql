begin;

create table public.store_game_presentation (
  game_id uuid primary key references public.games (id) on delete cascade,
  sort_order integer not null,
  is_featured boolean not null default false,
  featured_order integer,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint store_game_presentation_sort_order_nonnegative
    check (sort_order >= 0),
  constraint store_game_presentation_featured_order_shape
    check (
      (is_featured = true and featured_order is not null and featured_order >= 0)
      or
      (is_featured = false and featured_order is null)
    )
);

create table public.storefront_presentation_settings (
  id boolean primary key default true,
  featured_game_limit integer not null default 6,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint storefront_presentation_settings_singleton check (id),
  constraint storefront_presentation_featured_limit_range
    check (featured_game_limit between 1 and 12)
);

insert into public.storefront_presentation_settings (id, featured_game_limit)
values (true, 6);

with default_order as (
  select
    id as game_id,
    row_number() over (
      order by sort_order asc nulls last, name asc, id asc
    )::integer - 1 as sort_order
  from public.games
)
insert into public.store_game_presentation (game_id, sort_order)
select game_id, sort_order
from default_order;

with default_featured as (
  select
    ordered.game_id,
    row_number() over (
      order by ordered.sort_order asc
    )::integer - 1 as featured_order
  from public.store_game_presentation ordered
  join public.games on public.games.id = ordered.game_id
  where public.games.availability_status = 'available'
  order by ordered.sort_order asc
  limit 6
)
update public.store_game_presentation
set is_featured = true,
    featured_order = default_featured.featured_order
from default_featured
where public.store_game_presentation.game_id = default_featured.game_id;

create table public.storefront_presentation_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null
    check (action in ('update_game_order', 'update_featured_games', 'reset_game_order')),
  admin_user_id uuid references auth.users (id) on delete set null,
  admin_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.store_game_presentation enable row level security;
alter table public.storefront_presentation_settings enable row level security;
alter table public.storefront_presentation_audit_log enable row level security;

create policy "Public can read game presentation"
  on public.store_game_presentation
  for select
  to anon, authenticated
  using (true);

create policy "Public can read storefront presentation settings"
  on public.storefront_presentation_settings
  for select
  to anon, authenticated
  using (true);

create or replace function public.apply_store_game_order(
  p_game_ids jsonb,
  p_admin_user_id uuid,
  p_admin_email text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_input_count integer;
  v_distinct_count integer;
  v_matched_count integer;
begin
  if p_game_ids is null or jsonb_typeof(p_game_ids) <> 'array' then
    raise exception 'p_game_ids must be a JSON array';
  end if;

  with incoming as (
    select value as game_id_text, ordinality::integer - 1 as sort_order
    from jsonb_array_elements_text(p_game_ids) with ordinality
  )
  select count(*), count(distinct game_id_text)
  into v_input_count, v_distinct_count
  from incoming;

  if v_input_count = 0 then
    raise exception 'At least one game is required';
  end if;

  if v_input_count > 500 then
    raise exception 'Too many games supplied';
  end if;

  if v_input_count <> v_distinct_count then
    raise exception 'Duplicate game IDs are not allowed';
  end if;

  with incoming as (
    select value as game_id_text, ordinality::integer - 1 as sort_order
    from jsonb_array_elements_text(p_game_ids) with ordinality
  ),
  matched as (
    select incoming.game_id_text::uuid as game_id, incoming.sort_order
    from incoming
    join public.games on public.games.id = incoming.game_id_text::uuid
  )
  select count(*)
  into v_matched_count
  from matched;

  if v_input_count <> v_matched_count then
    raise exception 'All game IDs must reference existing games';
  end if;

  with incoming as (
    select value::uuid as game_id, ordinality::integer - 1 as sort_order
    from jsonb_array_elements_text(p_game_ids) with ordinality
  )
  insert into public.store_game_presentation (
    game_id,
    sort_order,
    updated_at,
    updated_by
  )
  select game_id, sort_order, now(), p_admin_user_id
  from incoming
  on conflict (game_id) do update
    set sort_order = excluded.sort_order,
        updated_at = now(),
        updated_by = p_admin_user_id;

  insert into public.storefront_presentation_audit_log (
    action,
    admin_user_id,
    admin_email,
    details
  )
  values (
    'update_game_order',
    p_admin_user_id,
    p_admin_email,
    jsonb_build_object('gameIds', p_game_ids)
  );
end;
$$;

revoke all on function public.apply_store_game_order(jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.apply_store_game_order(jsonb, uuid, text) to service_role;

create or replace function public.apply_featured_games(
  p_featured_game_ids jsonb,
  p_featured_game_limit integer,
  p_admin_user_id uuid,
  p_admin_email text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_input_count integer;
  v_distinct_count integer;
  v_matched_count integer;
begin
  if p_featured_game_ids is null or jsonb_typeof(p_featured_game_ids) <> 'array' then
    raise exception 'p_featured_game_ids must be a JSON array';
  end if;

  if p_featured_game_limit is null or p_featured_game_limit < 1 or p_featured_game_limit > 12 then
    raise exception 'featured game limit must be between 1 and 12';
  end if;

  with incoming as (
    select value as game_id_text, ordinality::integer - 1 as featured_order
    from jsonb_array_elements_text(p_featured_game_ids) with ordinality
  )
  select count(*), count(distinct game_id_text)
  into v_input_count, v_distinct_count
  from incoming;

  if v_input_count > 500 then
    raise exception 'Too many featured games supplied';
  end if;

  if v_input_count <> v_distinct_count then
    raise exception 'Duplicate featured game IDs are not allowed';
  end if;

  with incoming as (
    select value as game_id_text, ordinality::integer - 1 as featured_order
    from jsonb_array_elements_text(p_featured_game_ids) with ordinality
  ),
  matched as (
    select incoming.game_id_text::uuid as game_id, incoming.featured_order
    from incoming
    join public.games on public.games.id = incoming.game_id_text::uuid
  )
  select count(*)
  into v_matched_count
  from matched;

  if v_input_count <> v_matched_count then
    raise exception 'All featured game IDs must reference existing games';
  end if;

  update public.store_game_presentation
  set is_featured = false,
      featured_order = null,
      updated_at = now(),
      updated_by = p_admin_user_id
  where is_featured = true;

  with incoming as (
    select value::uuid as game_id, ordinality::integer - 1 as featured_order
    from jsonb_array_elements_text(p_featured_game_ids) with ordinality
  ),
  fallback_order as (
    select coalesce(max(sort_order), -1) as max_sort_order
    from public.store_game_presentation
  )
  insert into public.store_game_presentation (
    game_id,
    sort_order,
    is_featured,
    featured_order,
    updated_at,
    updated_by
  )
  select
    incoming.game_id,
    coalesce(
      public.store_game_presentation.sort_order,
      fallback_order.max_sort_order + incoming.featured_order + 1
    ),
    true,
    incoming.featured_order,
    now(),
    p_admin_user_id
  from incoming
  cross join fallback_order
  left join public.store_game_presentation
    on public.store_game_presentation.game_id = incoming.game_id
  on conflict (game_id) do update
    set is_featured = true,
        featured_order = excluded.featured_order,
        updated_at = now(),
        updated_by = p_admin_user_id;

  insert into public.storefront_presentation_settings (
    id,
    featured_game_limit,
    updated_at,
    updated_by
  )
  values (true, p_featured_game_limit, now(), p_admin_user_id)
  on conflict (id) do update
    set featured_game_limit = excluded.featured_game_limit,
        updated_at = now(),
        updated_by = p_admin_user_id;

  insert into public.storefront_presentation_audit_log (
    action,
    admin_user_id,
    admin_email,
    details
  )
  values (
    'update_featured_games',
    p_admin_user_id,
    p_admin_email,
    jsonb_build_object(
      'featuredGameIds',
      p_featured_game_ids,
      'featuredGameLimit',
      p_featured_game_limit
    )
  );
end;
$$;

revoke all on function public.apply_featured_games(jsonb, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.apply_featured_games(jsonb, integer, uuid, text) to service_role;

create or replace function public.reset_store_game_order(
  p_admin_user_id uuid,
  p_admin_email text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  with default_order as (
    select
      id as game_id,
      row_number() over (
        order by sort_order asc nulls last, name asc, id asc
      )::integer - 1 as sort_order
    from public.games
  )
  insert into public.store_game_presentation (
    game_id,
    sort_order,
    updated_at,
    updated_by
  )
  select game_id, sort_order, now(), p_admin_user_id
  from default_order
  on conflict (game_id) do update
    set sort_order = excluded.sort_order,
        updated_at = now(),
        updated_by = p_admin_user_id;

  insert into public.storefront_presentation_audit_log (
    action,
    admin_user_id,
    admin_email,
    details
  )
  values (
    'reset_game_order',
    p_admin_user_id,
    p_admin_email,
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.reset_store_game_order(uuid, text) from public, anon, authenticated;
grant execute on function public.reset_store_game_order(uuid, text) to service_role;

grant select on public.store_game_presentation to anon, authenticated;
grant select on public.storefront_presentation_settings to anon, authenticated;

commit;
