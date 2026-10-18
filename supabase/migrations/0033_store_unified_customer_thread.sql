-- 0033: one ongoing conversation per customer + in-chat product cards.
--
-- NOT APPLIED. Review, then apply by hand. Do not run 0023 as part of this.
-- Production sequence: 0021, 0022, 0024 ... 0032, then this.
-- Tested on a throwaway local PostgreSQL 17 (scripts/test-db.mjs).
--
-- Until now every order opened its own chat, so a customer who started in
-- General Inquiry and then ordered had two inbox rows. From this migration
-- on, a signed-in customer's General Inquiry thread (0026) is THE customer
-- conversation: every new order's slip is posted there, and order-level
-- payment cards for that order are posted there too, each TAGGED with the
-- order it is for. Orders stay separate, real orders: snapshot, number,
-- lines, fulfillment details and XOB rows are untouched; only where their
-- chat messages live changes.
--
-- 1. store_chat_threads.home_key: an order thread that joined its owner's
--    conversation points at it. Order chats created before this migration
--    keep their own messages and stay exactly as they are (no data moves).
--    A guard trigger refuses any message INTO a linked order thread, so a
--    linked order can never grow a second inbox row.
-- 2. store_order_messages.order_ref: the order a slip / payment card is
--    about (null = general conversation, e.g. a General Inquiry quote). The
--    guard requires order_ref to be an order linked to THIS conversation,
--    so a message can never point at another customer's order.
--    New kind 'product': a catalog card an admin sends (game pricelist or
--    one product). Ids + a display snapshot only, never a URL.
-- 3. store_attach_order_to_customer(): the one write path for a new order.
--    Sets the owner (only while empty), links the order to the customer's
--    conversation (created if missing), posts the slip there once, and
--    links the product card the order came from — only when that card is
--    in this customer's conversation AND the order really contains the
--    recommended product (or a product of the recommended game).
-- 4. store_send_recommendation(): admins only, shape-checked, idempotent.
-- 5. Payments stay per order / per quote:
--      store_send_payment_details  posts into the conversation of the
--        order with order_ref = the order (amount = that order's total);
--        a reused client id for another order is refused (BW010).
--      store_confirm_payment       "latest card only" (BW020) is scoped to
--        the card's own order (or to the quotes), so confirming order A's
--        card is never blocked by, or mixed up with, order B's or a quote.
--        Confirmations record order_ref. The conversation's payment
--        columns now name the newest card still awaiting confirmation, so
--        the inbox never shows "Paid" while another order is unpaid.
-- 6. store_set_fulfillment_detail: realtime goes to the conversation the
--    order lives in (0022 otherwise verbatim).
-- 7. store_customer_orders: a linked order reads its conversation's state;
--    unread is shown once, on the conversation itself.
-- 8. store_admin_inbox / _outside_count: a customer conversation carries
--    its linked orders' games, numbers (search), pending status (Under
--    review), latest order total/username, + order_count and
--    latest_order_number columns.
-- 9. store_chat_preview: product card previews.
-- 10. store_chat_settings.unified_order_chat: the recovery switch. Set it
--     to false and new orders go back to their own per-order chats (the
--     pre-0033 behaviour) at once, with no deploy and no data change;
--     orders already in a conversation keep working there. Default true.
--
-- XOB orders.status is never written. Realtime public access is untouched.
-- Deploy order: apply BEFORE deploying the app.
-- Rollback: supabase/rollback/0033_down.sql (refused once unified data exists).

begin;

-- ===========================================================================
-- 1. Order threads can join their customer's conversation
-- ===========================================================================
alter table public.store_chat_threads
  add column if not exists home_key text
    references public.store_chat_threads (key) on delete restrict;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'store_chat_threads_home_shape'
       and conrelid = 'public.store_chat_threads'::regclass
  ) then
    alter table public.store_chat_threads
      add constraint store_chat_threads_home_shape
      check (home_key is null or (kind = 'order' and home_key <> key));
  end if;
end $$;

create index if not exists store_chat_threads_home_key_idx
  on public.store_chat_threads (home_key)
  where home_key is not null;

-- ===========================================================================
-- 2. Messages: which order they are about, and product cards
-- ===========================================================================
alter table public.store_order_messages
  add column if not exists order_ref text
    references public.store_order_snapshots (order_number) on delete cascade;

do $$
begin
  -- + 'product'
  if exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_kind_valid'
       and conrelid = 'public.store_order_messages'::regclass
       and pg_get_constraintdef(oid) not like '%product%'
  ) then
    alter table public.store_order_messages drop constraint store_order_messages_kind_valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_kind_valid'
       and conrelid = 'public.store_order_messages'::regclass
  ) then
    alter table public.store_order_messages
      add constraint store_order_messages_kind_valid
      check (kind in ('slip', 'text', 'image', 'payment', 'album', 'product')) not valid;
  end if;

  if exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_payload_only_payment'
       and conrelid = 'public.store_order_messages'::regclass
       and pg_get_constraintdef(oid) not like '%product%'
  ) then
    alter table public.store_order_messages drop constraint store_order_messages_payload_only_payment;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_payload_only_payment'
       and conrelid = 'public.store_order_messages'::regclass
  ) then
    alter table public.store_order_messages
      add constraint store_order_messages_payload_only_payment
      check (payload is null or kind in ('payment', 'album', 'product')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_product_shape'
       and conrelid = 'public.store_order_messages'::regclass
  ) then
    alter table public.store_order_messages
      add constraint store_order_messages_product_shape
      check (
        kind <> 'product'
        or (sender_role = 'admin'
            and jsonb_typeof(payload) = 'object'
            and payload ->> 'type' in ('game', 'product'))
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_order_ref_kind'
       and conrelid = 'public.store_order_messages'::regclass
  ) then
    alter table public.store_order_messages
      add constraint store_order_messages_order_ref_kind
      check (order_ref is null or kind in ('slip', 'payment')) not valid;
  end if;

  if exists (
    select 1 from pg_constraint
     where conname = 'store_order_conversations_last_kind_valid'
       and conrelid = 'public.store_order_conversations'::regclass
       and pg_get_constraintdef(oid) not like '%product%'
  ) then
    alter table public.store_order_conversations drop constraint store_order_conversations_last_kind_valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_conversations_last_kind_valid'
       and conrelid = 'public.store_order_conversations'::regclass
  ) then
    alter table public.store_order_conversations
      add constraint store_order_conversations_last_kind_valid
      check (last_message_kind in ('slip', 'text', 'image', 'payment', 'album', 'product')) not valid;
  end if;
end $$;

alter table public.store_order_messages validate constraint store_order_messages_kind_valid;
alter table public.store_order_messages validate constraint store_order_messages_payload_only_payment;
alter table public.store_order_messages validate constraint store_order_messages_product_shape;
alter table public.store_order_messages validate constraint store_order_messages_order_ref_kind;
alter table public.store_order_conversations validate constraint store_order_conversations_last_kind_valid;

-- One slip per order: in its own chat (legacy, order_ref null) or, once,
-- in the customer's conversation (order_ref = the order).
drop index if exists public.store_order_messages_one_slip_idx;
create unique index if not exists store_order_messages_one_slip_idx
  on public.store_order_messages (order_number)
  where kind = 'slip' and order_ref is null;
create unique index if not exists store_order_messages_one_slip_per_order_idx
  on public.store_order_messages (order_ref)
  where kind = 'slip' and order_ref is not null;
-- Per-order payment cards in a conversation ("latest card of this order").
create index if not exists store_order_messages_order_ref_idx
  on public.store_order_messages (order_number, order_ref, created_at desc)
  where order_ref is not null;

-- Guard: nothing is ever written INTO a linked order thread (its chat is
-- the customer's conversation), and order_ref must be an order linked to
-- the conversation the message is in.
create or replace function public.store_order_messages_thread_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.store_chat_threads t
     where t.key = new.order_number and t.home_key is not null
  ) then
    raise exception 'CHAT_MOVED' using errcode = 'BW030';
  end if;
  if new.order_ref is not null and not exists (
    select 1 from public.store_chat_threads t
     where t.key = new.order_ref and t.home_key = new.order_number
  ) then
    raise exception 'order is not part of this conversation' using errcode = 'BW031';
  end if;
  return new;
end;
$$;

drop trigger if exists store_order_messages_thread_guard on public.store_order_messages;
create trigger store_order_messages_thread_guard
  before insert or update of order_number, order_ref on public.store_order_messages
  for each row execute function public.store_order_messages_thread_guard();

-- Which product card an order came from (set only by the attach function).
create table if not exists public.store_order_recommendations (
  order_number text primary key
    references public.store_order_snapshots (order_number) on delete cascade,
  message_id uuid not null
    references public.store_order_messages (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists store_order_recommendations_message_idx
  on public.store_order_recommendations (message_id);
alter table public.store_order_recommendations enable row level security;
revoke all on public.store_order_recommendations from public, anon, authenticated;

-- Confirmations remember which order they were for (null = a quote).
alter table public.store_payment_confirmations
  add column if not exists order_ref text
    references public.store_order_snapshots (order_number) on delete cascade;

-- ===========================================================================
-- 3a. Recovery switch (one row; service role only)
-- ===========================================================================
create table if not exists public.store_chat_settings (
  id boolean primary key default true,
  unified_order_chat boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint store_chat_settings_singleton check (id)
);
insert into public.store_chat_settings (id) values (true) on conflict (id) do nothing;
alter table public.store_chat_settings enable row level security;
revoke all on public.store_chat_settings from public, anon, authenticated;

-- ===========================================================================
-- 3. A new order joins its customer's conversation
-- ===========================================================================
create or replace function public.store_attach_order_to_customer(
  p_order_number text,
  p_user uuid,
  p_slip_text text,
  p_customer_name text default null,
  p_recommendation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid;
  v_thread public.store_chat_threads;
  v_home text;
  v_rec public.store_order_messages;
begin
  if p_user is null then
    raise exception 'unknown customer' using errcode = '42501';
  end if;

  -- The owner is only ever set while empty (a replay keeps the first one).
  update public.store_order_snapshots
     set owner_user_id = p_user
   where order_number = p_order_number
     and owner_user_id is null;
  select s.owner_user_id into v_owner
    from public.store_order_snapshots s
   where s.order_number = p_order_number;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_owner is distinct from p_user then
    return jsonb_build_object('attached', false);
  end if;

  -- Serializes replays of the same checkout.
  insert into public.store_chat_threads (key, kind, order_number)
  values (p_order_number, 'order', p_order_number)
  on conflict (key) do nothing;
  select * into v_thread from public.store_chat_threads
   where key = p_order_number
   for update;

  if v_thread.home_key is not null then
    v_home := v_thread.home_key;
  elsif exists (select 1 from public.store_order_messages m where m.order_number = p_order_number) then
    -- Placed before 0033 (or while the switch was off): its chat stays where it is.
    return jsonb_build_object('attached', true, 'chat_key', p_order_number, 'unified', false);
  elsif not coalesce((select s.unified_order_chat from public.store_chat_settings s where s.id), true) then
    -- Recovery switch off: the pre-0033 per-order chat, exactly as before.
    insert into public.store_order_messages (order_number, sender_role, sender_user_id, kind, body)
    values (p_order_number, 'customer', p_user, 'slip', coalesce(p_slip_text, ''))
    on conflict (order_number) where kind = 'slip' and order_ref is null do nothing;
    return jsonb_build_object('attached', true, 'chat_key', p_order_number, 'unified', false);
  else
    v_home := public.store_open_inquiry(p_user, p_customer_name);
    update public.store_chat_threads set home_key = v_home where key = p_order_number;
  end if;

  if p_recommendation_id is not null then
    select * into v_rec from public.store_order_messages m
     where m.id = p_recommendation_id
       and m.order_number = v_home
       and m.kind = 'product'
       and m.sender_role = 'admin';
    if found and (
      (v_rec.payload ->> 'type' = 'product' and exists (
         select 1 from public.store_order_line_snapshots l
          where l.order_number = p_order_number
            and l.gamepass_id::text = v_rec.payload ->> 'gamepass_id'))
      or (v_rec.payload ->> 'type' = 'game' and exists (
         select 1 from public.store_order_line_snapshots l
          where l.order_number = p_order_number
            and l.game_id::text = v_rec.payload ->> 'game_id'))
    ) then
      insert into public.store_order_recommendations (order_number, message_id)
      values (p_order_number, v_rec.id)
      on conflict (order_number) do nothing;
    end if;
  end if;

  insert into public.store_order_messages (
    order_number, sender_role, sender_user_id, kind, body, order_ref
  )
  values (v_home, 'customer', p_user, 'slip', coalesce(p_slip_text, ''), p_order_number)
  on conflict (order_ref) where kind = 'slip' and order_ref is not null do nothing;

  return jsonb_build_object(
    'attached', true,
    'chat_key', v_home,
    'unified', true,
    'recommendation_id', (select r.message_id from public.store_order_recommendations r
                           where r.order_number = p_order_number)
  );
end;
$$;

-- ===========================================================================
-- 4. Product cards (admins only)
-- ===========================================================================
create or replace function public.store_send_recommendation(
  p_key text,
  p_actor uuid,
  p_payload jsonb,
  p_client_message_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_type text := p_payload ->> 'type';
  v_id uuid;
  v_existing public.store_order_messages;
  v_body text;
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if p_actor is null or not exists (select 1 from public.admin_users where user_id = p_actor) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.store_chat_threads t where t.key = p_key) then
    raise exception 'chat not found' using errcode = 'P0002';
  end if;
  if p_client_message_id is null then
    raise exception 'client message id required' using errcode = '22023';
  end if;

  -- Ids and display text only: no URL is ever stored or accepted.
  if jsonb_typeof(p_payload) is distinct from 'object'
     or v_type not in ('game', 'product')
     or exists (
       select 1 from jsonb_object_keys(p_payload) k
        where k not in ('type', 'game_id', 'game_slug', 'game_name', 'gamepass_id',
                        'product_name', 'price', 'robux_amount')
     )
     or coalesce(p_payload ->> 'game_id', '') !~ v_uuid
     or coalesce(p_payload ->> 'game_slug', '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or char_length(coalesce(p_payload ->> 'game_slug', '')) > 120
     or length(btrim(coalesce(p_payload ->> 'game_name', ''))) = 0
     or char_length(p_payload ->> 'game_name') > 200
     or (v_type = 'game' and (p_payload ? 'gamepass_id' or p_payload ? 'product_name' or p_payload ? 'price'))
     or (v_type = 'product' and (
           coalesce(p_payload ->> 'gamepass_id', '') !~ v_uuid
           or length(btrim(coalesce(p_payload ->> 'product_name', ''))) = 0
           or char_length(p_payload ->> 'product_name') > 200
           or jsonb_typeof(p_payload -> 'price') is distinct from 'number'
           or (p_payload ->> 'price')::numeric < 0
           or (p_payload ? 'robux_amount' and jsonb_typeof(p_payload -> 'robux_amount') is distinct from 'number')))
  then
    raise exception 'invalid product card' using errcode = '22023';
  end if;

  v_body := case v_type
    when 'game' then format('Pricelist: %s', p_payload ->> 'game_name')
    else format('Recommended: %s (%s) - PHP %s', p_payload ->> 'product_name', p_payload ->> 'game_name',
                to_char((p_payload ->> 'price')::numeric, 'FM999,999,990.00'))
  end;

  insert into public.store_order_messages (
    order_number, sender_role, sender_user_id, kind, body, payload, client_message_id
  )
  values (p_key, 'admin', p_actor, 'product', left(v_body, 4000), p_payload, p_client_message_id)
  on conflict (order_number, sender_user_id, client_message_id)
    where client_message_id is not null
    do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_existing from public.store_order_messages m
     where m.order_number = p_key
       and m.sender_user_id = p_actor
       and m.client_message_id = p_client_message_id;
    if v_existing.kind is distinct from 'product'
       or v_existing.payload ->> 'type' is distinct from v_type
       or v_existing.payload ->> 'game_id' is distinct from p_payload ->> 'game_id'
       or v_existing.payload ->> 'gamepass_id' is distinct from p_payload ->> 'gamepass_id' then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'BW010';
    end if;
    return v_existing.id;
  end if;
  return v_id;
end;
$$;

-- ===========================================================================
-- 5. Payments stay per order (0029 / 0031 otherwise)
-- ===========================================================================
create or replace function public.store_send_payment_details(
  p_order_number text,
  p_actor uuid,
  p_method_id uuid,
  p_client_message_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_method public.store_payment_methods;
  v_total numeric;
  v_id uuid;
  v_created boolean := false;
  v_conv uuid;
  v_key text;
  v_ref text;
  v_existing public.store_order_messages;
begin
  if not exists (select 1 from public.admin_users where user_id = p_actor) then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  select * into v_method from public.store_payment_methods
   where id = p_method_id and is_active;
  if not found then
    raise exception 'payment method not available' using errcode = 'P0002';
  end if;

  select s.total_amount into v_total from public.store_order_snapshots s
   where s.order_number = p_order_number;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  -- 0033: an order in its customer's conversation gets its card there,
  -- tagged with the order. Older orders keep using their own chat.
  select t.home_key into v_key from public.store_chat_threads t where t.key = p_order_number;
  if v_key is null then
    v_key := p_order_number;
  else
    v_ref := p_order_number;
  end if;

  insert into public.store_order_messages (
    order_number, sender_role, sender_user_id, kind, body, payload, client_message_id, order_ref
  )
  values (
    v_key, 'admin', p_actor, 'payment',
    case when v_ref is null then
      format('%s payment details. Amount: PHP %s. Account: %s (%s).',
             v_method.label, to_char(v_total, 'FM999,999,990.00'),
             v_method.account_name, v_method.account_number)
    else
      format('%s payment details for order %s. Amount: PHP %s. Account: %s (%s).',
             v_method.label, v_ref, to_char(v_total, 'FM999,999,990.00'),
             v_method.account_name, v_method.account_number)
    end,
    jsonb_build_object(
      'method_id', v_method.id,
      'provider', v_method.provider,
      'label', v_method.label,
      'account_name', v_method.account_name,
      'account_number', v_method.account_number,
      'amount', v_total,
      'currency', 'PHP',
      'has_qr', v_method.qr_storage_path is not null,
      'qr_path', v_method.qr_storage_path
    ) || case when v_ref is null then '{}'::jsonb else jsonb_build_object('order_number', v_ref) end,
    p_client_message_id,
    v_ref
  )
  on conflict (order_number, sender_user_id, client_message_id)
    where client_message_id is not null
    do nothing
  returning id into v_id;

  v_created := v_id is not null;
  if v_id is null then
    select * into v_existing from public.store_order_messages m
     where m.order_number = v_key
       and m.sender_user_id = p_actor
       and m.client_message_id = p_client_message_id;
    -- 0033: the same client id for a different order (or a non-card) is refused.
    if v_existing.kind is distinct from 'payment'
       or (v_ref is not null and v_existing.order_ref is distinct from v_ref)
       or (v_ref is null and v_existing.order_ref is not null) then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'BW010';
    end if;
    v_id := v_existing.id;
  end if;

  -- 0029: an Unassigned chat becomes the sender's (newly sent card only).
  if v_created then
    update public.store_order_conversations c
       set assigned_admin_id = p_actor,
           assigned_by = p_actor,
           assigned_at = now(),
           updated_at = now()
     where c.order_number = v_key
       and c.assigned_admin_id is null
    returning c.id into v_conv;
    if v_conv is not null then
      insert into public.store_chat_audit_log (actor_user_id, action, order_number, subject_id, details)
      values (
        p_actor, 'conversation.assigned', v_key, v_conv,
        jsonb_build_object('from', null, 'to', p_actor, 'cause', 'payment_details', 'message_id', v_id,
                           'order_ref', v_ref)
      );
    end if;
  end if;

  return v_id;
end;
$$;

-- p_order_number: the chat the card is in (an order chat or a customer
-- conversation). A linked order's number is accepted and resolved to its
-- conversation.
create or replace function public.store_confirm_payment(
  p_order_number text,
  p_message_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key text;
  v_conv public.store_order_conversations;
  v_msg public.store_order_messages;
  v_latest uuid;
  v_outstanding uuid;
  v_row public.store_payment_confirmations;
  v_amount numeric;
begin
  if p_actor is null or not exists (select 1 from public.admin_users where user_id = p_actor) then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  select coalesce(t.home_key, t.key) into v_key
    from public.store_chat_threads t where t.key = p_order_number;
  if v_key is null then
    raise exception 'chat not found' using errcode = 'P0002';
  end if;

  -- Serializes concurrent confirmations in this conversation.
  select * into v_conv from public.store_order_conversations
   where order_number = v_key
   for update;
  if not found then
    raise exception 'payment details not sent' using errcode = 'P0002';
  end if;

  select * into v_msg from public.store_order_messages m
   where m.id = p_message_id
     and m.order_number = v_key
     and m.kind = 'payment'
     and m.sender_role = 'admin';
  if not found then
    raise exception 'payment details not found' using errcode = 'P0002';
  end if;

  select * into v_row from public.store_payment_confirmations where message_id = p_message_id;
  if found then
    return jsonb_build_object('created', false, 'confirmation', to_jsonb(v_row));
  end if;

  -- 0033: the latest card FOR THE SAME ORDER (or among the quotes).
  select m.id into v_latest from public.store_order_messages m
   where m.order_number = v_key
     and m.kind = 'payment'
     and m.order_ref is not distinct from v_msg.order_ref
   order by m.created_at desc, m.id desc
   limit 1;
  if v_latest is distinct from p_message_id then
    raise exception 'PAYMENT_SUPERSEDED' using errcode = 'BW020';
  end if;

  v_amount := (v_msg.payload ->> 'amount')::numeric;
  if v_amount is null then
    raise exception 'payment card has no amount' using errcode = '22023';
  end if;

  insert into public.store_payment_confirmations (
    message_id, order_number, confirmed_by, amount, currency, provider, account_number, order_ref
  )
  values (
    p_message_id, v_key, p_actor, v_amount, 'PHP',
    coalesce(v_msg.payload ->> 'provider', ''), coalesce(v_msg.payload ->> 'account_number', ''),
    v_msg.order_ref
  )
  on conflict (message_id) do nothing
  returning * into v_row;

  if not found then
    select * into v_row from public.store_payment_confirmations where message_id = p_message_id;
    return jsonb_build_object('created', false, 'confirmation', to_jsonb(v_row));
  end if;

  -- The newest card (one per order / quotes) still awaiting confirmation;
  -- none -> the card just confirmed, so the inbox reads "Paid".
  select x.id into v_outstanding
    from (
      select distinct on (coalesce(m.order_ref, '')) m.id, m.created_at
        from public.store_order_messages m
       where m.order_number = v_key and m.kind = 'payment'
       order by coalesce(m.order_ref, ''), m.created_at desc, m.id desc
    ) x
   where not exists (select 1 from public.store_payment_confirmations pc where pc.message_id = x.id)
   order by x.created_at desc, x.id desc
   limit 1;

  update public.store_order_conversations c
     set payment_received_message_id = v_row.message_id,
         payment_received_at = v_row.confirmed_at,
         payment_received_by = p_actor,
         payment_request_message_id = coalesce(v_outstanding, v_row.message_id),
         updated_at = now()
   where c.id = v_conv.id;

  insert into public.store_chat_audit_log (actor_user_id, action, order_number, subject_id, details)
  values (
    p_actor, 'payment.confirmed', v_key, p_message_id,
    jsonb_build_object(
      'amount', v_row.amount,
      'currency', v_row.currency,
      'provider', v_row.provider,
      'account_number', v_row.account_number,
      'method_id', v_msg.payload ->> 'method_id',
      'payment_sent_at', v_msg.created_at,
      'order_ref', v_msg.order_ref
    )
  );

  return jsonb_build_object('created', true, 'confirmation', to_jsonb(v_row));
end;
$$;

-- ===========================================================================
-- 6. Fulfillment realtime: the conversation the order lives in (0022 else)
-- ===========================================================================
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
  v_chat text;
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

  -- 0033: the conversation the order's chat lives in.
  select coalesce(t.home_key, p_order_number) into v_chat
    from public.store_chat_threads t where t.key = p_order_number;
  v_chat := coalesce(v_chat, p_order_number);
  select c.id into v_conversation from public.store_order_conversations c
   where c.order_number = v_chat;

  if v_conversation is not null then
    perform public.store_chat_send(
      'admin:inbox', 'fulfillment',
      jsonb_build_object(
        'conversation_id', v_conversation,
        'order_number', v_chat,
        'field_key', p_field_key
      ) || case when v_chat = p_order_number then '{}'::jsonb
                else jsonb_build_object('order_ref', p_order_number) end
    );
    perform public.store_chat_send(
      'chat:' || v_conversation::text, 'fulfillment',
      jsonb_build_object('field_key', p_field_key)
    );
  end if;

  return to_jsonb(v_after);
end;
$$;

-- ===========================================================================
-- 7. My Orders: linked orders read their conversation (0024 otherwise;
--    same columns, so the app finds the chat via store_chat_threads)
-- ===========================================================================
create or replace function public.store_customer_orders(
  p_user uuid,
  p_section text,
  p_before_at timestamptz default null,
  p_before_order text default null,
  p_limit integer default 20
)
returns table (
  order_number text,
  total_amount numeric,
  created_at timestamptz,
  buyer_roblox_username text,
  conversation_id uuid,
  state text,
  done_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_role text,
  payment_details_sent_at timestamptz,
  unread_count integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    s.order_number, s.total_amount, s.created_at, s.buyer_roblox_username,
    c.id, coalesce(c.state, 'active'), c.done_at,
    c.last_message_at, c.last_message_preview, c.last_sender_role,
    -- A linked order: when ITS payment card was first sent.
    case when t.home_key is null then c.payment_details_sent_at
         else (select min(pm.created_at) from public.store_order_messages pm
                where pm.order_number = t.home_key and pm.order_ref = s.order_number and pm.kind = 'payment')
    end,
    -- Unread belongs to the conversation (shown once, on its own card).
    case when t.home_key is null then coalesce(u.n, 0) else 0 end
  from public.store_order_snapshots s
  left join public.store_chat_threads t on t.key = s.order_number
  left join public.store_order_conversations c on c.order_number = coalesce(t.home_key, s.order_number)
  left join lateral (
    select count(*)::integer as n
      from public.store_order_messages m
     where c.order_number is not null
       and t.home_key is null
       and m.order_number = c.order_number
       and m.sender_role = 'admin'
       and (c.customer_read_at is null
            or (m.created_at, m.id) > (c.customer_read_at, c.customer_read_message_id))
  ) u on true
  where s.owner_user_id = p_user
    and (
      (p_section = 'open' and coalesce(c.state, 'active') = 'active')
      or (p_section = 'completed' and c.state = 'done'
          and (p_before_at is null or (c.done_at, s.order_number) < (p_before_at, p_before_order)))
    )
  order by
    case when p_section = 'open' then
      case when t.home_key is null then coalesce(c.last_message_at, s.created_at) else s.created_at end
    end desc,
    case when p_section = 'completed' then c.done_at end desc,
    s.order_number desc
  limit case when p_section = 'open' then 100
             else least(greatest(coalesce(p_limit, 20), 1), 50) end;
$$;

-- ===========================================================================
-- 8. Admin inbox: a customer conversation carries its linked orders
--    (0030's body otherwise; return type gains two columns)
-- ===========================================================================
drop function if exists public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text, uuid[], boolean);
create function public.store_admin_inbox(
  p_admin uuid,
  p_filter text default 'all',
  p_search text default null,
  p_before_at timestamptz default null,
  p_before_order text default null,
  p_limit integer default 30,
  p_order_number text default null,
  p_games uuid[] default null,
  p_include_inquiries boolean default true
)
returns table (
  conversation_id uuid,
  order_number text,
  buyer_name text,
  buyer_roblox_username text,
  total_amount numeric,
  order_created_at timestamptz,
  order_status text,
  assigned_admin_id uuid,
  assigned_at timestamptz,
  last_message_id uuid,
  last_message_at timestamptz,
  last_message_kind text,
  last_message_preview text,
  last_sender_role text,
  customer_read_at timestamptz,
  customer_read_message_id uuid,
  payment_details_sent_at timestamptz,
  my_read_at timestamptz,
  my_read_message_id uuid,
  unread_count integer,
  state text,
  done_at timestamptz,
  done_by uuid,
  payment_request_message_id uuid,
  payment_received_message_id uuid,
  payment_received_at timestamptz,
  payment_received_by uuid,
  last_customer_message_at timestamptz,
  last_customer_message_id uuid,
  last_admin_reply_at timestamptz,
  last_admin_reply_id uuid,
  last_admin_reply_by uuid,
  viewed_by uuid[],
  customer_user_id uuid,
  order_count integer,
  latest_order_number text,
  customer_photo_url text,
  game_ids uuid[],
  game_names text[]
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_filter text := case when p_order_number is not null then 'all' else coalesce(p_filter, 'all') end;
  v_where text;
begin
  v_where := case v_filter
    when 'all' then 'true'
    when 'active' then $w$c.state = 'active'$w$
    when 'done' then $w$c.state = 'done'$w$
    when 'unread' then $w$c.state = 'active' and coalesce(u.n, 0) > 0$w$
    when 'unassigned' then $w$c.state = 'active' and c.assigned_admin_id is null$w$
    when 'mine' then $w$c.state = 'active' and c.assigned_admin_id = $1$w$
    -- 0033: the chat's own order or any order linked to the conversation.
    when 'under_review' then $w$(st.status = 'pending'
      or (t.key is not null and exists (
            select 1 from public.store_chat_threads lt
              join public.orders o on o.order_number = lt.key
             where lt.home_key = c.order_number and o.status = 'pending')))$w$
    when 'needs_reply' then $w$c.state = 'active'
      and c.last_customer_message_id is not null
      and (c.last_admin_reply_id is null
           or (c.last_admin_reply_at, c.last_admin_reply_id)
              < (c.last_customer_message_at, c.last_customer_message_id))$w$
    when 'unopened' then $w$c.state = 'active'
      and c.last_customer_message_id is not null
      and (c.last_admin_reply_id is null
           or (c.last_admin_reply_at, c.last_admin_reply_id)
              < (c.last_customer_message_at, c.last_customer_message_id))
      and not exists (
        select 1 from public.store_conversation_reads sv
         where sv.order_number = c.order_number
           and (sv.last_read_at, sv.last_read_message_id)
               >= (c.last_customer_message_at, c.last_customer_message_id))$w$
    when 'seen_no_reply' then $w$c.state = 'active'
      and c.last_customer_message_id is not null
      and (c.last_admin_reply_id is null
           or (c.last_admin_reply_at, c.last_admin_reply_id)
              < (c.last_customer_message_at, c.last_customer_message_id))
      and exists (
        select 1 from public.store_conversation_reads sv
         where sv.order_number = c.order_number
           and (sv.last_read_at, sv.last_read_message_id)
               >= (c.last_customer_message_at, c.last_customer_message_id))$w$
    else 'false'
  end;

  return query execute format($q$
    select x.*,
      nullif(coalesce(au.raw_user_meta_data ->> 'avatar_url', au.raw_user_meta_data ->> 'picture'), ''),
      coalesce(g.ids, '{}'::uuid[]),
      coalesce(g.names, '{}'::text[])
    from (
    select
      c.id, c.order_number, coalesce(s.buyer_name, t.customer_name, ls.buyer_name),
      coalesce(s.buyer_roblox_username, ls.buyer_roblox_username),
      coalesce(s.total_amount, ls.total_amount), coalesce(s.created_at, t.created_at), st.status,
      c.assigned_admin_id, c.assigned_at,
      c.last_message_id, c.last_message_at, c.last_message_kind,
      c.last_message_preview, c.last_sender_role,
      c.customer_read_at, c.customer_read_message_id,
      c.payment_details_sent_at,
      r.last_read_at, r.last_read_message_id,
      coalesce(u.n, 0),
      c.state, c.done_at, c.done_by,
      c.payment_request_message_id, c.payment_received_message_id,
      c.payment_received_at, c.payment_received_by,
      c.last_customer_message_at, c.last_customer_message_id,
      c.last_admin_reply_at, c.last_admin_reply_id, c.last_admin_reply_by,
      coalesce(v.ids, '{}'::uuid[]),
      coalesce(s.owner_user_id, t.owner_user_id) as customer_user_id,
      case when s.order_number is not null then 1 else coalesce(lo.n, 0) end,
      coalesce(s.order_number, lo.latest)
    from public.admin_users me
    join public.store_order_conversations c on true
    left join public.store_order_snapshots s on s.order_number = c.order_number
    left join public.store_chat_threads t on t.key = c.order_number and t.kind = 'inquiry'
    -- 0033: orders that joined this customer conversation (indexed).
    left join lateral (
      select count(*)::integer as n,
             (array_agg(ls0.order_number order by ls0.created_at desc, ls0.order_number desc))[1] as latest
        from public.store_chat_threads lt
        join public.store_order_snapshots ls0 on ls0.order_number = lt.key
       where t.key is not null and lt.home_key = c.order_number
    ) lo on true
    left join public.store_order_snapshots ls on ls.order_number = lo.latest
    left join public.store_conversation_reads r
      on r.order_number = c.order_number and r.admin_user_id = me.user_id
    left join lateral (
      select o.status from public.orders o
       where o.order_number = coalesce(s.order_number, lo.latest) limit 1
    ) st on true
    left join lateral (
      select count(*)::integer as n
        from public.store_order_messages m
       where m.order_number = c.order_number
         and m.sender_role = 'customer'
         and (m.created_at, m.id) > (
           coalesce(r.last_read_at, me.unread_since),
           coalesce(r.last_read_message_id, '00000000-0000-0000-0000-000000000000'::uuid)
         )
    ) u on true
    left join lateral (
      select array_agg(rv.admin_user_id order by rv.last_read_at, rv.admin_user_id) as ids
        from public.store_conversation_reads rv
       where rv.order_number = c.order_number
         and c.last_customer_message_id is not null
         and (rv.last_read_at, rv.last_read_message_id)
             >= (c.last_customer_message_at, c.last_customer_message_id)
    ) v on true
    where me.user_id = $1
      and ($7::text is null or c.order_number = $7)
      and (
        $3::text is null
        or c.order_number ilike '%%' || $3 || '%%'
        or s.buyer_name ilike '%%' || $3 || '%%'
        or t.customer_name ilike '%%' || $3 || '%%'
        or s.buyer_roblox_username ilike '%%' || $3 || '%%'
        or (t.key is not null and exists (
              select 1 from public.store_chat_threads lt
                join public.store_order_snapshots ss on ss.order_number = lt.key
               where lt.home_key = c.order_number
                 and (lt.key ilike '%%' || $3 || '%%'
                      or ss.buyer_name ilike '%%' || $3 || '%%'
                      or ss.buyer_roblox_username ilike '%%' || $3 || '%%')))
      )
      and (
        $7::text is not null
        or $8::uuid[] is null
        or (t.key is not null and coalesce($9::boolean, true))
        or exists (
              select 1 from public.store_order_line_snapshots gl
               where gl.game_id = any($8::uuid[])
                 and (gl.order_number = c.order_number
                      or gl.order_number in (select lt.key from public.store_chat_threads lt
                                              where lt.home_key = c.order_number)))
      )
      and (%s)
      and ($4::timestamptz is null or (c.last_message_at, c.order_number) < ($4, $5::text))
    order by c.last_message_at desc, c.order_number desc
    limit least(greatest(coalesce($6::integer, 30), 1), 100)
    ) x
    left join auth.users au on au.id = x.customer_user_id
    left join lateral (
      select array_agg(distinct l.game_id) filter (where l.game_id is not null) as ids,
             array_agg(distinct l.game_name) as names
        from public.store_order_line_snapshots l
       where l.order_number = x.order_number
          or l.order_number in (select lt.key from public.store_chat_threads lt
                                 where lt.home_key = x.order_number)
    ) g on true
    order by x.last_message_at desc, x.order_number desc
  $q$, v_where)
  using p_admin, v_filter, p_search, p_before_at, p_before_order, p_limit, p_order_number,
        p_games, p_include_inquiries;
end;
$fn$;

create or replace function public.store_admin_inbox_outside_count(
  p_admin uuid,
  p_games uuid[],
  p_include_inquiries boolean default true
)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case when p_games is null
              or not exists (select 1 from public.admin_users where user_id = p_admin) then 0
         else (
    select count(*)::integer
      from public.store_order_conversations c
      left join public.store_chat_threads t on t.key = c.order_number and t.kind = 'inquiry'
     where c.state = 'active'
       and c.last_customer_message_id is not null
       and (c.last_admin_reply_id is null
            or (c.last_admin_reply_at, c.last_admin_reply_id)
               < (c.last_customer_message_at, c.last_customer_message_id))
       and not (
         (t.key is not null and coalesce(p_include_inquiries, true))
         or exists (
               select 1 from public.store_order_line_snapshots gl
                where gl.game_id = any(p_games)
                  and (gl.order_number = c.order_number
                       or gl.order_number in (select lt.key from public.store_chat_threads lt
                                               where lt.home_key = c.order_number)))
       )
  ) end;
$$;

-- ===========================================================================
-- 9. Previews: product cards (0024 otherwise)
-- ===========================================================================
create or replace function public.store_chat_preview(p_kind text, p_body text, p_payload jsonb)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when p_kind = 'album' then
      case
        when p_payload ->> 'label' = 'proof_of_delivery' then 'Proof of delivery'
        when length(btrim(coalesce(p_body, ''))) > 0
          then 'Photos: ' || left(regexp_replace(btrim(p_body), '\s+', ' ', 'g'), 150)
        else 'Photos'
      end
    when p_kind = 'product' then
      case when p_payload ->> 'type' = 'game'
        then 'Pricelist: ' || left(coalesce(p_payload ->> 'game_name', ''), 140)
        else 'Recommended: ' || left(coalesce(p_payload ->> 'product_name', ''), 140)
      end
    else public.store_chat_preview(p_kind, p_body)
  end;
$$;

-- ===========================================================================
-- 10. Privileges: service role only
-- ===========================================================================
revoke all on function public.store_order_messages_thread_guard() from public, anon, authenticated;
revoke all on function public.store_attach_order_to_customer(text, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.store_send_recommendation(text, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.store_send_payment_details(text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.store_confirm_payment(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.store_set_fulfillment_detail(text, integer, integer, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.store_customer_orders(uuid, text, timestamptz, text, integer) from public, anon, authenticated;
revoke all on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text, uuid[], boolean) from public, anon, authenticated;
revoke all on function public.store_admin_inbox_outside_count(uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.store_attach_order_to_customer(text, uuid, text, text, uuid) to service_role;
grant execute on function public.store_send_recommendation(text, uuid, jsonb, uuid) to service_role;
grant execute on function public.store_send_payment_details(text, uuid, uuid, uuid) to service_role;
grant execute on function public.store_confirm_payment(text, uuid, uuid) to service_role;
grant execute on function public.store_set_fulfillment_detail(text, integer, integer, text, text, text, uuid, text) to service_role;
grant execute on function public.store_customer_orders(uuid, text, timestamptz, text, integer) to service_role;
grant execute on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text, uuid[], boolean) to service_role;
grant execute on function public.store_admin_inbox_outside_count(uuid, uuid[], boolean) to service_role;
grant select, insert, update, delete on public.store_order_recommendations to service_role;
grant select, update on public.store_chat_settings to service_role;

notify pgrst, 'reload schema';

commit;
