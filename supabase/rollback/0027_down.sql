-- Rollback of 0027 (Payment Received).
--
-- Refused while any payment confirmation exists: the verification record
-- and its audit trail are never deleted silently. Roll the application back
-- FIRST. The function bodies below are 0026's, copied verbatim.

begin;

do $$
begin
  if to_regclass('public.store_payment_confirmations') is not null
     and exists (select 1 from public.store_payment_confirmations) then
    raise exception 'payment confirmations exist; 0027 cannot be rolled back without losing them';
  end if;
end $$;

drop function if exists public.store_confirm_payment(text, uuid, uuid);
drop trigger if exists store_order_messages_payment_request on public.store_order_messages;
drop function if exists public.store_order_messages_payment_request();

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
      'done_by', new.done_by
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
  )
  execute function public.store_order_conversations_after_update();

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
  done_by uuid
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
      c.state, c.done_at, c.done_by
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

revoke all on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text) from public, anon, authenticated;
grant execute on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text) to service_role;

alter table public.store_order_conversations
  drop column if exists payment_request_message_id,
  drop column if exists payment_received_message_id,
  drop column if exists payment_received_at,
  drop column if exists payment_received_by;

drop table if exists public.store_payment_confirmations;

-- The audit constraint keeps 'payment.confirmed' allowed: earlier audit
-- rows stay valid (none exist when this runs, see the guard above).

notify pgrst, 'reload schema';

commit;
