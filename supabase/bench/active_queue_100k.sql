-- Active admin inbox at production scale (LOCAL / throwaway database only).
-- 100,000 conversations (99,500 Done history + 500 Active), 1,000,000
-- messages, 3 admins with read positions, XOB orders. Prints the query plan
-- of store_admin_inbox's body for the Active queue and times the function.
--   createdb bw_bench; apply stub, 0019, 0020, 0021, 0022, 0024; psql -f this
\set ON_ERROR_STOP 1
\timing off
set client_min_messages = warning;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'robert@bench'), ('00000000-0000-0000-0000-0000000000a2', 'andre@bench'),
  ('00000000-0000-0000-0000-0000000000a3', 'kenneth@bench'), ('00000000-0000-0000-0000-0000000000c1', 'cust@bench')
  on conflict do nothing;
insert into admin_users (user_id, display_name, unread_since) values
  ('00000000-0000-0000-0000-0000000000a1', 'Robert', '-infinity'), ('00000000-0000-0000-0000-0000000000a2', 'Andre', '-infinity'),
  ('00000000-0000-0000-0000-0000000000a3', 'Kenneth', '-infinity') on conflict do nothing;

alter table store_order_messages disable trigger user;
insert into store_order_snapshots (order_number, idempotency_key, request_fingerprint, view_token_hash,
  buyer_name, buyer_roblox_username, total_amount, owner_user_id, created_at)
select 'BW-B' || lpad(g::text, 6, '0'), 'idem-bench-' || lpad(g::text, 15, '0'), repeat('f', 64), repeat('f', 64),
  'Buyer ' || g, 'rbx' || g, 100 + g % 900, '00000000-0000-0000-0000-0000000000c1', now() - (100000 - g) * interval '5 minutes'
  from generate_series(1, 100000) g;
insert into orders (order_number, buyer_name, buyer_roblox_username, status)
select 'BW-B' || lpad(g::text, 6, '0'), 'Buyer ' || g, 'rbx' || g, case when g % 7 = 0 then 'pending' else 'completed' end
  from generate_series(1, 100000) g;
create index if not exists bench_orders_order_number_idx on orders (order_number);  -- production XOB has one
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, created_at)
select 'BW-B' || lpad(g::text, 6, '0'),
       case when m % 2 = 0 then 'customer' else 'admin' end,
       case when m % 2 = 0 then '00000000-0000-0000-0000-0000000000c1'::uuid else '00000000-0000-0000-0000-0000000000a1'::uuid end,
       case when m = 0 then 'slip' else 'text' end, 'message ' || m,
       now() - (100000 - g) * interval '5 minutes' + m * interval '10 seconds'
  from generate_series(1, 100000) g, generate_series(0, 9) m;
alter table store_order_messages enable trigger user;
insert into store_order_conversations (order_number, last_message_id, last_message_at, last_message_kind,
  last_message_preview, last_sender_role, state, done_at, done_by)
select distinct on (m.order_number) m.order_number, m.id, m.created_at, m.kind, m.body, m.sender_role,
       case when right(m.order_number, 6)::int > 99500 then 'active' else 'done' end,
       case when right(m.order_number, 6)::int > 99500 then null else m.created_at + interval '1 hour' end,
       case when right(m.order_number, 6)::int > 99500 then null else '00000000-0000-0000-0000-0000000000a1'::uuid end
  from store_order_messages m
 order by m.order_number, m.created_at desc, m.id desc;
-- Robert has read everything but the newest 100 active chats.
insert into store_conversation_reads (order_number, admin_user_id, last_read_at, last_read_message_id)
select c.order_number, '00000000-0000-0000-0000-0000000000a1', c.last_message_at, c.last_message_id
  from store_order_conversations c where right(c.order_number, 6)::int <= 99900;
vacuum analyze store_order_snapshots; vacuum analyze store_order_conversations; vacuum analyze store_order_messages;
vacuum analyze store_conversation_reads; vacuum analyze orders;

select count(*) filter (where state = 'done') as done, count(*) filter (where state = 'active') as active,
       (select count(*) from store_order_messages) as messages
  from store_order_conversations;

\echo '=== Active queue: plan of store_admin_inbox body (p_filter = active, first page of 31)'
explain (analyze, buffers, costs off, timing on)
  select
    c.id, c.order_number, s.buyer_name, s.buyer_roblox_username,
    s.total_amount, s.created_at, st.status,
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
  join public.store_order_snapshots s on s.order_number = c.order_number
  left join public.store_conversation_reads r
    on r.order_number = c.order_number and r.admin_user_id = me.user_id
  left join lateral (
    select o.status from public.orders o where o.order_number = c.order_number limit 1
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
  where me.user_id = '00000000-0000-0000-0000-0000000000a1'
    and (c.state = 'active')
  order by c.last_message_at desc, c.order_number desc
  limit 31;

\echo '=== Function timings (20 calls each, ms)'
create temp table timings (label text, ms numeric);
do $$
declare t0 timestamptz; i int; filters text[] := array['active', 'unread', 'mine', 'unassigned', 'done', 'all'];
        f text;
begin
  perform * from store_admin_inbox('00000000-0000-0000-0000-0000000000a1', 'active');  -- warm
  foreach f in array filters loop
    for i in 1..20 loop
      t0 := clock_timestamp();
      perform * from store_admin_inbox('00000000-0000-0000-0000-0000000000a1', f, null, null, null, 31);
      insert into timings values (f, extract(epoch from clock_timestamp() - t0) * 1000);
    end loop;
  end loop;
  -- second page of Active (keyset)
  for i in 1..20 loop
    t0 := clock_timestamp();
    perform * from store_admin_inbox('00000000-0000-0000-0000-0000000000a1', 'active', null,
      (select last_message_at from store_order_conversations where state = 'active' order by last_message_at desc, order_number desc offset 30 limit 1),
      (select order_number from store_order_conversations where state = 'active' order by last_message_at desc, order_number desc offset 30 limit 1), 31);
    insert into timings values ('active page 2', extract(epoch from clock_timestamp() - t0) * 1000);
  end loop;
end $$;
select label, round(percentile_cont(0.5) within group (order by ms)::numeric, 2) as median_ms,
       round(max(ms), 2) as max_ms
  from timings group by label order by label;

\echo '=== Hard case: only 30 Active, scattered across 100,000 (old ones too), 5 assigned to Robert, 99,970 Done'
update store_order_conversations set state = 'done', done_at = last_message_at + interval '1 hour', done_by = '00000000-0000-0000-0000-0000000000a1'
 where state = 'active';
update store_order_conversations set state = 'active', done_at = null, done_by = null,
       assigned_admin_id = case when right(order_number, 6)::int % 19998 = 0 then '00000000-0000-0000-0000-0000000000a1'::uuid end
 where right(order_number, 6)::int % 3333 = 0;
delete from store_conversation_reads where order_number in (select order_number from store_order_conversations where state = 'active' and right(order_number, 6)::int % 2 = 0);
analyze store_order_conversations; analyze store_conversation_reads;
select count(*) filter (where state = 'active') as active, count(*) filter (where state = 'active' and assigned_admin_id is not null) as assigned,
       min(last_message_at) filter (where state = 'active') as oldest_active
  from store_order_conversations;
load 'auto_explain';
set auto_explain.log_min_duration = 0;
set auto_explain.log_nested_statements = on;
set auto_explain.log_analyze = on;
set auto_explain.log_buffers = on;
set auto_explain.log_level = notice;
set client_min_messages = notice;
\echo '--- plan actually used inside store_admin_inbox(active)'
select count(*) from store_admin_inbox('00000000-0000-0000-0000-0000000000a1', 'active', null, null, null, 31);
set auto_explain.log_min_duration = -1;
set client_min_messages = warning;
truncate timings;
do $$
declare t0 timestamptz; i int; f text;
begin
  foreach f in array array['active', 'unread', 'mine', 'unassigned', 'done', 'all'] loop
    for i in 1..20 loop
      t0 := clock_timestamp();
      perform * from store_admin_inbox('00000000-0000-0000-0000-0000000000a1', f, null, null, null, 31);
      insert into timings values (f, extract(epoch from clock_timestamp() - t0) * 1000);
    end loop;
  end loop;
end $$;
select label, round(percentile_cont(0.5) within group (order by ms)::numeric, 2) as median_ms,
       round(max(ms), 2) as max_ms,
       (select count(*) from store_admin_inbox('00000000-0000-0000-0000-0000000000a1', label, null, null, null, 31)) as rows
  from timings group by label order by label;
