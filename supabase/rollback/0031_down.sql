-- Rollback of 0031. Roll the application back FIRST.
-- Inquiry payment cards already sent stay in the chat (they are ordinary
-- payment messages); they can no longer be confirmed after this.
-- store_confirm_payment below is 0027's, verbatim.

begin;

drop function if exists public.store_send_inquiry_payment_details(text, uuid, uuid, numeric, uuid);

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

  -- Orders only: a General Inquiry never has payment details.
  if not exists (select 1 from public.store_order_snapshots s where s.order_number = p_order_number) then
    raise exception 'order not found' using errcode = 'P0002';
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

revoke all on function public.store_confirm_payment(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.store_confirm_payment(text, uuid, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
