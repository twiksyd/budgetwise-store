begin;

create table public.store_product_display_names (
  gamepass_id uuid primary key references public.gamepasses (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint store_product_display_names_not_blank
    check (length(btrim(display_name)) > 0),
  constraint store_product_display_names_length
    check (char_length(display_name) <= 80)
);

create index store_product_display_names_game_idx
  on public.store_product_display_names (game_id);

create or replace function public.set_store_product_display_names_updated_at()
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

create trigger set_store_product_display_names_updated_at
before update on public.store_product_display_names
for each row
execute function public.set_store_product_display_names_updated_at();

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
      'reset_product_layout',
      'update_product_display_name',
      'reset_product_display_name'
    )
  );

alter table public.store_product_display_names enable row level security;

create policy "Public can read product display names"
  on public.store_product_display_names
  for select
  to anon, authenticated
  using (true);

create or replace view public.store_gamepasses as
select
  public.gamepasses.id,
  public.gamepasses.game_id,
  public.gamepasses.name,
  public.gamepasses.robux_amount,
  public.gamepasses.your_price as price,
  public.gamepasses.availability_status,
  public.store_product_display_names.display_name
from public.gamepasses
left join public.store_product_display_names
  on public.store_product_display_names.gamepass_id = public.gamepasses.id
where public.gamepasses.is_active = true
  and public.gamepasses.availability_status <> 'hidden';

grant select on public.store_gamepasses to anon;
grant select on public.store_product_display_names to anon, authenticated;

create or replace function public.apply_store_product_display_name(
  p_gamepass_id uuid,
  p_display_name text,
  p_admin_user_id uuid,
  p_admin_email text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_game_id uuid;
  v_previous_display_name text;
  v_next_display_name text;
  v_action text;
begin
  if p_gamepass_id is null then
    raise exception 'p_gamepass_id is required';
  end if;

  select game_id
  into v_game_id
  from public.gamepasses
  where id = p_gamepass_id;

  if v_game_id is null then
    raise exception 'Product % does not exist', p_gamepass_id;
  end if;

  select display_name
  into v_previous_display_name
  from public.store_product_display_names
  where gamepass_id = p_gamepass_id;

  v_next_display_name = nullif(btrim(coalesce(p_display_name, '')), '');

  if v_next_display_name is not null and char_length(v_next_display_name) > 80 then
    raise exception 'Display name must be 80 characters or less';
  end if;

  if v_next_display_name is null then
    delete from public.store_product_display_names
    where gamepass_id = p_gamepass_id;
    v_action = 'reset_product_display_name';
  else
    insert into public.store_product_display_names (
      gamepass_id,
      game_id,
      display_name,
      updated_by
    )
    values (
      p_gamepass_id,
      v_game_id,
      v_next_display_name,
      p_admin_user_id
    )
    on conflict (gamepass_id) do update
      set game_id = excluded.game_id,
          display_name = excluded.display_name,
          updated_by = p_admin_user_id;
    v_action = 'update_product_display_name';
  end if;

  insert into public.storefront_presentation_audit_log (
    action,
    admin_user_id,
    admin_email,
    details
  )
  values (
    v_action,
    p_admin_user_id,
    p_admin_email,
    jsonb_build_object(
      'gamepassId',
      p_gamepass_id,
      'gameId',
      v_game_id,
      'previousDisplayName',
      v_previous_display_name,
      'nextDisplayName',
      v_next_display_name
    )
  );
end;
$$;

revoke all on function public.apply_store_product_display_name(
  uuid, text, uuid, text
) from public, anon, authenticated;

grant execute on function public.apply_store_product_display_name(
  uuid, text, uuid, text
) to service_role;

commit;
