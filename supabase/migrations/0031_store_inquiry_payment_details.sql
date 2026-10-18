-- 0031: GCash payment details in General Inquiry chats (custom amount).
--
-- NOT APPLIED. Review, then apply by hand. Do not run 0023 as part of this.
-- Production sequence: 0021, 0022, 0024 ... 0030, then this.
-- Tested on a throwaway local PostgreSQL (scripts/test-db.mjs).
--
-- A customer asking about a game not in the catalog can be quoted a price
-- and sent the usual GCash card in their General Inquiry. No order and no
-- order snapshot are created.
--
-- 1. store_send_inquiry_payment_details(key, actor, method, amount, client id)
--    General Inquiry threads only. The amount is the one the admin typed
--    and confirmed (PHP, > 0, at most 1,000,000, at most 2 decimals); it is
--    never derived from anything else. Same message shape as order payment
--    cards (plus amount_source = 'admin_quote'), so the customer card, Copy
--    actions, QR, Payment Received and realtime all work unchanged.
--    Idempotent per (thread, admin, client id); the same id reused with a
--    different amount or account is refused (BW010). Assigns an Unassigned
--    inquiry to the sender with an audit row, like 0029 does for orders.
-- 2. store_confirm_payment(): 0027's body verbatim except the first check:
--    it accepts any chat thread (order or inquiry) instead of orders only.
--    Still admins only, the latest payment card only (BW020), one
--    confirmation per card, audited. Never from a customer upload.
--
-- store_send_payment_details (orders, 0029) is unchanged: orders still use
-- the order total. XOB orders/fulfillment are not touched.
-- Deploy order: apply BEFORE deploying the app.
-- Rollback: supabase/rollback/0031_down.sql.

begin;

-- ===========================================================================
-- 1. Payment details in a General Inquiry (admin-quoted amount)
-- ===========================================================================
create or replace function public.store_send_inquiry_payment_details(
  p_key text,
  p_actor uuid,
  p_method_id uuid,
  p_amount numeric,
  p_client_message_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_method public.store_payment_methods;
  v_id uuid;
  v_existing public.store_order_messages;
  v_conv uuid;
begin
  if p_actor is null or not exists (select 1 from public.admin_users where user_id = p_actor) then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  if not exists (select 1 from public.store_chat_threads t where t.key = p_key and t.kind = 'inquiry') then
    raise exception 'general inquiry not found' using errcode = 'P0002';
  end if;

  if p_client_message_id is null then
    raise exception 'client message id required' using errcode = '22023';
  end if;

  -- The admin's quote: explicit, positive, peso amount with centavos at most.
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 or p_amount <> round(p_amount, 2) then
    raise exception 'invalid amount' using errcode = '22023';
  end if;

  select * into v_method from public.store_payment_methods
   where id = p_method_id and is_active;
  if not found then
    raise exception 'payment method not available' using errcode = 'P0002';
  end if;

  insert into public.store_order_messages (
    order_number, sender_role, sender_user_id, kind, body, payload, client_message_id
  )
  values (
    p_key, 'admin', p_actor, 'payment',
    format('%s payment details. Amount: PHP %s. Account: %s (%s).',
           v_method.label, to_char(p_amount, 'FM999,999,990.00'),
           v_method.account_name, v_method.account_number),
    jsonb_build_object(
      'method_id', v_method.id,
      'provider', v_method.provider,
      'label', v_method.label,
      'account_name', v_method.account_name,
      'account_number', v_method.account_number,
      'amount', round(p_amount, 2),
      'currency', 'PHP',
      'has_qr', v_method.qr_storage_path is not null,
      'qr_path', v_method.qr_storage_path,
      'amount_source', 'admin_quote'
    ),
    p_client_message_id
  )
  on conflict (order_number, sender_user_id, client_message_id)
    where client_message_id is not null
    do nothing
  returning id into v_id;

  if v_id is null then
    -- A retry: the same card, or the client id was reused for another one.
    select * into v_existing from public.store_order_messages m
     where m.order_number = p_key
       and m.sender_user_id = p_actor
       and m.client_message_id = p_client_message_id;
    if v_existing.kind is distinct from 'payment'
       or (v_existing.payload ->> 'amount')::numeric is distinct from round(p_amount, 2)
       or v_existing.payload ->> 'method_id' is distinct from p_method_id::text then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'BW010';
    end if;
    return v_existing.id;
  end if;

  -- Unassigned inquiry -> the sender's (same rule as 0029 for orders).
  update public.store_order_conversations c
     set assigned_admin_id = p_actor,
         assigned_by = p_actor,
         assigned_at = now(),
         updated_at = now()
   where c.order_number = p_key
     and c.assigned_admin_id is null
  returning c.id into v_conv;

  if v_conv is not null then
    insert into public.store_chat_audit_log (actor_user_id, action, order_number, subject_id, details)
    values (
      p_actor, 'conversation.assigned', p_key, v_conv,
      jsonb_build_object('from', null, 'to', p_actor, 'cause', 'payment_details', 'message_id', v_id)
    );
  end if;

  return v_id;
end;
$$;

-- ===========================================================================
-- 2. Payment Received for order chats and General Inquiry (0027 otherwise)
-- ===========================================================================
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
  v_conv public.store_order_conversations;
  v_msg public.store_order_messages;
  v_latest uuid;
  v_row public.store_payment_confirmations;
  v_amount numeric;
begin
  if p_actor is null or not exists (select 1 from public.admin_users where user_id = p_actor) then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  -- 0031: an order chat or a General Inquiry (any chat thread).
  if not exists (select 1 from public.store_chat_threads t where t.key = p_order_number) then
    raise exception 'chat not found' using errcode = 'P0002';
  end if;

  -- Serializes concurrent confirmations for this order.
  select * into v_conv from public.store_order_conversations
   where order_number = p_order_number
   for update;
  if not found then
    raise exception 'payment details not sent' using errcode = 'P0002';
  end if;

  select * into v_msg from public.store_order_messages m
   where m.id = p_message_id
     and m.order_number = p_order_number
     and m.kind = 'payment'
     and m.sender_role = 'admin';
  if not found then
    raise exception 'payment details not found' using errcode = 'P0002';
  end if;

  -- Already confirmed (repeat click, retry after a lost response, the other
  -- admin was faster): the original confirmation, unchanged.
  select * into v_row from public.store_payment_confirmations where message_id = p_message_id;
  if found then
    return jsonb_build_object('created', false, 'confirmation', to_jsonb(v_row));
  end if;

  select m.id into v_latest from public.store_order_messages m
   where m.order_number = p_order_number and m.kind = 'payment'
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
    message_id, order_number, confirmed_by, amount, currency, provider, account_number
  )
  values (
    p_message_id, p_order_number, p_actor, v_amount, 'PHP',
    coalesce(v_msg.payload ->> 'provider', ''), coalesce(v_msg.payload ->> 'account_number', '')
  )
  on conflict (message_id) do nothing
  returning * into v_row;

  if not found then
    select * into v_row from public.store_payment_confirmations where message_id = p_message_id;
    return jsonb_build_object('created', false, 'confirmation', to_jsonb(v_row));
  end if;

  update public.store_order_conversations c
     set payment_received_message_id = v_row.message_id,
         payment_received_at = v_row.confirmed_at,
         payment_received_by = p_actor,
         updated_at = now()
   where c.id = v_conv.id;

  insert into public.store_chat_audit_log (actor_user_id, action, order_number, subject_id, details)
  values (
    p_actor, 'payment.confirmed', p_order_number, p_message_id,
    jsonb_build_object(
      'amount', v_row.amount,
      'currency', v_row.currency,
      'provider', v_row.provider,
      'account_number', v_row.account_number,
      'method_id', v_msg.payload ->> 'method_id',
      'payment_sent_at', v_msg.created_at
    )
  );

  return jsonb_build_object('created', true, 'confirmation', to_jsonb(v_row));
end;
$$;

-- ===========================================================================
-- 3. Privileges: service role only
-- ===========================================================================
revoke all on function public.store_send_inquiry_payment_details(text, uuid, uuid, numeric, uuid) from public, anon, authenticated;
revoke all on function public.store_confirm_payment(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.store_send_inquiry_payment_details(text, uuid, uuid, numeric, uuid) to service_role;
grant execute on function public.store_confirm_payment(text, uuid, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
