begin;

alter table public.store_game_card_accent_settings
  add column fade_start_percent integer not null default 32,
  add column fade_width_percent integer not null default 46;

alter table public.store_game_card_accent_settings
  add constraint store_game_card_accent_settings_fade_start_range
    check (fade_start_percent >= 30 and fade_start_percent <= 80),
  add constraint store_game_card_accent_settings_fade_width_range
    check (fade_width_percent >= 16 and fade_width_percent <= 56);

drop function public.apply_store_game_card_accent_settings(
  uuid, boolean, numeric, integer, integer, integer, integer, uuid, text
);

create or replace function public.apply_store_game_card_accent_settings(
  p_game_id uuid,
  p_enabled boolean,
  p_blur_px numeric,
  p_offset_x_percent integer,
  p_offset_y_px integer,
  p_scale_percent integer,
  p_opacity_percent integer,
  p_fade_start_percent integer,
  p_fade_width_percent integer,
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

  if p_fade_start_percent is null or p_fade_start_percent < 30 or p_fade_start_percent > 80 then
    raise exception 'p_fade_start_percent must be between 30 and 80';
  end if;

  if p_fade_width_percent is null or p_fade_width_percent < 16 or p_fade_width_percent > 56 then
    raise exception 'p_fade_width_percent must be between 16 and 56';
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
    fade_start_percent,
    fade_width_percent,
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
    p_fade_start_percent,
    p_fade_width_percent,
    p_admin_user_id
  )
  on conflict (game_id) do update
    set enabled = excluded.enabled,
        blur_px = excluded.blur_px,
        offset_x_percent = excluded.offset_x_percent,
        offset_y_px = excluded.offset_y_px,
        scale_percent = excluded.scale_percent,
        opacity_percent = excluded.opacity_percent,
        fade_start_percent = excluded.fade_start_percent,
        fade_width_percent = excluded.fade_width_percent,
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
          'opacityPercent', v_previous.opacity_percent,
          'fadeStartPercent', v_previous.fade_start_percent,
          'fadeWidthPercent', v_previous.fade_width_percent
        )
      end,
      'next',
      jsonb_build_object(
        'enabled', p_enabled,
        'blurPx', p_blur_px,
        'offsetXPercent', p_offset_x_percent,
        'offsetYPx', p_offset_y_px,
        'scalePercent', p_scale_percent,
        'opacityPercent', p_opacity_percent,
        'fadeStartPercent', p_fade_start_percent,
        'fadeWidthPercent', p_fade_width_percent
      )
    )
  );
end;
$$;

revoke all on function public.apply_store_game_card_accent_settings(
  uuid, boolean, numeric, integer, integer, integer, integer, integer, integer, uuid, text
) from public, anon, authenticated;

grant execute on function public.apply_store_game_card_accent_settings(
  uuid, boolean, numeric, integer, integer, integer, integer, integer, integer, uuid, text
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
          'opacityPercent', v_previous.opacity_percent,
          'fadeStartPercent', v_previous.fade_start_percent,
          'fadeWidthPercent', v_previous.fade_width_percent
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

commit;
