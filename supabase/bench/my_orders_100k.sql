-- My Orders at production scale (LOCAL / throwaway database only). Run after
-- active_queue_100k.sql: spreads the 100,000 orders over 20,000 customers,
-- then gives one long-term customer 2 active (1 unread) + 500 completed.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
insert into auth.users (id, email)
select ('00000000-0000-0000-0001-' || lpad(to_hex(g), 12, '0'))::uuid, 'c' || g || '@bench' from generate_series(1, 20000) g;
update store_order_snapshots set owner_user_id = ('00000000-0000-0000-0001-' || lpad(to_hex(1 + right(order_number, 6)::int % 20000), 12, '0'))::uuid;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000c0de', 'longterm@bench');
update store_order_snapshots set owner_user_id = '00000000-0000-0000-0000-00000000c0de'
 where right(order_number, 6)::int between 1 and 502;
update store_order_conversations set state = 'done', done_at = last_message_at + interval '1 hour', done_by = '00000000-0000-0000-0000-0000000000a1'
 where right(order_number, 6)::int between 1 and 500;
update store_order_conversations set state = 'active', done_at = null, done_by = null,
       customer_read_at = case when order_number = 'BW-B000502' then null else last_message_at end,
       customer_read_message_id = case when order_number = 'BW-B000502' then null else last_message_id end
 where right(order_number, 6)::int in (501, 502);
vacuum analyze store_order_snapshots; vacuum analyze store_order_conversations;
load 'auto_explain';
set auto_explain.log_min_duration = 0;
set auto_explain.log_nested_statements = on;
set auto_explain.log_analyze = on;
set auto_explain.log_level = notice;
set client_min_messages = notice;
\echo '--- completed, first page (21 rows)'
select count(*) from store_customer_orders('00000000-0000-0000-0000-00000000c0de', 'completed', null, null, 21);
\echo '--- open section'
select count(*), sum(unread_count) from store_customer_orders('00000000-0000-0000-0000-00000000c0de', 'open');
\echo '--- floating button / messenger list'
select count(*), sum(unread_count) from store_customer_conversations('00000000-0000-0000-0000-00000000c0de');
\echo '--- a typical customer (5 orders)'
select count(*) from store_customer_orders('00000000-0000-0000-0001-000000000abc', 'completed', null, null, 21);
