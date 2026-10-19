-- 0036: compatibility upgrade; additive to 0035, no 0023 required.
-- Migration-first: neither switch is enabled and no conversations are initialized here.
begin;
alter table public.store_chat_settings add column if not exists historical_chat_compat_ready boolean not null default false;
alter table public.store_order_conversations
 alter column last_message_id drop not null,
 alter column last_message_at drop not null,
 alter column last_message_kind drop not null,
 alter column last_sender_role drop not null;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.store_order_conversations'::regclass and conname='store_conversation_activity_shape') then
 alter table public.store_order_conversations add constraint store_conversation_activity_shape check (
 (last_message_id is null and last_message_at is null and last_message_kind is null and last_sender_role is null and last_message_preview='') or
 (last_message_id is not null and last_message_at is not null and last_message_kind is not null and last_sender_role is not null));
 end if;
end $$;
create table if not exists public.store_history_approvals (
 source_key text primary key references public.store_chat_threads(key),
 home_key text not null references public.store_chat_threads(key),
 owner_user_id uuid not null references auth.users(id),
 approved_by uuid not null references public.admin_users(user_id),
 batch_id uuid not null,
 expires_at timestamptz not null,
 approved_at timestamptz not null default now()
);
create table if not exists public.store_history_operations (
 id bigint generated always as identity primary key,
 actor_id uuid not null references public.admin_users(user_id),
 operation text not null,
 customer_id uuid references auth.users(id),
 source_key text,
 batch_id uuid,
 details jsonb not null default '{}',
 created_at timestamptz not null default now()
);
alter table public.store_history_approvals enable row level security;
alter table public.store_history_operations enable row level security;
revoke all on public.store_history_approvals,public.store_history_operations from public,anon,authenticated;
grant select on public.store_history_approvals,public.store_history_operations to service_role;

create or replace function public.store_initialize_customer_conversation(p_customer uuid,p_actor uuid)
returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare h text; last_m public.store_order_messages; customer_m public.store_order_messages; reply_m public.store_order_messages; payment_c public.store_payment_confirmations;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'not an admin' using errcode='42501'; end if;
 -- Identity comes from authenticated snapshot ownership and a real order, never email/name guesses.
 if not exists(select 1 from public.store_order_snapshots s join public.orders o using(order_number) join auth.users u on u.id=s.owner_user_id where s.owner_user_id=p_customer) then
 raise exception 'no verified order ownership' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('history-init:'||p_customer::text,0));
 h:=public.store_open_inquiry(p_customer,null);
 perform 1 from public.store_chat_threads where key=h and kind='inquiry' and owner_user_id=p_customer for update;
 if not found then raise exception 'ownership conflict' using errcode='42501'; end if;
 -- A malformed imported inquiry must be reviewed; never adopt another customer's messages.
 if exists(select 1 from public.store_order_messages where order_number=h and sender_role='customer' and sender_user_id is not null and sender_user_id is distinct from p_customer)
 or exists(select 1 from public.store_chat_threads t join public.store_order_snapshots s on s.order_number=t.key where t.home_key=h and s.owner_user_id is distinct from p_customer) then
 raise exception 'ownership conflict' using errcode='42501'; end if;
 if exists(select 1 from public.store_order_conversations where order_number=h) then return h; end if;
 select * into last_m from public.store_order_messages where order_number=h order by created_at desc,id desc limit 1;
 select * into customer_m from public.store_order_messages where order_number=h and sender_role='customer' order by created_at desc,id desc limit 1;
 select * into reply_m from public.store_order_messages where order_number=h and sender_role='admin' and kind in ('text','image','album') order by created_at desc,id desc limit 1;
 select pc.* into payment_c from public.store_payment_confirmations pc join public.store_order_messages m on m.id=pc.message_id where m.order_number=h order by pc.confirmed_at desc,pc.message_id desc limit 1;
 insert into public.store_order_conversations(order_number,last_message_id,last_message_at,last_message_kind,last_message_preview,last_sender_role,
 last_customer_message_at,last_customer_message_id,last_admin_reply_at,last_admin_reply_id,last_admin_reply_by,payment_details_sent_at,payment_request_message_id,payment_received_message_id,payment_received_at,payment_received_by)
 values(h,last_m.id,last_m.created_at,last_m.kind,case when last_m.id is null then '' else public.store_chat_preview(last_m.kind,last_m.body,last_m.payload) end,last_m.sender_role,
 customer_m.created_at,customer_m.id,reply_m.created_at,reply_m.id,reply_m.sender_user_id,
 (select min(created_at) from public.store_order_messages where order_number=h and kind='payment'),
 (select id from public.store_order_messages where order_number=h and kind='payment' order by created_at desc,id desc limit 1),payment_c.message_id,payment_c.confirmed_at,payment_c.confirmed_by) on conflict(order_number) do nothing;
 insert into public.store_history_operations(actor_id,operation,customer_id,details) values(p_actor,'initialize',p_customer,jsonb_build_object('home_key',h,'empty',last_m.id is null));
 return h;
end $$;

-- Bounded initialization: explicit verified UUIDs only, no order fabrication or automatic scan.
create or replace function public.store_initialize_customer_batch(p_customers uuid[],p_actor uuid)
returns table(customer_id uuid,home_key text) language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'not an admin' using errcode='42501'; end if;
 if p_customers is null or cardinality(p_customers) not between 1 and 25 then raise exception 'invalid bounded batch'; end if;
 for u in select distinct unnest(p_customers) order by 1 loop
 customer_id:=u; home_key:=public.store_initialize_customer_conversation(u,p_actor); return next;
 end loop;
end $$;
revoke all on function public.store_initialize_customer_batch(uuid[],uuid) from public,anon,authenticated;
grant execute on function public.store_initialize_customer_batch(uuid[],uuid) to service_role;

-- Review and presentation share the exact original read-cursor rules.
create or replace function public.store_history_unread(p_source text,p_admin uuid default null)
returns table(admin_unread integer,customer_unread integer,first_admin_unread uuid,first_customer_unread uuid)
language sql stable security definer set search_path=pg_catalog,public as $$
 select a.n,b.n,a.first_id,b.first_id from
 (select count(*)::integer n,(array_agg(m.id order by m.created_at,m.id))[1] first_id
 from public.admin_users a left join public.store_conversation_reads r on r.admin_user_id=a.user_id and r.order_number=p_source
 join public.store_order_messages m on m.order_number=p_source and m.sender_role='customer'
 where a.user_id=p_admin and (m.created_at,m.id)>(coalesce(r.last_read_at,a.unread_since),coalesce(r.last_read_message_id,'00000000-0000-0000-0000-000000000000'::uuid))) a
 cross join
 (select count(*)::integer n,(array_agg(m.id order by m.created_at,m.id))[1] first_id
 from public.store_order_conversations c join public.store_order_messages m on m.order_number=c.order_number and m.sender_role='admin'
 where c.order_number=p_source and (c.customer_read_at is null or (m.created_at,m.id)>(c.customer_read_at,c.customer_read_message_id))) b;
$$;
create or replace function public.store_history_sources(p_homes text[],p_admin uuid default null)
returns table(home_key text,source_key text,admin_unread integer,customer_unread integer,first_admin_unread uuid,first_customer_unread uuid)
language sql stable security definer set search_path=pg_catalog,public as $$
 select h.home_key,h.source_key,u.* from public.store_chat_active_history h
 cross join lateral public.store_history_unread(h.source_key,p_admin) u where h.home_key=any(p_homes);
$$;

-- Empty homes derive display activity from actual linked source messages. Nothing is persisted or fabricated.
create or replace view public.store_history_inbox_conversations as
 select (jsonb_populate_record(c,jsonb_build_object('last_message_id',s.last_message_id,'last_message_at',s.last_message_at,
 'last_message_kind',s.last_message_kind,'last_message_preview',s.last_message_preview,'last_sender_role',s.last_sender_role))).*
 from public.store_order_conversations c
 cross join lateral(select sc.* from public.store_chat_active_history h join public.store_order_conversations sc on sc.order_number=h.source_key
 where h.home_key=c.order_number and sc.last_message_id is not null order by sc.last_message_at desc,sc.last_message_id desc limit 1) s
 where c.last_message_id is null;
create index if not exists store_empty_conversations_idx on public.store_order_conversations(order_number) where last_message_id is null;
revoke all on public.store_history_inbox_conversations from public,anon,authenticated;
grant select on public.store_history_inbox_conversations to service_role;

create or replace function public.store_order_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_new_id uuid;
  v_conv public.store_order_conversations;
  v_owner uuid;
  v_preview text := public.store_chat_preview(new.kind, new.body, new.payload);
begin
  insert into public.store_order_conversations (
    order_number, last_message_id, last_message_at, last_message_kind,
    last_message_preview, last_sender_role, payment_details_sent_at
  )
  values (
    new.order_number, new.id, new.created_at, new.kind,
    v_preview, new.sender_role,
    case when new.kind = 'payment' then new.created_at end
  )
  on conflict (order_number) do nothing
  returning id into v_new_id;

  if v_new_id is null then
    update public.store_order_conversations c
       set last_message_id = new.id,
           last_message_at = new.created_at,
           last_message_kind = new.kind,
           last_message_preview = v_preview,
           last_sender_role = new.sender_role,
           updated_at = now()
     where c.order_number = new.order_number
       and (c.last_message_id is null or (c.last_message_at, c.last_message_id) <= (new.created_at, new.id));

    if new.kind = 'payment' then
      update public.store_order_conversations c
         set payment_details_sent_at = coalesce(c.payment_details_sent_at, new.created_at),
             updated_at = now()
       where c.order_number = new.order_number;
    end if;

    -- A customer writing into a Done conversation puts it back to work.
    if new.sender_role = 'customer' then
      with reopened as (
        update public.store_order_conversations c
           set state = 'active',
               done_at = null,
               done_by = null,
               reopened_at = now(),
               reopened_by = new.sender_user_id,
               updated_at = now()
         where c.order_number = new.order_number
           and c.state = 'done'
        returning c.id
      )
      insert into public.store_chat_audit_log (actor_user_id, action, order_number, subject_id, details)
      select new.sender_user_id, 'conversation.reopened', new.order_number, r.id,
             jsonb_build_object('cause', 'customer_message', 'message_id', new.id)
        from reopened r;
    end if;
  end if;

  select * into v_conv
    from public.store_order_conversations
   where order_number = new.order_number;

  perform public.store_chat_send(
    'chat:' || v_conv.id::text,
    'message',
    jsonb_build_object('message_id', new.id, 'created_at', new.created_at)
  );

  perform public.store_chat_send(
    'admin:inbox',
    'message',
    jsonb_build_object(
      'conversation_id', v_conv.id,
      'order_number', new.order_number,
      'is_new_conversation', v_new_id is not null,
      'message', jsonb_build_object(
        'id', new.id,
        'sender_role', new.sender_role,
        'sender_user_id', new.sender_user_id,
        'kind', new.kind,
        'created_at', new.created_at,
        'client_message_id', new.client_message_id
      ),
      'row', jsonb_build_object(
        'last_message_id', v_conv.last_message_id,
        'last_message_at', v_conv.last_message_at,
        'last_message_kind', v_conv.last_message_kind,
        'last_message_preview', v_conv.last_message_preview,
        'last_sender_role', v_conv.last_sender_role,
        'payment_details_sent_at', v_conv.payment_details_sent_at,
        'state', v_conv.state
      )
    )
  );

  -- The customer's own topic: their floating button / My Orders refresh.
  v_owner := public.store_chat_owner(new.order_number);
  if v_owner is not null then
    perform public.store_chat_send(
      'customer:' || v_owner::text,
      'message',
      jsonb_build_object(
        'conversation_id', v_conv.id,
        'order_number', new.order_number,
        'sender_role', new.sender_role,
        'created_at', new.created_at
      )
    );
  end if;

  return null;
end;
$$;
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
  perform pg_advisory_xact_lock(hashtextextended('history-link-operation',0));
  -- Match the insert guard's lock order. Ownership and destination are locked too.
  perform 1 from public.store_chat_threads where key = p_source and kind = 'order' and home_key is null for update;
  if not found then return false; end if;
  if exists (select 1 from public.store_chat_history_links where source_key = p_source) then return true; end if;
  select owner_user_id into v_owner from public.store_order_snapshots where order_number = p_source for update;
  if v_owner is null then return false; end if;
  select key into v_home from public.store_chat_threads where kind = 'inquiry' and owner_user_id = v_owner for update;
  if not found then return false; end if;
  if not coalesce((select historical_chat_compat_ready from public.store_chat_settings where id),false)
     or not exists(select 1 from public.store_history_approvals where source_key=p_source and home_key=v_home and owner_user_id=v_owner and expires_at>now())
  then return false; end if;
  perform 1 from public.store_order_conversations where order_number = v_home for update;
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
  -- Active chats keep 0035's strict unread gate. Done sources retain each
  -- original read cursor and are presented by the compatibility app instead.
  if v_conv.state <> 'done' and exists (
    select 1 from public.admin_users a
    left join public.store_conversation_reads r on r.order_number = p_source and r.admin_user_id = a.user_id
    join public.store_order_messages m on m.order_number = p_source and m.sender_role = 'customer'
    where (m.created_at, m.id) > (coalesce(r.last_read_at, a.unread_since), coalesce(r.last_read_message_id, '00000000-0000-0000-0000-000000000000'::uuid))
  ) then return false; end if;
  -- Active customer unread also blocks; Done customer unread is aggregated by source.
  if v_conv.state <> 'done' and exists (select 1 from public.store_order_messages m where m.order_number = p_source and m.sender_role = 'admin'
    and (v_conv.customer_read_at is null or (m.created_at,m.id) > (v_conv.customer_read_at,v_conv.customer_read_message_id)))
  then return false; end if;
  if not exists(select 1 from auth.users where id=v_owner) then return false; end if;
  if exists(select 1 from public.store_order_messages where order_number=p_source and sender_role='customer' and sender_user_id is not null and sender_user_id is distinct from v_owner) then return false; end if;
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

create or replace function public.store_admin_inbox_compat_page(
  p_admin uuid,
  p_filter text default 'all',
  p_search text default null,
  p_before_at timestamptz default null,
  p_before_order text default null,
  p_limit integer default 30,
  p_order_number text default null,
  p_games uuid[] default null,
  p_include_inquiries boolean default true,
  p_empty boolean default false
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
  v_conversations_table text;
begin
  v_sources := '{}'::text[];
  v_homes := '{}'::text[];
  if coalesce((select historical_chat_enabled from public.store_chat_settings where id),false) then
    select coalesce(array_agg(source_key),'{}'::text[]),coalesce(array_agg(distinct home_key),'{}'::text[])
      into v_sources,v_homes from public.store_chat_active_history;
  end if;
  v_links_table := case when cardinality(v_sources)=0 then 'public.store_chat_threads' else 'public.store_chat_linked_orders' end;
  if p_empty and cardinality(v_sources)=0 then return; end if;
  v_conversations_table := case when p_empty then 'public.store_history_inbox_conversations' else 'public.store_order_conversations' end;
  v_where := case v_filter
    when 'all' then 'true'
    when 'active' then $w$c.state = 'active'$w$
    when 'done' then $w$c.state = 'done'$w$
    when 'unread' then $w$(coalesce(u.n, 0)>0 or (c.order_number=any($11::text[]) and exists(select 1 from public.store_history_sources(array[c.order_number],$1) hu where hu.admin_unread>0))) and (c.state='active' or c.order_number=any($11::text[]))$w$
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

  return query execute format(replace(replace($q$
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
      (coalesce(u.n, 0) + case when c.order_number=any($11::text[]) then coalesce((select sum(hu.admin_unread) from public.store_history_sources(array[c.order_number],$1) hu),0) else 0 end)::integer,
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
    where c.last_message_id is not null and not (c.order_number = any($10::text[]))
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
  $q$, 'public.store_chat_linked_orders', v_links_table), 'public.store_order_conversations', v_conversations_table), v_where)
  using p_admin, v_filter, p_search, p_before_at, p_before_order, p_limit, p_order_number,
        p_games, p_include_inquiries, v_sources, v_homes;
end;
$fn$;

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
language sql stable security definer set search_path=pg_catalog,public as $$
 select * from (
 select * from public.store_admin_inbox_compat_page(p_admin,p_filter,p_search,p_before_at,p_before_order,p_limit,p_order_number,p_games,p_include_inquiries,false)
 union all
 select * from public.store_admin_inbox_compat_page(p_admin,p_filter,p_search,p_before_at,p_before_order,p_limit,p_order_number,p_games,p_include_inquiries,true)
 ) page order by last_message_at desc,order_number desc limit least(greatest(coalesce(p_limit,30),1),100);
$$;
revoke all on function public.store_admin_inbox_compat_page(uuid,text,text,timestamptz,text,integer,text,uuid[],boolean,boolean) from public,anon,authenticated;
grant execute on function public.store_admin_inbox_compat_page(uuid,text,text,timestamptz,text,integer,text,uuid[],boolean,boolean) to service_role;
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
    (coalesce(u.n, 0)+coalesce((select sum(hu.customer_unread) from public.store_history_sources(array[c.order_number]) hu),0))::integer, c.state, c.done_at
  from (select * from public.store_order_conversations where last_message_id is not null union all select * from public.store_history_inbox_conversations) c
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


-- Explicit operator approval captures identities, not name-based matches. Maximum 25 keys.
create or replace function public.store_approve_history_batch(p_sources text[],p_actor uuid,p_batch uuid,p_expires timestamptz)
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare k text; u uuid; h text; n integer:=0;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'not an admin' using errcode='42501'; end if;
 if cardinality(p_sources) not between 1 and 25 or p_sources is null or p_batch is null or p_expires is null or p_expires<=now() or p_expires>now()+interval '7 days' then raise exception 'invalid bounded approval'; end if;
 for k in select distinct unnest(p_sources) order by 1 loop
   select s.owner_user_id,t.key into u,h from public.store_order_snapshots s join auth.users au on au.id=s.owner_user_id
   join public.store_chat_threads t on t.owner_user_id=s.owner_user_id and t.kind='inquiry'
   join public.store_order_conversations c on c.order_number=t.key
   join public.store_chat_threads src on src.key=s.order_number and src.kind='order' and src.home_key is null
   join public.orders o on o.order_number=s.order_number where s.order_number=k;
   if not found then raise exception 'missing verified source or initialized destination: %',k; end if;
   insert into public.store_history_approvals(source_key,home_key,owner_user_id,approved_by,batch_id,expires_at)
   values(k,h,u,p_actor,p_batch,p_expires) on conflict(source_key) do update set home_key=excluded.home_key,owner_user_id=excluded.owner_user_id,
   approved_by=excluded.approved_by,batch_id=excluded.batch_id,expires_at=excluded.expires_at,approved_at=now();
   insert into public.store_history_operations(actor_id,operation,customer_id,source_key,batch_id) values(p_actor,'approve',u,k,p_batch);
   n:=n+1;
 end loop;
 return n;
end $$;
create or replace function public.store_link_history_batch(p_sources text[],p_actor uuid,p_batch uuid)
returns table(source_key text,linked boolean) language plpgsql security definer set search_path=pg_catalog,public as $$
declare k text; result boolean;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'not an admin' using errcode='42501'; end if;
 if p_sources is null or cardinality(p_sources) not between 1 and 25 or p_batch is null then raise exception 'invalid bounded batch'; end if;
 for k in select distinct unnest(p_sources) order by 1 loop
   result:=false;
   if exists(select 1 from public.store_history_approvals a where a.source_key=k and a.batch_id=p_batch and a.expires_at>now()) then
    result:=public.store_link_historical_chat(k,p_actor);
   end if;
   insert into public.store_history_operations(actor_id,operation,source_key,batch_id,details) values(p_actor,'link',k,p_batch,jsonb_build_object('linked',result));
   source_key:=k; linked:=result; return next;
 end loop;
end $$;

-- One bounded metadata request, no message-body loading and no read mutation.
create or replace function public.store_history_review(p_after uuid default null,p_customer uuid default null,p_offset integer default 0)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 with owners as (
 select distinct s.owner_user_id id from public.store_order_snapshots s
 join auth.users au on au.id=s.owner_user_id
 join public.orders o using(order_number)
 join public.store_chat_threads src on src.key=s.order_number and src.kind='order' and src.home_key is null
 join public.store_order_conversations c on c.order_number=s.order_number
 where (p_after is null or s.owner_user_id>p_after) and (p_customer is null or s.owner_user_id=p_customer)
 order by s.owner_user_id limit 20
 ), sources as (
 select x.* from owners o cross join lateral(
 select s.owner_user_id customer_id,coalesce(t.customer_name,s.buyer_name) customer_name,s.order_number,c.assigned_admin_id,c.state,
 (c.state='active' and c.last_customer_message_id is not null and (c.last_admin_reply_id is null or
 (c.last_admin_reply_at,c.last_admin_reply_id)<(c.last_customer_message_at,c.last_customer_message_id))) needs_reply,
 t.key home_key,hc.id home_conversation,hc.assigned_admin_id home_assignee,
 h.source_key linked_source,(select customer_unread from public.store_history_unread(s.order_number)) customer_unread,
 (select jsonb_agg(jsonb_build_object('admin',a.user_id,'name',a.display_name,'unread',u.admin_unread) order by a.user_id)
 from public.admin_users a cross join lateral public.store_history_unread(s.order_number,a.user_id) u) admin_reads,
 exists(select 1 from public.store_order_line_snapshots l where l.order_number=s.order_number) has_lines,
 exists(select 1 from public.store_order_messages m where m.order_number=s.order_number) has_messages,
 exists(select 1 from public.store_order_messages m where m.order_number=s.order_number and m.sender_role='customer' and m.sender_user_id is not null and m.sender_user_id is distinct from s.owner_user_id) ownership_conflict,
 exists(select 1 from public.store_history_approvals a where a.source_key=s.order_number and a.home_key=t.key and a.owner_user_id=s.owner_user_id and a.expires_at>now()) approved
 from public.store_order_snapshots s join public.orders real_order using(order_number)
 join public.store_chat_threads src on src.key=s.order_number and src.kind='order' and src.home_key is null
 join public.store_order_conversations c on c.order_number=s.order_number
 left join public.store_chat_threads t on t.kind='inquiry' and t.owner_user_id=s.owner_user_id
 left join public.store_order_conversations hc on hc.order_number=t.key
 left join public.store_chat_history_links h on h.source_key=s.order_number
 where s.owner_user_id=o.id order by s.order_number limit 50 offset least(greatest(coalesce(p_offset,0),0),100000)
 ) x
 ) select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('eligibility',case
 when linked_source is not null then 'Linked'
 when ownership_conflict then 'Ownership conflict'
 when not has_lines or not has_messages then 'Missing real order history'
 when home_conversation is null then 'Initialize customer conversation'
 when needs_reply then 'Needs Reply — keep separate'
 when state<>'done' and assigned_admin_id is distinct from home_assignee then 'Assignment conflict — keep separate'
 when state<>'done' and (customer_unread>0 or exists(select 1 from jsonb_array_elements(admin_reads) a where (a->>'unread')::int>0)) then 'Active unread — keep separate'
 else 'Eligible after explicit approval' end) order by customer_id,order_number),'[]'::jsonb) from sources s;
$$;

-- Read changes refresh the existing topics; no additional subscriptions or cursor propagation.
create or replace function public.store_history_read_relay()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare h record;
begin
 for h in select a.*,c.id from public.store_chat_active_history a join public.store_order_conversations c on c.order_number=a.home_key where a.source_key=new.order_number loop
 perform public.store_chat_send('admin:inbox','history_read',jsonb_build_object('order_number',h.home_key));
 perform public.store_chat_send('chat:'||h.id::text,'history_read',jsonb_build_object('source_key',h.source_key));
 perform public.store_chat_send('customer:'||h.owner_user_id::text,'message',jsonb_build_object('order_number',h.home_key));
 end loop;
 return new;
end $$;
drop trigger if exists store_history_admin_read_relay on public.store_conversation_reads;
create trigger store_history_admin_read_relay after insert or update on public.store_conversation_reads for each row execute function public.store_history_read_relay();
drop trigger if exists store_history_customer_read_relay on public.store_order_conversations;
create trigger store_history_customer_read_relay after update of customer_read_at,customer_read_message_id on public.store_order_conversations for each row execute function public.store_history_read_relay();

-- SECURITY DEFINER entrypoints are service-only, including helper functions.
revoke all on function public.store_initialize_customer_conversation(uuid,uuid), public.store_history_unread(text,uuid), public.store_history_sources(text[],uuid),
public.store_approve_history_batch(text[],uuid,uuid,timestamptz),public.store_link_history_batch(text[],uuid,uuid),public.store_history_review(uuid,uuid,integer),public.store_history_read_relay() from public,anon,authenticated;
grant execute on function public.store_initialize_customer_conversation(uuid,uuid),public.store_history_unread(text,uuid),public.store_history_sources(text[],uuid),
public.store_approve_history_batch(text[],uuid,uuid,timestamptz),public.store_link_history_batch(text[],uuid,uuid),public.store_history_review(uuid,uuid,integer) to service_role;
create or replace function public.store_set_conversation_state(
  p_order_number text,
  p_actor uuid,
  p_state text,
  p_last_seen_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.store_order_conversations;
  v_seen_at timestamptz;
  v_seen_id uuid;
begin
  if not exists (select 1 from public.admin_users where user_id = p_actor) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if p_state not in ('active', 'done') then
    raise exception 'invalid state' using errcode = '22023';
  end if;

  select * into v_row from public.store_order_conversations
   where order_number = p_order_number
   for update;
  if not found then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;

  if v_row.state = p_state then
    return to_jsonb(v_row) - 'admin_read_at' - 'admin_read_message_id';
  end if;

  if p_state = 'done' then
    if p_last_seen_message_id is null then
      raise exception 'last seen message required' using errcode = '22023';
    end if;
    select m.created_at, m.id into v_seen_at, v_seen_id
      from public.store_order_messages m
     where m.id = p_last_seen_message_id and (m.order_number = p_order_number or exists(select 1 from public.store_chat_active_history h where h.source_key=m.order_number and h.home_key=p_order_number));
    if not found then
      raise exception 'message not in this conversation' using errcode = 'P0002';
    end if;
    if exists (
      select 1 from public.store_order_messages m
       where (m.order_number = p_order_number or exists(select 1 from public.store_chat_active_history h where h.source_key=m.order_number and h.home_key=p_order_number))
         and m.sender_role = 'customer'
         and (m.created_at, m.id) > (v_seen_at, v_seen_id)
    ) then
      raise exception 'NEW_CUSTOMER_MESSAGE' using errcode = 'BW011';
    end if;

    update public.store_order_conversations
       set state = 'done', done_at = now(), done_by = p_actor, updated_at = now()
     where order_number = p_order_number
    returning * into v_row;

    insert into public.store_chat_audit_log (actor_user_id, action, order_number, subject_id, details)
    values (p_actor, 'conversation.done', p_order_number, v_row.id, jsonb_build_object('cause', 'admin'));
  else
    update public.store_order_conversations
       set state = 'active', done_at = null, done_by = null,
           reopened_at = now(), reopened_by = p_actor, updated_at = now()
     where order_number = p_order_number
    returning * into v_row;

    insert into public.store_chat_audit_log (actor_user_id, action, order_number, subject_id, details)
    values (p_actor, 'conversation.reopened', p_order_number, v_row.id, jsonb_build_object('cause', 'admin'));
  end if;

  return to_jsonb(v_row) - 'admin_read_at' - 'admin_read_message_id';
end;
$$;
commit;
