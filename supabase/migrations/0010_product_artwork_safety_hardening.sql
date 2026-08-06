-- Phase 3A safety hardening for Store-owned product artwork overrides.
--
-- Migration 0009 has already created the base tables and storage bucket.
-- This follow-up keeps migration history honest by altering the existing
-- Store-owned objects instead of editing an applied migration.

begin;

alter table public.product_artwork_overrides
  add column manual_kind text;

alter table public.product_artwork_overrides
  add constraint product_artwork_override_manual_kind
  check (
    manual_kind is null
    or manual_kind in ('upload', 'remote')
  );

alter table public.product_artwork_overrides
  drop constraint product_artwork_override_shape;

alter table public.product_artwork_overrides
  add constraint product_artwork_override_shape
  check (
    (
      source = 'placeholder'
      and manual_kind is null
      and icon_url is null
      and storage_path is null
      and original_url is null
      and content_type is null
      and file_size_bytes is null
    )
    or
    (
      source = 'manual'
      and manual_kind is not null
      and manual_kind = 'upload'
      and icon_url is not null
      and storage_path is not null
      and original_url is null
      and content_type is not null
      and content_type in ('image/png', 'image/jpeg', 'image/webp')
      and file_size_bytes is not null
      and file_size_bytes between 1 and 4194304
    )
    or
    (
      source = 'manual'
      and manual_kind is not null
      and manual_kind = 'remote'
      and icon_url is not null
      and storage_path is not null
      and original_url is null
      and content_type is not null
      and content_type in ('image/png', 'image/jpeg', 'image/webp')
      and file_size_bytes is not null
      and file_size_bytes between 1 and 4194304
    )
  );

create function public.set_product_artwork_overrides_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_product_artwork_overrides_updated_at
before update on public.product_artwork_overrides
for each row
execute function public.set_product_artwork_overrides_updated_at();

create function public.apply_product_artwork_override(
  p_gamepass_id uuid,
  p_action text,
  p_source text default null,
  p_manual_kind text default null,
  p_icon_url text default null,
  p_storage_path text default null,
  p_content_type text default null,
  p_file_size_bytes integer default null,
  p_admin_user_id uuid default null,
  p_admin_email text default null,
  p_details jsonb default '{}'::jsonb
)
returns table (
  previous_source text,
  previous_icon_url text,
  previous_storage_path text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  previous public.product_artwork_overrides%rowtype;
begin
  if p_gamepass_id is null then
    raise exception 'Invalid product artwork argument: p_gamepass_id is required.';
  end if;

  if p_action is null then
    raise exception 'Invalid product artwork argument: p_action is required.';
  end if;

  if p_action not in (
    'manual_upload',
    'manual_url',
    'restore_roblox',
    'restore_placeholder'
  ) then
    raise exception 'Invalid product artwork action: %', p_action;
  end if;

  if p_action = 'manual_upload' and (
    p_source is distinct from 'manual'
    or p_manual_kind is distinct from 'upload'
    or p_icon_url is null
    or p_storage_path is null
    or p_content_type is null
    or p_content_type not in ('image/png', 'image/jpeg', 'image/webp')
    or p_file_size_bytes is null
    or p_file_size_bytes not between 1 and 4194304
  ) then
    raise exception 'manual_upload requires a manual upload payload with stored image metadata.';
  end if;

  if p_action = 'manual_url' and (
    p_source is distinct from 'manual'
    or p_manual_kind is distinct from 'remote'
    or p_icon_url is null
    or p_storage_path is null
    or p_content_type is null
    or p_content_type not in ('image/png', 'image/jpeg', 'image/webp')
    or p_file_size_bytes is null
    or p_file_size_bytes not between 1 and 4194304
  ) then
    raise exception 'manual_url requires a validated remote image copied into Store-owned storage.';
  end if;

  if p_action = 'restore_placeholder' and (
    p_source is distinct from 'placeholder'
    or p_manual_kind is not null
    or p_icon_url is not null
    or p_storage_path is not null
    or p_content_type is not null
    or p_file_size_bytes is not null
  ) then
    raise exception 'restore_placeholder requires a placeholder payload without image fields.';
  end if;

  if p_action = 'restore_roblox' and (
    p_source is not null
    or p_manual_kind is not null
    or p_icon_url is not null
    or p_storage_path is not null
    or p_content_type is not null
    or p_file_size_bytes is not null
  ) then
    raise exception 'restore_roblox does not accept artwork payload fields.';
  end if;

  select *
  into previous
  from public.product_artwork_overrides
  where gamepass_id = p_gamepass_id;

  if p_action = 'restore_roblox' then
    delete from public.product_artwork_overrides
    where gamepass_id = p_gamepass_id;
  else
    insert into public.product_artwork_overrides (
      gamepass_id,
      source,
      manual_kind,
      icon_url,
      storage_path,
      original_url,
      content_type,
      file_size_bytes,
      updated_by
    )
    values (
      p_gamepass_id,
      p_source,
      p_manual_kind,
      p_icon_url,
      p_storage_path,
      null,
      p_content_type,
      p_file_size_bytes,
      p_admin_user_id
    )
    on conflict (gamepass_id) do update
    set
      source = excluded.source,
      manual_kind = excluded.manual_kind,
      icon_url = excluded.icon_url,
      storage_path = excluded.storage_path,
      original_url = excluded.original_url,
      content_type = excluded.content_type,
      file_size_bytes = excluded.file_size_bytes,
      updated_by = excluded.updated_by;
  end if;

  insert into public.product_artwork_audit_log (
    gamepass_id,
    action,
    previous_source,
    next_source,
    previous_icon_url,
    next_icon_url,
    admin_user_id,
    admin_email,
    details
  )
  values (
    p_gamepass_id,
    p_action,
    previous.source,
    case
      when p_action = 'restore_roblox' then 'roblox'
      else p_source
    end,
    previous.icon_url,
    p_icon_url,
    p_admin_user_id,
    p_admin_email,
    coalesce(p_details, '{}'::jsonb)
  );

  return query
  select previous.source, previous.icon_url, previous.storage_path;
end;
$$;

revoke all on function public.apply_product_artwork_override(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  uuid,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.apply_product_artwork_override(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  uuid,
  text,
  jsonb
) to service_role;

commit;
