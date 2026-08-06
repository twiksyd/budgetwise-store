-- Phase 3A: Store-owned product artwork overrides.
--
-- XOB remains the source of truth for products, prices, inventory, and
-- availability. This table only stores storefront presentation choices for
-- product artwork. It deliberately has no foreign key to public.gamepasses,
-- matching the loose-coupling pattern used by roblox_gamepass_icon_cache.

create table public.product_artwork_overrides (
  gamepass_id uuid primary key,
  source text not null check (source in ('manual', 'placeholder')),
  icon_url text,
  storage_path text,
  original_url text,
  content_type text,
  file_size_bytes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint product_artwork_override_shape check (
    (source = 'manual' and icon_url is not null)
    or
    (source = 'placeholder' and icon_url is null)
  )
);

create table public.product_artwork_audit_log (
  id uuid primary key default gen_random_uuid(),
  gamepass_id uuid not null,
  action text not null check (
    action in (
      'manual_upload',
      'manual_url',
      'restore_roblox',
      'restore_placeholder'
    )
  ),
  previous_source text,
  next_source text,
  previous_icon_url text,
  next_icon_url text,
  admin_user_id uuid references auth.users (id) on delete set null,
  admin_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index product_artwork_audit_gamepass_idx
  on public.product_artwork_audit_log (gamepass_id, created_at desc);

alter table public.product_artwork_overrides enable row level security;
alter table public.product_artwork_audit_log enable row level security;

-- No anon/authenticated policies on purpose. Product artwork mutations and
-- admin reads go through server-only service-role code after requireAdmin().

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'product-artwork',
  'product-artwork',
  true,
  4194304,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
