-- Rollback of 0033. Roll the application back FIRST.
--
-- Refused once any order has joined a customer conversation, any message
-- carries an order_ref, or any product card / recommendation link exists:
-- those messages would otherwise lose the order they belong to. Older
-- order chats were never changed by 0033 and need nothing.
-- Every function below is restored verbatim from the migration named.

begin;

do $$
begin
  if exists (select 1 from public.store_chat_threads where home_key is not null)
     or exists (select 1 from public.store_order_messages where order_ref is not null or kind = 'product')
     or exists (select 1 from public.store_order_recommendations) then
    raise exception '0033 rollback refused: orders already live in customer conversations';
  end if;
end $$;

drop trigger if exists store_order_messages_thread_guard on public.store_order_messages;
drop function if exists public.store_order_messages_thread_guard();
drop function if exists public.store_attach_order_to_customer(text, uuid, text, text, uuid);
drop function if exists public.store_send_recommendation(text, uuid, jsonb, uuid);
drop table if exists public.store_order_recommendations;
drop table if exists public.store_chat_settings;
alter table public.store_payment_confirmations drop column if exists order_ref;

drop index if exists public.store_order_messages_order_ref_idx;
drop index if exists public.store_order_messages_one_slip_per_order_idx;
drop index if exists public.store_order_messages_one_slip_idx;
create unique index store_order_messages_one_slip_idx
  on public.store_order_messages (order_number)
  where kind = 'slip';

alter table public.store_order_messages drop constraint if exists store_order_messages_order_ref_kind;
alter table public.store_order_messages drop constraint if exists store_order_messages_product_shape;
alter table public.store_order_messages drop column if exists order_ref;
alter table public.store_order_messages drop constraint if exists store_order_messages_kind_valid;
alter table public.store_order_messages
  add constraint store_order_messages_kind_valid
  check (kind in ('slip', 'text', 'image', 'payment', 'album'));
alter table public.store_order_messages drop constraint if exists store_order_messages_payload_only_payment;
alter table public.store_order_messages
  add constraint store_order_messages_payload_only_payment
  check (payload is null or kind in ('payment', 'album'));
alter table public.store_order_conversations drop constraint if exists store_order_conversations_last_kind_valid;
alter table public.store_order_conversations
  add constraint store_order_conversations_last_kind_valid
  check (last_message_kind in ('slip', 'text', 'image', 'payment', 'album'));

drop index if exists public.store_chat_threads_home_key_idx;
alter table public.store_chat_threads drop constraint if exists store_chat_threads_home_shape;
alter table public.store_chat_threads drop column if exists home_key;

-- 0029
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

  insert into public.store_order_messages (
    order_number, sender_role, sender_user_id, kind, body, payload, client_message_id
  )
  values (
    p_order_number, 'admin', p_actor, 'payment',
    format('%s payment details. Amount: PHP %s. Account: %s (%s).',
           v_method.label, to_char(v_total, 'FM999,999,990.00'),
           v_method.account_name, v_method.account_number),
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
    ),
    p_client_message_id
  )
  on conflict (order_number, sender_user_id, client_message_id)
    where client_message_id is not null
    do nothing
  returning id into v_id;

  v_created := v_id is not null;

  if v_id is null then
    select m.id into v_id from public.store_order_messages m
     where m.order_number = p_order_number
       and m.sender_user_id = p_actor
       and m.client_message_id = p_client_message_id;
  end if;

  -- 0029: an Unassigned chat becomes the sender's. Only for a newly sent
  -- card (a retry of the same card never re-assigns), never over an
  -- existing assignment.
  if v_created then
    update public.store_order_conversations c
       set assigned_admin_id = p_actor,
           assigned_by = p_actor,
           assigned_at = now(),
           updated_at = now()
     where c.order_number = p_order_number
       and c.assigned_admin_id is null
    returning c.id into v_conv;

    if v_conv is not null then
      insert into public.store_chat_audit_log (actor_user_id, action, order_number, subject_id, details)
      values (
        p_actor, 'conversation.assigned', p_order_number, v_conv,
        jsonb_build_object('from', null, 'to', p_actor, 'cause', 'payment_details', 'message_id', v_id)
      );
    end if;
  end if;

  return v_id;
end;
$$;

-- 0031
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

-- 0022
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

-- 0024
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
    c.payment_details_sent_at,
    coalesce(u.n, 0)
  from public.store_order_snapshots s
  left join public.store_order_conversations c on c.order_number = s.order_number
  left join lateral (
    select count(*)::integer as n
      from public.store_order_messages m
     where c.order_number is not null
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
    case when p_section = 'open' then coalesce(c.last_message_at, s.created_at) end desc,
    case when p_section = 'completed' then c.done_at end desc,
    s.order_number desc
  limit case when p_section = 'open' then 100
             else least(greatest(coalesce(p_limit, 20), 1), 50) end;
$$;

-- 0030
drop function if exists public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text, uuid[], boolean);
create or replace function public.store_admin_inbox(
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
    when 'under_review' then $w$st.status = 'pending'$w$
    when 'needs_reply' then $w$c.state = 'active'
      and c.last_customer_message_id is not null
      and (c.last_admin_reply_id is null
           or (c.last_admin_reply_at, c.last_admin_reply_id)
              < (c.last_customer_message_at, c.last_customer_message_id))$w$
    -- 0030: the shared attention states (Active chats needing a reply).
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

  -- The photo and game lookups run only for the returned page (outer query),
  -- never for every candidate row the filter scans.
  return query execute format($q$
    select x.*,
      nullif(coalesce(au.raw_user_meta_data ->> 'avatar_url', au.raw_user_meta_data ->> 'picture'), ''),
      coalesce(g.ids, '{}'::uuid[]),
      coalesce(g.names, '{}'::text[])
    from (
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
      c.payment_received_at, c.payment_received_by,
      c.last_customer_message_at, c.last_customer_message_id,
      c.last_admin_reply_at, c.last_admin_reply_id, c.last_admin_reply_by,
      coalesce(v.ids, '{}'::uuid[]),
      coalesce(s.owner_user_id, t.owner_user_id) as customer_user_id
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
      )
      and (
        $7::text is not null
        or $8::uuid[] is null
        or (t.key is not null and coalesce($9::boolean, true))
        or (t.key is null and exists (
              select 1 from public.store_order_line_snapshots gl
               where gl.order_number = c.order_number and gl.game_id = any($8::uuid[])))
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
    ) g on true
    order by x.last_message_at desc, x.order_number desc
  $q$, v_where)
  using p_admin, v_filter, p_search, p_before_at, p_before_order, p_limit, p_order_number,
        p_games, p_include_inquiries;
end;
$fn$;

-- 0029
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
         or (t.key is null and exists (
               select 1 from public.store_order_line_snapshots gl
                where gl.order_number = c.order_number and gl.game_id = any(p_games)))
       )
  ) end;
$$;

-- 0024
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
    else public.store_chat_preview(p_kind, p_body)
  end;
$$;

revoke all on function public.store_send_payment_details(text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.store_confirm_payment(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.store_set_fulfillment_detail(text, integer, integer, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.store_customer_orders(uuid, text, timestamptz, text, integer) from public, anon, authenticated;
revoke all on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text, uuid[], boolean) from public, anon, authenticated;
revoke all on function public.store_admin_inbox_outside_count(uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.store_send_payment_details(text, uuid, uuid, uuid) to service_role;
grant execute on function public.store_confirm_payment(text, uuid, uuid) to service_role;
grant execute on function public.store_set_fulfillment_detail(text, integer, integer, text, text, text, uuid, text) to service_role;
grant execute on function public.store_customer_orders(uuid, text, timestamptz, text, integer) to service_role;
grant execute on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text, uuid[], boolean) to service_role;
grant execute on function public.store_admin_inbox_outside_count(uuid, uuid[], boolean) to service_role;

notify pgrst, 'reload schema';

commit;
