create table public.store_order_via_plus_details (
  order_number text primary key,
  roblox_display_name text not null,
  age_16_confirmed boolean not null,
  verified_account_confirmed boolean not null,
  via_plus_robux_amount integer not null,
  created_at timestamptz not null default now(),
  constraint store_order_via_plus_details_display_name_not_blank
    check (length(btrim(roblox_display_name)) > 0),
  constraint store_order_via_plus_details_display_name_length
    check (char_length(roblox_display_name) <= 80),
  constraint store_order_via_plus_details_display_name_no_control
    check (roblox_display_name !~ '[[:cntrl:]]'),
  constraint store_order_via_plus_details_age_confirmed
    check (age_16_confirmed is true),
  constraint store_order_via_plus_details_verified_confirmed
    check (verified_account_confirmed is true),
  constraint store_order_via_plus_details_amount_positive
    check (via_plus_robux_amount > 0)
);

alter table public.store_order_via_plus_details enable row level security;

revoke all on public.store_order_via_plus_details from anon, authenticated;
