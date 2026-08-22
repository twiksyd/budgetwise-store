create table public.store_product_card_backgrounds (
  gamepass_id uuid primary key,
  image_url text not null,
  storage_path text not null unique,
  content_type text not null,
  file_size_bytes integer not null,
  product_name text,
  game_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint store_product_card_backgrounds_supported_type
    check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
  constraint store_product_card_backgrounds_valid_size
    check (file_size_bytes between 1 and 4194304),
  constraint store_product_card_backgrounds_no_blank_url
    check (length(btrim(image_url)) > 0),
  constraint store_product_card_backgrounds_no_blank_storage_path
    check (length(btrim(storage_path)) > 0)
);

create or replace function public.set_store_product_card_backgrounds_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_store_product_card_backgrounds_updated_at
before update on public.store_product_card_backgrounds
for each row
execute function public.set_store_product_card_backgrounds_updated_at();

alter table public.store_product_card_backgrounds enable row level security;

revoke all on public.store_product_card_backgrounds from anon, authenticated;

notify pgrst, 'reload schema';
