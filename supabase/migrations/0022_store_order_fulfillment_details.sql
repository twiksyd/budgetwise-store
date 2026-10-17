-- BudgetWise Store: structured, customer-provided fulfillment details.
--
-- STATUS: PROPOSED — NOT APPLIED. Depends on product decisions still open
-- (which fields, when collected). Independent of 0021's approval.
--
-- Today the only customer-provided values stored with an order are the
-- buyer name, Roblox username (store_order_snapshots) and the Via Plus
-- details (store_order_via_plus_details). Anything else a product needs —
-- first case: the customer's own gamepass link for Robux (Via Link) — only
-- exists in chat text. This stores such values as data, per order or per
-- order line, so the admin Order Details panel reads them directly.
--
-- Additive; old orders simply have no rows here ("not provided").

begin;

create table if not exists public.store_order_fulfillment_details (
  id uuid primary key default gen_random_uuid(),
  order_number text not null
    references public.store_order_snapshots (order_number) on delete cascade,
  -- null = applies to the whole order; otherwise the line it belongs to.
  line_index integer,
  -- Whitelisted in application config (src/config/fulfillment-fields.ts);
  -- the database enforces the shape, the app enforces the allowed keys and
  -- the per-key validation/normalisation (e.g. canonical roblox.com URL).
  field_key text not null,
  value text not null,
  source text not null,
  provided_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_order_fulfillment_details_key_format
    check (field_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint store_order_fulfillment_details_value_valid
    check (char_length(btrim(value)) between 1 and 500 and value !~ '[[:cntrl:]]'),
  constraint store_order_fulfillment_details_source_valid
    check (source in ('checkout', 'customer', 'admin')),
  constraint store_order_fulfillment_details_line_fk
    foreign key (order_number, line_index)
    references public.store_order_line_snapshots (order_number, line_index)
    on delete cascade
);

-- One current value per (order, line, field).
create unique index if not exists store_order_fulfillment_details_unique_idx
  on public.store_order_fulfillment_details (order_number, coalesce(line_index, -1), field_key);

alter table public.store_order_fulfillment_details enable row level security;
revoke all on public.store_order_fulfillment_details from anon, authenticated;

-- Corrections after checkout are audited.
alter table public.store_chat_audit_log
  drop constraint if exists store_chat_audit_log_action_valid;
alter table public.store_chat_audit_log
  add constraint store_chat_audit_log_action_valid
  check (action in (
    'conversation.assigned',
    'conversation.unassigned',
    'quick_reply.created',
    'quick_reply.updated',
    'payment_method.created',
    'payment_method.updated',
    'fulfillment_detail.updated'
  ));

-- Checkout path: same atomic order creation, plus the details, in one
-- transaction. A NEW function name so the currently deployed code keeps
-- calling create_store_order unchanged (no signature swap while live).
-- On an idempotent replay nothing new is written.
create or replace function public.create_store_order_v2(
  p_idempotency_key text,
  p_request_fingerprint text,
  p_view_token_hash text,
  p_order_number text,
  p_buyer_name text,
  p_buyer_roblox_username text,
  p_total_amount numeric,
  p_lines jsonb,
  p_via_plus jsonb default null,
  p_fulfillment jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  v_result := public.create_store_order(
    p_idempotency_key, p_request_fingerprint, p_view_token_hash,
    p_order_number, p_buyer_name, p_buyer_roblox_username,
    p_total_amount, p_lines, p_via_plus
  );

  if not coalesce((v_result ->> 'replayed')::boolean, false)
     and p_fulfillment is not null
     and jsonb_typeof(p_fulfillment) = 'array'
  then
    insert into public.store_order_fulfillment_details (
      order_number, line_index, field_key, value, source
    )
    select
      v_result ->> 'order_number',
      (f ->> 'line_index')::integer,
      f ->> 'field_key',
      f ->> 'value',
      'checkout'
    from jsonb_array_elements(p_fulfillment) f;
  end if;

  return v_result;
end;
$$;

revoke all on function public.create_store_order_v2(
  text, text, text, text, text, text, numeric, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.create_store_order_v2(
  text, text, text, text, text, text, numeric, jsonb, jsonb, jsonb
) to service_role;

notify pgrst, 'reload schema';

commit;
