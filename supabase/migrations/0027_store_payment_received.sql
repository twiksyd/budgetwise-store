-- 0027: "Payment Received" — BudgetWise's own payment verification state.
--
-- NOT APPLIED. Review, then apply by hand. Do not run 0023 as part of this.
-- Tested on a throwaway local PostgreSQL (scripts/test-db.mjs).
--
-- An admin who has checked the BudgetWise GCash account confirms that the
-- money for ONE payment card (a kind = 'payment' message) arrived. That is
-- all this records. It never touches XOB: orders.status, fulfillment and
-- XOB payment handling are not read for the decision and never written.
-- A customer's receipt image is never treated as proof; only an admin's
-- explicit confirmation sets this state.
--
-- Which card is confirmed: the request names the payment message id, and
-- only the order's LATEST payment card can be confirmed (an older card was
-- replaced by newer details, BW020). One confirmation per card, ever:
-- repeats return the original confirmation instead of a second one. There
-- are no reversals in this phase.
--
-- 1. store_payment_confirmations: one row per confirmed payment card,
--    with the amount/account it confirmed, who and when (+ audit log row).
-- 2. store_order_conversations gains:
--      payment_request_message_id  the latest payment card (set on insert)
--      payment_received_message_id the most recently confirmed card
--      payment_received_at / _by   when and by which admin
--    The inbox shows "Paid" only while the latest card is the confirmed one,
--    so new payment details after a confirmation read as unpaid again.
-- 3. store_confirm_payment(order, message, actor): the only write path.
--    The conversation row is locked first, so two admins confirming at the
--    same moment serialize: one creates it, the other gets created = false
--    and the first admin's confirmation back.
-- 4. store_order_conversations_after_update(): 0026's body verbatim, plus
--    the payment fields on the admin:inbox 'conversation' event and one
--    'payment' ping (empty payload) on the customer's chat:<id> topic.
--    The trigger's WHEN clause adds the payment columns.
-- 5. store_admin_inbox(): 0026's body verbatim plus the four payment
--    columns (return type changes, so it is dropped and recreated).
--
-- Deploy order: apply this BEFORE deploying the app. The app tolerates the
-- old schema for reads (missing columns read as "not confirmed"), but the
-- confirm button needs store_confirm_payment.
-- Rollback: supabase/rollback/0027_down.sql (refused while confirmations exist).

begin;

-- ===========================================================================
-- 1. Confirmations
-- ===========================================================================
create table if not exists public.store_payment_confirmations (
  message_id uuid primary key
    references public.store_order_messages (id) on delete cascade,
  order_number text not null
    references public.store_chat_threads (key) on delete cascade,
  confirmed_by uuid references auth.users (id) on delete set null,
  -- What was confirmed, frozen from the payment card at confirmation time.
  amount numeric(12, 2) not null,
  currency text not null default 'PHP',
  provider text not null,
  account_number text not null,
  confirmed_at timestamptz not null default now(),
  constraint store_payment_confirmations_currency_valid check (currency = 'PHP'),
  constraint store_payment_confirmations_amount_valid check (amount >= 0)
);

create index if not exists store_payment_confirmations_order_idx
  on public.store_payment_confirmations (order_number, confirmed_at desc);

alter table public.store_payment_confirmations enable row level security;
revoke all on public.store_payment_confirmations from public, anon, authenticated;

-- ===========================================================================
-- 2. Conversation payment state
-- ===========================================================================
alter table public.store_order_conversations
  add column if not exists payment_request_message_id uuid,
  add column if not exists payment_received_message_id uuid,
  add column if not exists payment_received_at timestamptz,
  add column if not exists payment_received_by uuid;

-- Existing chats: the latest payment card each conversation already has.
update public.store_order_conversations c
   set payment_request_message_id = latest.id
  from (
    select distinct on (m.order_number) m.order_number, m.id
      from public.store_order_messages m
     where m.kind = 'payment'
     order by m.order_number, m.created_at desc, m.id desc
  ) latest
 where latest.order_number = c.order_number
   and c.payment_request_message_id is distinct from latest.id;

-- New payment cards become the one awaiting confirmation. Runs after
-- store_order_messages_after_insert (triggers fire in name order), so the
-- conversation row already exists.
create or replace function public.store_order_messages_payment_request()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.store_order_conversations c
     set payment_request_message_id = new.id,
         updated_at = now()
   where c.order_number = new.order_number
     and (
       c.payment_request_message_id is null
       or (select (m.created_at, m.id) from public.store_order_messages m
            where m.id = c.payment_request_message_id) <= (new.created_at, new.id)
     );
  return null;
end;
$$;

drop trigger if exists store_order_messages_payment_request on public.store_order_messages;
create trigger store_order_messages_payment_request
  after insert on public.store_order_messages
  for each row
  when (new.kind = 'payment')
  execute function public.store_order_messages_payment_request();

-- ===========================================================================
-- 3. Audit action
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'store_chat_audit_log_action_valid'
       and conrelid = 'public.store_chat_audit_log'::regclass
       and pg_get_constraintdef(oid) like '%payment.confirmed%'
  ) then
    alter table public.store_chat_audit_log
      drop constraint if exists store_chat_audit_log_action_valid;
    alter table public.store_chat_audit_log
      add constraint store_chat_audit_log_action_valid
      check (action in (
        'conversation.assigned',
        'conversation.unassigned',
        'conversation.done',
        'conversation.reopened',
        'quick_reply.created',
        'quick_reply.updated',
        'payment_method.created',
        'payment_method.updated',
        'fulfillment_detail.submitted',
        'fulfillment_detail.corrected',
        'payment.confirmed'
      ));
  end if;
end $$;

-- ===========================================================================
-- 4. Confirm (the only write path)
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

-- ===========================================================================
-- 5. Realtime: 0026's body verbatim + payment fields / 'payment' ping
-- ===========================================================================
create or replace function public.store_order_conversations_after_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid;
begin
  perform public.store_chat_send(
    'admin:inbox',
    'conversation',
    jsonb_build_object(
      'conversation_id', new.id,
      'order_number', new.order_number,
      'assigned_admin_id', new.assigned_admin_id,
      'assigned_by', new.assigned_by,
      'assigned_at', new.assigned_at,
      'customer_read_at', new.customer_read_at,
      'customer_read_message_id', new.customer_read_message_id,
      'admin_read_at', new.admin_read_at,
      'admin_read_message_id', new.admin_read_message_id,
      'state', new.state,
      'done_at', new.done_at,
      'done_by', new.done_by,
      -- 0027
      'payment_request_message_id', new.payment_request_message_id,
      'payment_received_message_id', new.payment_received_message_id,
      'payment_received_at', new.payment_received_at,
      'payment_received_by', new.payment_received_by
    )
  );

  if (new.admin_read_at, new.admin_read_message_id)
       is distinct from (old.admin_read_at, old.admin_read_message_id) then
    perform public.store_chat_send(
      'chat:' || new.id::text,
      'seen',
      jsonb_build_object(
        'admin_read_at', new.admin_read_at,
        'admin_read_message_id', new.admin_read_message_id
      )
    );
  end if;

  if new.state is distinct from old.state then
    perform public.store_chat_send(
      'chat:' || new.id::text,
      'state',
      jsonb_build_object('state', new.state)
    );
  end if;

  if new.state is distinct from old.state
     or new.customer_read_message_id is distinct from old.customer_read_message_id then
    v_owner := public.store_chat_owner(new.order_number);
    if v_owner is not null then
      perform public.store_chat_send(
        'customer:' || v_owner::text,
        'conversation',
        jsonb_build_object(
          'conversation_id', new.id,
          'order_number', new.order_number,
          'state', new.state
        )
      );
    end if;
  end if;

  -- 0025: the customer's chat shows who is assisting. Tell it that the
  -- assignment changed; the payload carries no ids or names (the client
  -- re-reads the public username from the summary API).
  if new.assigned_admin_id is distinct from old.assigned_admin_id then
    perform public.store_chat_send('chat:' || new.id::text, 'assistant', '{}'::jsonb);
  end if;

  -- 0027: a payment was confirmed. Empty payload, like 'assistant': the
  -- customer re-reads the confirmed state from the server.
  if new.payment_received_message_id is distinct from old.payment_received_message_id then
    perform public.store_chat_send('chat:' || new.id::text, 'payment', '{}'::jsonb);
  end if;

  return null;
end;
$$;

drop trigger if exists store_order_conversations_after_update on public.store_order_conversations;
create trigger store_order_conversations_after_update
  after update on public.store_order_conversations
  for each row
  when (
    old.assigned_admin_id is distinct from new.assigned_admin_id
    or old.customer_read_message_id is distinct from new.customer_read_message_id
    or old.admin_read_message_id is distinct from new.admin_read_message_id
    or old.state is distinct from new.state
    or old.payment_request_message_id is distinct from new.payment_request_message_id
    or old.payment_received_message_id is distinct from new.payment_received_message_id
  )
  execute function public.store_order_conversations_after_update();

-- ===========================================================================
-- 6. Inbox rows carry the payment state (0026's body + four columns)
-- ===========================================================================
drop function if exists public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text);
create function public.store_admin_inbox(
  p_admin uuid,
  p_filter text default 'all',
  p_search text default null,
  p_before_at timestamptz default null,
  p_before_order text default null,
  p_limit integer default 30,
  p_order_number text default null
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
  payment_received_by uuid
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
    when 'under_review' then $w$st.status = 'pending'$w$
    else 'false'
  end;

  return query execute format($q$
    select
      c.id, c.order_number, coalesce(s.buyer_name, t.customer_name), s.buyer_roblox_username,
      s.total_amount, coalesce(s.created_at, t.created_at), st.status,
      c.assigned_admin_id, c.assigned_at,
      c.last_message_id, c.last_message_at, c.last_message_kind,
      c.last_message_preview, c.last_sender_role,
      c.customer_read_at, c.customer_read_message_id,
      c.payment_details_sent_at,
      r.last_read_at, r.last_read_message_id,
      coalesce(u.n, 0),
      c.state, c.done_at, c.done_by,
      c.payment_request_message_id, c.payment_received_message_id,
      c.payment_received_at, c.payment_received_by
    from public.admin_users me
    join public.store_order_conversations c on true
    left join public.store_order_snapshots s on s.order_number = c.order_number
    left join public.store_chat_threads t on t.key = c.order_number and t.kind = 'inquiry'
    left join public.store_conversation_reads r
      on r.order_number = c.order_number and r.admin_user_id = me.user_id
    left join lateral (
      select o.status from public.orders o
       where o.order_number = c.order_number limit 1
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
    where me.user_id = $1
      and ($7::text is null or c.order_number = $7)
      and (
        $3::text is null
        or c.order_number ilike '%%' || $3 || '%%'
        or s.buyer_name ilike '%%' || $3 || '%%'
        or t.customer_name ilike '%%' || $3 || '%%'
        or s.buyer_roblox_username ilike '%%' || $3 || '%%'
      )
      and (%s)
      and ($4::timestamptz is null or (c.last_message_at, c.order_number) < ($4, $5::text))
    order by c.last_message_at desc, c.order_number desc
    limit least(greatest(coalesce($6::integer, 30), 1), 100)
  $q$, v_where)
  using p_admin, v_filter, p_search, p_before_at, p_before_order, p_limit, p_order_number;
end;
$fn$;

-- ===========================================================================
-- 7. Privileges: service role only
-- ===========================================================================
revoke all on function public.store_confirm_payment(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.store_order_messages_payment_request() from public, anon, authenticated;
revoke all on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text) from public, anon, authenticated;
grant execute on function public.store_confirm_payment(text, uuid, uuid) to service_role;
grant execute on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text) to service_role;
grant select, insert, update, delete on public.store_payment_confirmations to service_role;

notify pgrst, 'reload schema';

commit;
