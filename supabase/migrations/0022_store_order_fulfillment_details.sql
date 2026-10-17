-- BudgetWise Store: structured, customer-provided fulfillment details.
--
-- STATUS: PROPOSED — NOT APPLIED. Requires 0021.
--
-- What the application collects today (inspected, not assumed):
--   * every order: buyer name + Roblox username  -> store_order_snapshots
--   * Robux Via Plus: display name, age/verified confirmations, Robux amount
--                                                 -> store_order_via_plus_details
--   * Robux (Via Link): the customer's own gamepass link — previously only in
--     chat text. This migration gives it (and any future whitelisted field)
--     a structured home.
-- No other customer-provided fulfillment inputs exist; none are invented.
--
-- Via Link quantity: the cart and order API allow up to 50 units of any
-- product, Via Link included, and nothing in the app defines whether two
-- units mean one gamepass or two. So values are stored PER UNIT
-- (unit_index 0..quantity-1). Whether the UI asks for one link per unit or
-- one per line is a single config switch in the app
-- (src/lib/chat/fulfillment-fields.mjs), not a schema change.
--
-- Values are submitted AFTER checkout from the order page (not required at
-- checkout) by the order's owner, or corrected by an admin. Every change is
-- audited with actor, previous value and new value. Old orders simply have
-- no rows ("waiting for customer" / "not provided").
--
-- Additive and re-runnable.

begin;

create table if not exists public.store_order_fulfillment_details (
  id uuid primary key default gen_random_uuid(),
  order_number text not null
    references public.store_order_snapshots (order_number) on delete cascade,
  -- The order line this value belongs to; null = whole order (no such field
  -- exists today, but the shape allows one later without a redesign).
  line_index integer,
  -- Which unit of that line (0-based). Always 0 for per-line fields.
  unit_index integer not null default 0,
  field_key text not null,
  -- Canonical, display-safe value (e.g. https://www.roblox.com/game-pass/123).
  value text not null,
  -- Machine identifier extracted during validation (e.g. the gamepass id).
  external_id text,
  -- Who supplied the current value.
  source text not null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_order_fulfillment_details_key_format
    check (field_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint store_order_fulfillment_details_value_valid
    check (char_length(btrim(value)) between 1 and 500 and value !~ '[[:cntrl:]]'),
  constraint store_order_fulfillment_details_unit_valid
    check (unit_index between 0 and 999),
  constraint store_order_fulfillment_details_source_valid
    check (source in ('customer', 'admin')),
  -- Defence in depth for the one field that exists today: whatever the app
  -- does, only a canonical gamepass URL that matches its own numeric id can
  -- be stored.
  constraint store_order_fulfillment_details_gamepass_shape
    check (
      field_key <> 'roblox_gamepass_url'
      or (external_id ~ '^[1-9][0-9]{0,19}$'
          and value = 'https://www.roblox.com/game-pass/' || external_id
          and line_index is not null)
    ),
  constraint store_order_fulfillment_details_line_fk
    foreign key (order_number, line_index)
    references public.store_order_line_snapshots (order_number, line_index)
    on delete cascade
);

create unique index if not exists store_order_fulfillment_details_slot_idx
  on public.store_order_fulfillment_details
  (order_number, (coalesce(line_index, -1)), unit_index, field_key);

alter table public.store_order_fulfillment_details enable row level security;
revoke all on public.store_order_fulfillment_details from anon, authenticated;

-- Audit actions for fulfillment changes (customer submissions and admin
-- corrections both keep a history).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'store_chat_audit_log_action_valid'
       and conrelid = 'public.store_chat_audit_log'::regclass
       and pg_get_constraintdef(oid) like '%fulfillment_detail.corrected%'
  ) then
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
        'fulfillment_detail.submitted',
        'fulfillment_detail.corrected'
      ));
  end if;
end $$;

-- The only write path. Server code validates and normalises the value
-- first (src/lib/chat/gamepass-url.mjs); this re-checks WHO may write and
-- WHERE (line/unit must exist on this order), audits, and pings realtime
-- with a compact event (no values).
create or replace function public.store_set_fulfillment_detail(
  p_order_number text,
  p_line_index integer,
  p_unit_index integer,
  p_field_key text,
  p_value text,
  p_external_id text,
  p_actor uuid,
  p_actor_role text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_quantity integer;
  v_before public.store_order_fulfillment_details;
  v_after public.store_order_fulfillment_details;
  v_conversation uuid;
begin
  if p_actor_role = 'admin' then
    if not exists (select 1 from public.admin_users where user_id = p_actor) then
      raise exception 'not an admin' using errcode = '42501';
    end if;
  elsif p_actor_role = 'customer' then
    if not exists (
      select 1 from public.store_order_snapshots
       where order_number = p_order_number and owner_user_id = p_actor
    ) then
      raise exception 'not the order owner' using errcode = '42501';
    end if;
  else
    raise exception 'invalid actor role' using errcode = '22023';
  end if;

  if p_line_index is not null then
    select quantity into v_quantity from public.store_order_line_snapshots
     where order_number = p_order_number and line_index = p_line_index;
    if not found then
      raise exception 'order line not found' using errcode = 'P0002';
    end if;
    if p_unit_index is null or p_unit_index < 0 or p_unit_index >= v_quantity then
      raise exception 'unit out of range' using errcode = '22023';
    end if;
  elsif coalesce(p_unit_index, 0) <> 0 then
    raise exception 'unit out of range' using errcode = '22023';
  end if;

  select * into v_before from public.store_order_fulfillment_details d
   where d.order_number = p_order_number
     and coalesce(d.line_index, -1) = coalesce(p_line_index, -1)
     and d.unit_index = coalesce(p_unit_index, 0)
     and d.field_key = p_field_key
   for update;

  if found and v_before.value = p_value
     and v_before.external_id is not distinct from p_external_id then
    return to_jsonb(v_before);  -- unchanged: no write, no audit, no event
  end if;

  insert into public.store_order_fulfillment_details as d (
    order_number, line_index, unit_index, field_key, value, external_id,
    source, updated_by
  )
  values (
    p_order_number, p_line_index, coalesce(p_unit_index, 0), p_field_key,
    p_value, p_external_id, p_actor_role, p_actor
  )
  on conflict (order_number, (coalesce(line_index, -1)), unit_index, field_key)
  do update set
    value = excluded.value,
    external_id = excluded.external_id,
    source = excluded.source,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_after;

  insert into public.store_chat_audit_log (
    actor_user_id, action, order_number, subject_id, details
  )
  values (
    p_actor,
    case when p_actor_role = 'admin'
      then 'fulfillment_detail.corrected' else 'fulfillment_detail.submitted' end,
    p_order_number,
    v_after.id,
    jsonb_build_object(
      'field_key', p_field_key,
      'line_index', p_line_index,
      'unit_index', coalesce(p_unit_index, 0),
      'before', case when v_before.id is null then null else v_before.value end,
      'after', v_after.value,
      'actor_role', p_actor_role
    )
  );

  select c.id into v_conversation from public.store_order_conversations c
   where c.order_number = p_order_number;

  if v_conversation is not null then
    perform public.store_chat_send(
      'admin:inbox', 'fulfillment',
      jsonb_build_object(
        'conversation_id', v_conversation,
        'order_number', p_order_number,
        'field_key', p_field_key
      )
    );
    perform public.store_chat_send(
      'chat:' || v_conversation::text, 'fulfillment',
      jsonb_build_object('field_key', p_field_key)
    );
  end if;

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.store_set_fulfillment_detail(
  text, integer, integer, text, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.store_set_fulfillment_detail(
  text, integer, integer, text, text, text, uuid, text
) to service_role;

notify pgrst, 'reload schema';

commit;
