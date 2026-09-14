-- BudgetWise Store: order integrity (immutable slips, protected slip access,
-- server-side idempotency).
--
-- Purely additive. This migration does not drop, alter, or delete anything
-- that already exists, and it does not touch the XOB-owned `orders` /
-- `order_items` shape:
--
--   * `orders` keeps one row per cart line, all rows sharing one BW order
--     number, with exactly the same column set the Store already writes.
--     XOB renders each `orders` row independently and uses its own
--     `order_items` table for its own multi-item orders — the Store still
--     writes neither, so nothing XOB sees changes.
--   * XOB's `set_order_number` trigger only fires when order_number IS NULL,
--     so `BW-XXXXXX` continues to survive insert untouched.
--
-- What is new is a Store-owned snapshot of what the customer actually
-- submitted, so a historical order slip can be rebuilt without reading
-- current catalog pricing/naming/availability, plus the two integrity
-- guarantees that hang off the same header row: an unguessable viewing
-- credential (stored hashed) and a UNIQUE idempotency key.

begin;

-- ---------------------------------------------------------------------------
-- Order header snapshot
--
-- order_number is the primary key: one logical BudgetWise order, one row.
-- That also closes a latent hole — with `orders_order_number_key` dropped in
-- migration 0002, two checkouts drawing the same random BW code would
-- silently merge into one logical order. They now collide here instead, and
-- the caller retries with a fresh code.
--
-- Deliberately holds NO cost, profit, supplier, or internal account data:
-- this is the table the public order slip reads from.
-- ---------------------------------------------------------------------------
create table public.store_order_snapshots (
  order_number text primary key,
  -- Client-generated, per checkout attempt. The UNIQUE index below is the
  -- actual retry-safety guarantee; nothing relies on select-then-insert.
  idempotency_key text not null,
  -- sha256 of the canonicalised order request, so a replayed key carrying
  -- different order contents is rejected instead of silently returning an
  -- unrelated order.
  request_fingerprint text not null,
  -- sha256 of the viewing token. The raw token is never stored: it only
  -- ever exists in the customer's success URL.
  view_token_hash text not null,
  buyer_name text not null,
  buyer_roblox_username text not null,
  total_amount numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  constraint store_order_snapshots_order_number_length
    check (char_length(order_number) between 3 and 40),
  constraint store_order_snapshots_idempotency_key_length
    check (char_length(idempotency_key) between 20 and 200),
  constraint store_order_snapshots_request_fingerprint_format
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint store_order_snapshots_view_token_hash_format
    check (view_token_hash ~ '^[0-9a-f]{64}$'),
  constraint store_order_snapshots_buyer_name_not_blank
    check (length(btrim(buyer_name)) > 0),
  constraint store_order_snapshots_buyer_name_length
    check (char_length(buyer_name) <= 80),
  constraint store_order_snapshots_buyer_name_no_control
    check (buyer_name !~ '[[:cntrl:]]'),
  constraint store_order_snapshots_buyer_username_not_blank
    check (length(btrim(buyer_roblox_username)) > 0),
  constraint store_order_snapshots_buyer_username_length
    check (char_length(buyer_roblox_username) <= 50),
  constraint store_order_snapshots_buyer_username_no_control
    check (buyer_roblox_username !~ '[[:cntrl:]]'),
  constraint store_order_snapshots_total_non_negative
    check (total_amount >= 0)
);

-- The idempotency guarantee. Two concurrent requests carrying the same key
-- cannot both create a logical order: one inserts, the other conflicts and
-- resolves to the winner's order number.
create unique index store_order_snapshots_idempotency_key_idx
  on public.store_order_snapshots (idempotency_key);

-- ---------------------------------------------------------------------------
-- Order line snapshots
--
-- gamepass_id / game_id are stored as plain uuids with NO foreign key on
-- purpose. A historical slip must survive a product being deleted, hidden,
-- or having its id rotated upstream (see migration 0011 for how real that
-- risk is here) — a cascading or nulling FK would let catalog lifecycle
-- events rewrite history, which is exactly what this table exists to stop.
--
-- robux_amount and unit_price are PER UNIT; line_total is what the customer
-- was actually charged for the line. game_name is the presentation name used
-- on the slip (e.g. "Robux Via Plus"), not necessarily games.name.
-- ---------------------------------------------------------------------------
create table public.store_order_line_snapshots (
  id uuid primary key default gen_random_uuid(),
  order_number text not null
    references public.store_order_snapshots (order_number) on delete cascade,
  line_index integer not null,
  gamepass_id uuid,
  game_id uuid,
  product_name text not null,
  game_name text not null,
  robux_amount integer not null,
  quantity integer not null,
  unit_price numeric(10, 2) not null,
  line_total numeric(10, 2) not null,
  is_via_plus boolean not null default false,
  created_at timestamptz not null default now(),
  constraint store_order_line_snapshots_line_index_non_negative
    check (line_index >= 0),
  constraint store_order_line_snapshots_product_name_not_blank
    check (length(btrim(product_name)) > 0),
  constraint store_order_line_snapshots_product_name_length
    check (char_length(product_name) <= 200),
  constraint store_order_line_snapshots_game_name_not_blank
    check (length(btrim(game_name)) > 0),
  constraint store_order_line_snapshots_game_name_length
    check (char_length(game_name) <= 200),
  constraint store_order_line_snapshots_robux_non_negative
    check (robux_amount >= 0),
  constraint store_order_line_snapshots_quantity_positive
    check (quantity > 0),
  constraint store_order_line_snapshots_unit_price_non_negative
    check (unit_price >= 0),
  constraint store_order_line_snapshots_line_total_non_negative
    check (line_total >= 0)
);

create unique index store_order_line_snapshots_order_line_idx
  on public.store_order_line_snapshots (order_number, line_index);

-- ---------------------------------------------------------------------------
-- Atomic order creation
--
-- One transaction covers the snapshot header, every `orders` row, every line
-- snapshot, and the Via Plus metadata — so a failure part-way can no longer
-- leave a half-created logical order behind (the previous flow inserted
-- `orders` rows and then compensated by deleting them if the Via Plus insert
-- failed).
--
-- Error contract (custom SQLSTATEs so the caller never has to string-match):
--   BW001 ORDER_NUMBER_COLLISION — BW code already taken; caller retries.
--   BW002 IDEMPOTENCY_KEY_REUSED — same key, different order contents.
--   BW003 ORDER_CREATE_RETRY     — key holder vanished mid-flight; retry.
-- ---------------------------------------------------------------------------
create or replace function public.create_store_order(
  p_idempotency_key text,
  p_request_fingerprint text,
  p_view_token_hash text,
  p_order_number text,
  p_buyer_name text,
  p_buyer_roblox_username text,
  p_total_amount numeric,
  p_lines jsonb,
  p_via_plus jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_inserted_order_number text;
  v_existing_order_number text;
  v_existing_fingerprint text;
  v_line jsonb;
  v_line_index integer := 0;
begin
  if p_lines is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) = 0
  then
    raise exception 'create_store_order requires at least one order line';
  end if;

  begin
    insert into public.store_order_snapshots (
      order_number,
      idempotency_key,
      request_fingerprint,
      view_token_hash,
      buyer_name,
      buyer_roblox_username,
      total_amount
    )
    values (
      p_order_number,
      p_idempotency_key,
      p_request_fingerprint,
      p_view_token_hash,
      p_buyer_name,
      p_buyer_roblox_username,
      p_total_amount
    )
    on conflict (idempotency_key) do nothing
    returning order_number into v_inserted_order_number;
  exception
    when unique_violation then
      -- Only the primary key can land here: the idempotency key is handled
      -- by the ON CONFLICT clause above.
      raise exception 'ORDER_NUMBER_COLLISION' using errcode = 'BW001';
  end;

  if v_inserted_order_number is null then
    -- ON CONFLICT DO NOTHING waits out any in-flight duplicate, so reaching
    -- here means a committed row already owns this key.
    select order_number, request_fingerprint
      into v_existing_order_number, v_existing_fingerprint
      from public.store_order_snapshots
     where idempotency_key = p_idempotency_key;

    if not found then
      raise exception 'ORDER_CREATE_RETRY' using errcode = 'BW003';
    end if;

    if v_existing_fingerprint is distinct from p_request_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'BW002';
    end if;

    return jsonb_build_object(
      'order_number', v_existing_order_number,
      'replayed', true
    );
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    -- Unchanged `orders` shape: same columns, same values, one row per line,
    -- all sharing p_order_number. This is what XOB reads.
    insert into public.orders (
      user_id,
      order_number,
      gamepass_id,
      buyer_name,
      buyer_roblox_username,
      robux_amount,
      selling_price,
      cost,
      profit,
      status
    )
    values (
      (v_line ->> 'user_id')::uuid,
      p_order_number,
      (v_line ->> 'gamepass_id')::uuid,
      p_buyer_name,
      p_buyer_roblox_username,
      (v_line ->> 'line_robux_amount')::integer,
      (v_line ->> 'line_total')::numeric,
      (v_line ->> 'line_cost')::numeric,
      (v_line ->> 'line_profit')::numeric,
      'pending'
    );

    insert into public.store_order_line_snapshots (
      order_number,
      line_index,
      gamepass_id,
      game_id,
      product_name,
      game_name,
      robux_amount,
      quantity,
      unit_price,
      line_total,
      is_via_plus
    )
    values (
      p_order_number,
      v_line_index,
      (v_line ->> 'gamepass_id')::uuid,
      (v_line ->> 'game_id')::uuid,
      v_line ->> 'product_name',
      v_line ->> 'game_name',
      (v_line ->> 'robux_amount')::integer,
      (v_line ->> 'quantity')::integer,
      (v_line ->> 'unit_price')::numeric,
      (v_line ->> 'line_total')::numeric,
      coalesce((v_line ->> 'is_via_plus')::boolean, false)
    );

    v_line_index := v_line_index + 1;
  end loop;

  if p_via_plus is not null and jsonb_typeof(p_via_plus) = 'object' then
    insert into public.store_order_via_plus_details (
      order_number,
      roblox_display_name,
      age_16_confirmed,
      verified_account_confirmed,
      via_plus_robux_amount
    )
    values (
      p_order_number,
      p_via_plus ->> 'roblox_display_name',
      (p_via_plus ->> 'age_16_confirmed')::boolean,
      (p_via_plus ->> 'verified_account_confirmed')::boolean,
      (p_via_plus ->> 'via_plus_robux_amount')::integer
    );
  end if;

  return jsonb_build_object('order_number', p_order_number, 'replayed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Access control
--
-- Both snapshot tables carry customer contact details, so they stay entirely
-- off the public API surface. The Store reads them with the service-role key
-- from server-only code after verifying the viewing token.
-- ---------------------------------------------------------------------------
alter table public.store_order_snapshots enable row level security;
alter table public.store_order_line_snapshots enable row level security;

revoke all on public.store_order_snapshots from anon, authenticated;
revoke all on public.store_order_line_snapshots from anon, authenticated;

revoke all on function public.create_store_order(
  text, text, text, text, text, text, numeric, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.create_store_order(
  text, text, text, text, text, text, numeric, jsonb, jsonb
) to service_role;

notify pgrst, 'reload schema';

commit;
