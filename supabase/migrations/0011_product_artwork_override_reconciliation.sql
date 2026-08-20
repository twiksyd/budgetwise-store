-- Safety net for the failure mode discovered 2026-08-18: XOB re-imports
-- public.gamepasses by inserting fresh rows with new UUIDs instead of
-- updating existing ones in place (283 rows landed in one bulk insert
-- on 2026-08-17). Because product_artwork_overrides deliberately has no
-- foreign key to gamepasses (see migration 0009's comment — this pilot
-- must not couple to XOB's schema), every override tied to a
-- since-replaced gamepass_id goes silently orphaned: the row is still
-- there, but nothing can match it to the "new" version of the same
-- product. Overrides created before name snapshots existed can be difficult
-- or impossible to recover automatically.
--
-- Two changes:
-- 1. Snapshot product_name/game_id onto every override going forward, so
--    a future orphan can be name-matched against the current catalog
--    instead of becoming unrecoverable.
-- 2. A relink function admins can call (via the Artwork Recovery admin
--    page) to re-point an orphaned override at its replacement gamepass_id
--    without re-uploading the image.

begin;

alter table public.product_artwork_overrides
  add column product_name text;

alter table public.product_artwork_overrides
  add column game_id uuid;

alter table public.product_artwork_audit_log
  drop constraint product_artwork_audit_log_action_check;

alter table public.product_artwork_audit_log
  add constraint product_artwork_audit_log_action_check
  check (
    action in (
      'manual_upload',
      'manual_url',
      'restore_roblox',
      'restore_placeholder',
      'relink'
    )
  );

-- Extend the existing apply function with two optional snapshot params.
-- Adding trailing-default parameters changes the function's argument-type
-- signature, so CREATE OR REPLACE would create a second overload instead of
-- replacing it (ambiguous for callers relying on defaults) — drop the old
-- 11-arg signature first so there is exactly one version.
drop function if exists public.apply_product_artwork_override(
  uuid, text, text, text, text, text, text, integer, uuid, text, jsonb
);

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
  p_details jsonb default '{}'::jsonb,
  p_product_name text default null,
  p_game_id uuid default null
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
      updated_by,
      product_name,
      game_id
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
      p_admin_user_id,
      p_product_name,
      p_game_id
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
      updated_by = excluded.updated_by,
      product_name = coalesce(excluded.product_name, public.product_artwork_overrides.product_name),
      game_id = coalesce(excluded.game_id, public.product_artwork_overrides.game_id);
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
  jsonb,
  text,
  uuid
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
  jsonb,
  text,
  uuid
) to service_role;

-- Re-point an orphaned override at its replacement gamepass_id after an
-- upstream re-import, without touching the stored image. Refuses to clobber
-- an override that already exists on the target row — that would silently
-- destroy someone else's independent edit.
create function public.relink_product_artwork_override(
  p_old_gamepass_id uuid,
  p_new_gamepass_id uuid,
  p_product_name text default null,
  p_game_id uuid default null,
  p_admin_user_id uuid default null,
  p_admin_email text default null
)
returns table (
  relinked_source text,
  relinked_icon_url text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  old_row public.product_artwork_overrides%rowtype;
begin
  if p_old_gamepass_id is null or p_new_gamepass_id is null then
    raise exception 'relink_product_artwork_override requires both the old and new gamepass id.';
  end if;

  if p_old_gamepass_id = p_new_gamepass_id then
    raise exception 'Old and new gamepass id cannot be the same.';
  end if;

  if not exists (select 1 from public.gamepasses where id = p_new_gamepass_id) then
    raise exception 'Target gamepass % does not exist.', p_new_gamepass_id;
  end if;

  select *
  into old_row
  from public.product_artwork_overrides
  where gamepass_id = p_old_gamepass_id;

  if not found then
    raise exception 'No artwork override exists for gamepass %.', p_old_gamepass_id;
  end if;

  if exists (select 1 from public.product_artwork_overrides where gamepass_id = p_new_gamepass_id) then
    raise exception 'Target gamepass % already has its own artwork override — resolve manually.', p_new_gamepass_id;
  end if;

  insert into public.product_artwork_overrides (
    gamepass_id,
    source,
    manual_kind,
    icon_url,
    storage_path,
    original_url,
    content_type,
    file_size_bytes,
    updated_by,
    product_name,
    game_id
  )
  values (
    p_new_gamepass_id,
    old_row.source,
    old_row.manual_kind,
    old_row.icon_url,
    old_row.storage_path,
    old_row.original_url,
    old_row.content_type,
    old_row.file_size_bytes,
    p_admin_user_id,
    coalesce(p_product_name, old_row.product_name),
    coalesce(p_game_id, old_row.game_id)
  );

  delete from public.product_artwork_overrides where gamepass_id = p_old_gamepass_id;

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
    p_new_gamepass_id,
    'relink',
    old_row.source,
    old_row.source,
    old_row.icon_url,
    old_row.icon_url,
    p_admin_user_id,
    p_admin_email,
    jsonb_build_object('relinked_from', p_old_gamepass_id)
  );

  return query select old_row.source, old_row.icon_url;
end;
$$;

revoke all on function public.relink_product_artwork_override(
  uuid, uuid, text, uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.relink_product_artwork_override(
  uuid, uuid, text, uuid, uuid, text
) to service_role;

commit;
