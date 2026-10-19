-- 0035: historical chat links. Apply after 0034; NEVER requires 0023.
-- Migration-first, disabled by default. See docs/historical-chat-consolidation.md.
-- Messages, source ownership, read cursors and XOB records are never moved/updated.
begin;
alter table public.store_chat_settings add column if not exists historical_chat_enabled boolean not null default false;
create table if not exists public.store_chat_history_links (
  source_key text primary key references public.store_chat_threads(key) on delete restrict,
  home_key text not null references public.store_chat_threads(key) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  linked_at timestamptz not null default now(),
  linked_by uuid not null references public.admin_users(user_id) on delete restrict,
  check (source_key <> home_key)
);
create index if not exists store_chat_history_links_home_idx on public.store_chat_history_links(home_key, source_key);
alter table public.store_chat_history_links enable row level security;
revoke all on public.store_chat_history_links from public, anon, authenticated;
grant select on public.store_chat_history_links to service_role;
analyze public.store_chat_history_links;

-- Revalidates account ownership even after linking; never trusts client identity.
create or replace view public.store_chat_active_history as
select l.* from public.store_chat_history_links l
join public.store_chat_threads src on src.key = l.source_key and src.kind = 'order' and src.home_key is null
join public.store_order_snapshots s on s.order_number = src.key and s.owner_user_id = l.owner_user_id
join public.store_chat_threads dst on dst.key = l.home_key and dst.kind = 'inquiry' and dst.owner_user_id = l.owner_user_id
where coalesce((select historical_chat_enabled from public.store_chat_settings where id),false);
revoke all on public.store_chat_active_history from public, anon, authenticated;
grant select on public.store_chat_active_history to service_role;

-- Read-side only: never use this view to choose a payment's original chat.
create or replace view public.store_chat_thread_presentation as
select t.key, t.kind, t.order_number, t.owner_user_id, t.customer_name, t.created_at,
       coalesce(t.home_key, h.home_key) as home_key
from public.store_chat_threads t
left join public.store_chat_active_history h on h.source_key = t.key;
revoke all on public.store_chat_thread_presentation from public, anon, authenticated;
grant select on public.store_chat_thread_presentation to service_role;

-- Preserve the native home_key index: coalesce(home_key, history.home_key)
-- is useful for single-key lookup, but must not drive inbox-wide joins.
create or replace view public.store_chat_linked_orders as
select key,home_key from public.store_chat_threads where home_key is not null
union all
select source_key as key,home_key from public.store_chat_active_history;
revoke all on public.store_chat_linked_orders from public,anon,authenticated;
grant select on public.store_chat_linked_orders to service_role;

-- Extend the existing audit vocabulary, preserving any deployment-specific actions.
do $$ declare v_check text; begin
 select pg_get_constraintdef(oid) into v_check from pg_constraint
 where conrelid='public.store_chat_audit_log'::regclass and conname='store_chat_audit_log_action_valid';
 if v_check not like '%conversation.history_linked%' then
   alter table public.store_chat_audit_log drop constraint store_chat_audit_log_action_valid;
   execute 'alter table public.store_chat_audit_log add constraint store_chat_audit_log_action_valid check ('
     || substring(v_check from 8 for length(v_check)-8) || ' OR action = ''conversation.history_linked'')';
 end if;
end $$;

-- Keep realtime inbox metadata as conservative as the inbox query. A
-- home-only confirmation cannot certify historical orders as collectively Paid.
create or replace function public.store_chat_send(p_topic text,p_event text,p_payload jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_topic = 'admin:inbox' and p_event = 'conversation'
     and exists (select 1 from public.store_chat_active_history h where h.home_key = p_payload->>'order_number') then
    p_payload := p_payload || jsonb_build_object('payment_received_message_id',null,'payment_received_at',null);
  end if;
  perform realtime.send(p_payload,p_event,p_topic,true);
exception when others then
  raise warning 'store_chat_send(%) failed: %',p_topic,sqlerrm;
end;
$$;

-- Latest/first card per order in one bounded server-side batch. Do not
-- fetch every historical payment card through a REST row-limit boundary.
create index if not exists store_history_payment_subject_idx on public.store_order_messages
  (order_number,order_ref,created_at desc,id desc) where kind = 'payment';
create or replace function public.store_order_payment_states(p_home text,p_orders text[])
returns table(order_number text,state text,sent_at timestamptz)
language sql stable security definer set search_path = pg_catalog, public as $$
 select t.key,
   case when latest.id is null then 'awaiting'
        when exists(select 1 from public.store_payment_confirmations pc where pc.message_id=latest.id) then 'received'
        else 'sent' end,
   first_card.created_at
 from public.store_chat_thread_presentation t
 left join lateral (
   select x.* from (
     (select m.id,m.created_at from public.store_order_messages m where m.order_number=t.key and m.order_ref is null and m.kind='payment' order by m.created_at desc,m.id desc limit 1)
     union all
     (select m.id,m.created_at from public.store_order_messages m where m.order_number=p_home and m.order_ref=t.key and m.kind='payment' order by m.created_at desc,m.id desc limit 1)
   ) x order by x.created_at desc,x.id desc limit 1
 ) latest on true
 left join lateral (
   select min(x.created_at) as created_at from (
     (select m.created_at from public.store_order_messages m where m.order_number=t.key and m.order_ref is null and m.kind='payment' order by m.created_at,m.id limit 1)
     union all
     (select m.created_at from public.store_order_messages m where m.order_number=p_home and m.order_ref=t.key and m.kind='payment' order by m.created_at,m.id limit 1)
   ) x
 ) first_card on true
 where t.key=any(p_orders) and t.kind='order' and (t.home_key=p_home or t.key=p_home);
$$;
revoke all on function public.store_order_payment_states(text,text[]) from public,anon,authenticated;
grant execute on function public.store_order_payment_states(text,text[]) to service_role;

-- A writer and linker serialize on the same source thread, before either
-- touches the conversation row. Already-open legacy tabs receive CHAT_MOVED.
create or replace function public.store_history_message_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform 1 from public.store_chat_threads where key = new.order_number for update;
  if exists (select 1 from public.store_chat_history_links where source_key = new.order_number) then
    raise exception 'CHAT_MOVED' using errcode = 'BW030';
  end if;
  return new;
end;
$$;
drop trigger if exists store_history_message_guard on public.store_order_messages;
create trigger store_history_message_guard before insert on public.store_order_messages
for each row execute function public.store_history_message_guard();

-- Old admin tabs must not resurrect/reassign an archived source behind the
-- primary inbox. Payment metadata and genuine read cursors remain writable.
create or replace function public.store_history_conversation_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if (new.state is distinct from old.state or new.assigned_admin_id is distinct from old.assigned_admin_id)
     and exists (select 1 from public.store_chat_history_links where source_key = old.order_number) then
    raise exception 'CHAT_MOVED' using errcode = 'BW030';
  end if;
  return new;
end;
$$;
drop trigger if exists store_history_conversation_guard on public.store_order_conversations;
create trigger store_history_conversation_guard before update of state, assigned_admin_id on public.store_order_conversations
for each row execute function public.store_history_conversation_guard();
revoke all on function public.store_history_conversation_guard() from public, anon, authenticated;

create or replace function public.store_link_historical_chat(p_source text, p_actor uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_owner uuid;
  v_home text;
  v_conv public.store_order_conversations;
begin
  if p_actor is null or not exists (select 1 from public.admin_users where user_id = p_actor) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if not coalesce((select historical_chat_enabled from public.store_chat_settings where id), false) then
    return false;
  end if;
  -- Match the insert guard's lock order. Ownership and destination are locked too.
  perform 1 from public.store_chat_threads where key = p_source and kind = 'order' and home_key is null for update;
  if not found then return false; end if;
  if exists (select 1 from public.store_chat_history_links where source_key = p_source) then return true; end if;
  select owner_user_id into v_owner from public.store_order_snapshots where order_number = p_source for update;
  if v_owner is null then return false; end if;
  select key into v_home from public.store_chat_threads where kind = 'inquiry' and owner_user_id = v_owner for update;
  if not found then return false; end if;
  select * into v_conv from public.store_order_conversations where order_number = p_source for update;
  if not found then return false; end if;
  -- Valid real order + frozen lines; no heuristic identity matching.
  if not exists (select 1 from public.orders where order_number = p_source)
     or not exists (select 1 from public.store_order_line_snapshots where order_number = p_source)
     or not exists (select 1 from public.store_order_conversations where order_number = v_home)
     or not exists (select 1 from public.store_order_messages where order_number = p_source)
  then return false; end if;
  if v_conv.state <> 'done' and v_conv.last_customer_message_id is not null
     and (v_conv.last_admin_reply_id is null or
          (v_conv.last_admin_reply_at, v_conv.last_admin_reply_id) < (v_conv.last_customer_message_at, v_conv.last_customer_message_id))
  then return false; end if;
  -- An active assignment must not be hidden behind a different worker's queue.
  if v_conv.state <> 'done' and v_conv.assigned_admin_id is distinct from
       (select assigned_admin_id from public.store_order_conversations where order_number = v_home)
  then return false; end if;
  -- Preserve EVERY existing admin's unread count, not merely the linker's.
  if exists (
    select 1 from public.admin_users a
    left join public.store_conversation_reads r on r.order_number = p_source and r.admin_user_id = a.user_id
    join public.store_order_messages m on m.order_number = p_source and m.sender_role = 'customer'
    where (m.created_at, m.id) > (coalesce(r.last_read_at, a.unread_since), coalesce(r.last_read_message_id, '00000000-0000-0000-0000-000000000000'::uuid))
  ) then return false; end if;
  -- Likewise, do not hide unread admin messages from the customer.
  if exists (select 1 from public.store_order_messages m where m.order_number = p_source and m.sender_role = 'admin'
    and (v_conv.customer_read_at is null or (m.created_at,m.id) > (v_conv.customer_read_at,v_conv.customer_read_message_id)))
  then return false; end if;
  insert into public.store_chat_history_links(source_key, home_key, owner_user_id, linked_by)
  values(p_source,v_home,v_owner,p_actor) on conflict(source_key) do nothing;
  insert into public.store_chat_audit_log(actor_user_id,action,order_number,subject_id,details)
  values(p_actor,'conversation.history_linked',p_source,v_conv.id,jsonb_build_object('home_key',v_home));
  perform public.store_chat_send('admin:inbox','history',jsonb_build_object('order_number',v_home,'source_key',p_source));
  perform public.store_chat_send('chat:' || v_conv.id::text,'history',jsonb_build_object('home_key',v_home));
  perform public.store_chat_send('chat:' || c.id::text,'history',jsonb_build_object('source_key',p_source))
    from public.store_order_conversations c where c.order_number = v_home;
  perform public.store_chat_send('customer:' || v_owner::text,'message',jsonb_build_object('order_number',v_home));
  return true;
end;
$$;

-- The global (created_at,id) cursor is unique across sources. Query each
-- indexed source with a bounded page before the final merge (no history dump).
create or replace function public.store_chat_messages_page(
  p_order_number text,
  p_before_message_id uuid default null,
  p_after_message_id uuid default null,
  p_limit integer default 50
)
returns setof public.store_order_messages
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_keys text[];
  v_at timestamptz;
  v_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  select array_agg(k) into v_keys from (select p_order_number as k union all select source_key from public.store_chat_active_history where home_key = p_order_number) q;
  if p_after_message_id is not null then
    select m.created_at, m.id into v_at, v_id from public.store_order_messages m
     where m.id = p_after_message_id and m.order_number = any(v_keys);
    if not found then
      raise exception 'cursor not in this conversation' using errcode = 'P0002';
    end if;
    return query
      select z.* from unnest(v_keys) k
      cross join lateral (select m.* from public.store_order_messages m
       where m.order_number = k and (m.created_at,m.id) > (v_at,v_id)
       order by m.created_at,m.id limit v_limit) z
      order by z.created_at,z.id limit v_limit;
    return;
  end if;

  if p_before_message_id is not null then
    select m.created_at, m.id into v_at, v_id from public.store_order_messages m
     where m.id = p_before_message_id and m.order_number = any(v_keys);
    if not found then
      raise exception 'cursor not in this conversation' using errcode = 'P0002';
    end if;
  end if;

  return query
    select x.* from (
      select z.* from unnest(v_keys) k
      cross join lateral (select m.* from public.store_order_messages m
       where m.order_number = k
         and (p_before_message_id is null or (m.created_at,m.id) < (v_at,v_id))
       order by m.created_at desc,m.id desc limit v_limit) z
      order by z.created_at desc,z.id desc limit v_limit
    ) x
    order by x.created_at, x.id;
end;
$$;

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
  v_sources text[];
  v_homes text[];
  v_links_table text;
begin
  v_sources := '{}'::text[];
  v_homes := '{}'::text[];
  if coalesce((select historical_chat_enabled from public.store_chat_settings where id),false) then
    select coalesce(array_agg(source_key),'{}'::text[]),coalesce(array_agg(distinct home_key),'{}'::text[])
      into v_sources,v_homes from public.store_chat_active_history;
  end if;
  v_links_table := case when cardinality(v_sources)=0 then 'public.store_chat_threads' else 'public.store_chat_linked_orders' end;
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
            select 1 from public.store_chat_linked_orders lt
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

  return query execute format(replace($q$
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
      c.payment_request_message_id, case when c.order_number = any($11::text[]) then null::uuid else c.payment_received_message_id end,
      case when c.order_number = any($11::text[]) then null::timestamptz else c.payment_received_at end, c.payment_received_by,
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
        from public.store_chat_linked_orders lt
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
    where not (c.order_number = any($10::text[]))
      and me.user_id = $1
      and ($7::text is null or c.order_number = $7)
      and (
        $3::text is null
        or c.order_number ilike '%%' || $3 || '%%'
        or s.buyer_name ilike '%%' || $3 || '%%'
        or t.customer_name ilike '%%' || $3 || '%%'
        or s.buyer_roblox_username ilike '%%' || $3 || '%%'
        or (t.key is not null and exists (
              select 1 from public.store_chat_linked_orders lt
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
                      or gl.order_number in (select lt.key from public.store_chat_linked_orders lt
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
          or l.order_number in (select lt.key from public.store_chat_linked_orders lt
                                 where lt.home_key = x.order_number)
    ) g on true
    order by x.last_message_at desc, x.order_number desc
  $q$, 'public.store_chat_linked_orders', v_links_table), v_where)
  using p_admin, v_filter, p_search, p_before_at, p_before_order, p_limit, p_order_number,
        p_games, p_include_inquiries, v_sources, v_homes;
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
                       or gl.order_number in (select lt.key from public.store_chat_linked_orders lt
                                               where lt.home_key = c.order_number)))
       )
  ) end;
$$;

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
    case when exists (select 1 from public.store_chat_active_history h where h.source_key = s.order_number) then (select min(pm.created_at) from public.store_order_messages pm where pm.order_number = s.order_number and pm.kind = 'payment')
         when t.home_key is null then c.payment_details_sent_at
         else (select min(pm.created_at) from public.store_order_messages pm
                where pm.order_number = t.home_key and pm.order_ref = s.order_number and pm.kind = 'payment')
    end,
    -- Unread belongs to the conversation (shown once, on its own card).
    case when t.home_key is null then coalesce(u.n, 0) else 0 end
  from public.store_order_snapshots s
  left join public.store_chat_thread_presentation t on t.key = s.order_number
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

create or replace function public.store_customer_conversations(p_user uuid)
returns table (
  conversation_id uuid,
  order_number text,
  last_message_at timestamptz,
  last_message_kind text,
  last_message_preview text,
  last_sender_role text,
  payment_details_sent_at timestamptz,
  unread_count integer,
  state text,
  done_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    c.id, c.order_number, c.last_message_at, c.last_message_kind,
    c.last_message_preview, c.last_sender_role, c.payment_details_sent_at,
    coalesce(u.n, 0), c.state, c.done_at
  from public.store_order_conversations c
  join (
    select s.order_number as key
      from public.store_order_snapshots s
     where s.owner_user_id = p_user
    union all
    select t.key
      from public.store_chat_threads t
     where t.kind = 'inquiry' and t.owner_user_id = p_user
  ) mine on mine.key = c.order_number
  left join lateral (
    select count(*)::integer as n
      from public.store_order_messages m
     where m.order_number = c.order_number
       and m.sender_role = 'admin'
       and (c.customer_read_at is null
            or (m.created_at, m.id) > (c.customer_read_at, c.customer_read_message_id))
  ) u on true
  where not exists (select 1 from public.store_chat_active_history h where h.source_key = c.order_number)
  order by c.last_message_at desc
  limit 100;
$$;

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

  perform 1 from public.store_chat_threads where key = p_order_number for update;
  select s.total_amount into v_total from public.store_order_snapshots s
   where s.order_number = p_order_number;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  -- 0033: an order in its customer's conversation gets its card there,
  -- tagged with the order. Older orders keep using their own chat.
  select t.home_key into v_key from public.store_chat_thread_presentation t where t.key = p_order_number;
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
    select 1 from public.store_chat_thread_presentation t
     where t.key = new.order_ref and t.home_key = new.order_number
  ) then
    raise exception 'order is not part of this conversation' using errcode = 'BW031';
  end if;
  return new;
end;
$$;

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

  perform 1 from public.store_chat_threads where key = coalesce(
    (select coalesce(m.order_ref, m.order_number) from public.store_order_messages m where m.id = p_message_id and m.order_number = v_key), v_key) for update;
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
   where m.kind = 'payment' and (
       (m.order_number = v_key and m.order_ref is not distinct from v_msg.order_ref)
       or (v_msg.order_ref is null and exists (
         select 1 from public.store_chat_history_links h where h.source_key = v_key
           and m.order_number = h.home_key and m.order_ref = h.source_key))
       or (v_msg.order_ref is not null and m.order_number = v_msg.order_ref and m.order_ref is null
         and exists (select 1 from public.store_chat_history_links h where h.source_key = v_msg.order_ref and h.home_key = v_key))
     )
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

create or replace function public.store_history_relay()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_source text; v_home text; v_id uuid; v_summary jsonb; v_message uuid;
begin
  if tg_table_name = 'store_message_reactions' then
    v_source := coalesce(new.order_number,old.order_number);
    v_message := coalesce(new.message_id,old.message_id);
  else
    v_source := new.order_number; v_message := new.message_id;
  end if;
  select h.home_key,c.id into v_home,v_id from public.store_chat_active_history h
    join public.store_order_conversations c on c.order_number = h.home_key where h.source_key = v_source;
  if v_home is null then return null; end if;
  if tg_table_name = 'store_message_reactions' then
    v_summary := public.store_reaction_summary(v_message);
    perform public.store_chat_send('chat:' || v_id::text,'reaction',jsonb_build_object('message_id',v_message,'counts',v_summary->'counts','customer',v_summary->'customer'));
    perform public.store_chat_send('admin:inbox','reaction',jsonb_build_object('order_number',v_home,'message_id',v_message) || v_summary);
  else
    perform public.store_chat_send('chat:' || v_id::text,'payment',jsonb_build_object('message_id',v_message));
    perform public.store_chat_send('admin:inbox','history_payment',jsonb_build_object('order_number',v_home,'message_id',v_message));
  end if;
  return null;
end;
$$;
drop trigger if exists store_history_reaction_relay on public.store_message_reactions;
create trigger store_history_reaction_relay after insert or update or delete on public.store_message_reactions for each row execute function public.store_history_relay();
drop trigger if exists store_history_payment_relay on public.store_payment_confirmations;
create trigger store_history_payment_relay after insert on public.store_payment_confirmations for each row execute function public.store_history_relay();

revoke all on function public.store_history_message_guard() from public, anon, authenticated;
revoke all on function public.store_history_relay() from public, anon, authenticated;
revoke all on function public.store_link_historical_chat(text,uuid) from public, anon, authenticated;
grant execute on function public.store_link_historical_chat(text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
