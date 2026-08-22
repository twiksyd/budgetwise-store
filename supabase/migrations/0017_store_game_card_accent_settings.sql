begin;

create table public.store_game_card_accent_settings (
  game_id uuid primary key references public.games (id) on delete cascade,
  enabled boolean not null default true,
  blur_px numeric(4, 1) not null default 6,
  offset_x_percent integer not null default 55,
  offset_y_px integer not null default 0,
  scale_percent integer not null default 220,
  opacity_percent integer not null default 24,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint store_game_card_accent_settings_blur_range
    check (blur_px >= 0 and blur_px <= 20),
  constraint store_game_card_accent_settings_offset_x_range
    check (offset_x_percent >= 0 and offset_x_percent <= 90),
  constraint store_game_card_accent_settings_offset_y_range
    check (offset_y_px >= -60 and offset_y_px <= 60),
  constraint store_game_card_accent_settings_scale_range
    check (scale_percent >= 120 and scale_percent <= 250),
  constraint store_game_card_accent_settings_opacity_range
    check (opacity_percent >= 5 and opacity_percent <= 35)
);

create or replace function public.set_store_game_card_accent_settings_updated_at()
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

create trigger set_store_game_card_accent_settings_updated_at
before update on public.store_game_card_accent_settings
for each row
execute function public.set_store_game_card_accent_settings_updated_at();

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
      'reset_product_display_name',
      'update_game_card_accent',
      'reset_game_card_accent'
    )
  );

alter table public.store_game_card_accent_settings enable row level security;

create policy "Public can read game card accent settings"
  on public.store_game_card_accent_settings
  for select
  to anon, authenticated
  using (true);

create or replace function public.apply_store_game_card_accent_settings(
  p_game_id uuid,
  p_enabled boolean,
  p_blur_px numeric,
  p_offset_x_percent integer,
  p_offset_y_px integer,
  p_scale_percent integer,
  p_opacity_percent integer,
  p_admin_user_id uuid,
  p_admin_email text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_previous public.store_game_card_accent_settings%rowtype;
begin
  if p_game_id is null then
    raise exception 'p_game_id is required';
  end if;

  if not exists (select 1 from public.games where id = p_game_id) then
    raise exception 'Game % does not exist', p_game_id;
  end if;

  if p_enabled is null then
    raise exception 'p_enabled is required';
  end if;

  if p_blur_px is null or p_blur_px < 0 or p_blur_px > 20 then
    raise exception 'p_blur_px must be between 0 and 20';
  end if;

  if p_offset_x_percent is null or p_offset_x_percent < 0 or p_offset_x_percent > 90 then
    raise exception 'p_offset_x_percent must be between 0 and 90';
  end if;

  if p_offset_y_px is null or p_offset_y_px < -60 or p_offset_y_px > 60 then
    raise exception 'p_offset_y_px must be between -60 and 60';
  end if;

  if p_scale_percent is null or p_scale_percent < 120 or p_scale_percent > 250 then
    raise exception 'p_scale_percent must be between 120 and 250';
  end if;

  if p_opacity_percent is null or p_opacity_percent < 5 or p_opacity_percent > 35 then
    raise exception 'p_opacity_percent must be between 5 and 35';
  end if;

  select *
  into v_previous
  from public.store_game_card_accent_settings
  where game_id = p_game_id;

  insert into public.store_game_card_accent_settings (
    game_id,
    enabled,
    blur_px,
    offset_x_percent,
    offset_y_px,
    scale_percent,
    opacity_percent,
    updated_by
  )
  values (
    p_game_id,
    p_enabled,
    p_blur_px,
    p_offset_x_percent,
    p_offset_y_px,
    p_scale_percent,
    p_opacity_percent,
    p_admin_user_id
  )
  on conflict (game_id) do update
    set enabled = excluded.enabled,
        blur_px = excluded.blur_px,
        offset_x_percent = excluded.offset_x_percent,
        offset_y_px = excluded.offset_y_px,
        scale_percent = excluded.scale_percent,
        opacity_percent = excluded.opacity_percent,
        updated_by = p_admin_user_id;

  insert into public.storefront_presentation_audit_log (
    action,
    admin_user_id,
    admin_email,
    details
  )
  values (
    'update_game_card_accent',
    p_admin_user_id,
    p_admin_email,
    jsonb_build_object(
      'gameId',
      p_game_id,
      'previous',
      case
        when v_previous.game_id is null then null
        else jsonb_build_object(
          'enabled', v_previous.enabled,
          'blurPx', v_previous.blur_px,
          'offsetXPercent', v_previous.offset_x_percent,
          'offsetYPx', v_previous.offset_y_px,
          'scalePercent', v_previous.scale_percent,
          'opacityPercent', v_previous.opacity_percent
        )
      end,
      'next',
      jsonb_build_object(
        'enabled', p_enabled,
        'blurPx', p_blur_px,
        'offsetXPercent', p_offset_x_percent,
        'offsetYPx', p_offset_y_px,
        'scalePercent', p_scale_percent,
        'opacityPercent', p_opacity_percent
      )
    )
  );
end;
$$;

revoke all on function public.apply_store_game_card_accent_settings(
  uuid, boolean, numeric, integer, integer, integer, integer, uuid, text
) from public, anon, authenticated;

grant execute on function public.apply_store_game_card_accent_settings(
  uuid, boolean, numeric, integer, integer, integer, integer, uuid, text
) to service_role;

create or replace function public.reset_store_game_card_accent_settings(
  p_game_id uuid,
  p_admin_user_id uuid,
  p_admin_email text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_previous public.store_game_card_accent_settings%rowtype;
begin
  if p_game_id is null then
    raise exception 'p_game_id is required';
  end if;

  if not exists (select 1 from public.games where id = p_game_id) then
    raise exception 'Game % does not exist', p_game_id;
  end if;

  select *
  into v_previous
  from public.store_game_card_accent_settings
  where game_id = p_game_id;

  delete from public.store_game_card_accent_settings
  where game_id = p_game_id;

  insert into public.storefront_presentation_audit_log (
    action,
    admin_user_id,
    admin_email,
    details
  )
  values (
    'reset_game_card_accent',
    p_admin_user_id,
    p_admin_email,
    jsonb_build_object(
      'gameId',
      p_game_id,
      'previous',
      case
        when v_previous.game_id is null then null
        else jsonb_build_object(
          'enabled', v_previous.enabled,
          'blurPx', v_previous.blur_px,
          'offsetXPercent', v_previous.offset_x_percent,
          'offsetYPx', v_previous.offset_y_px,
          'scalePercent', v_previous.scale_percent,
          'opacityPercent', v_previous.opacity_percent
        )
      end
    )
  );
end;
$$;

revoke all on function public.reset_store_game_card_accent_settings(
  uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.reset_store_game_card_accent_settings(
  uuid, uuid, text
) to service_role;

grant select on public.store_game_card_accent_settings to anon, authenticated;

commit;
