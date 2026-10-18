-- After the 0026 rollback: back to order-only chats, nothing lost.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;

\echo '--- 0026 rollback'
select pg_temp.ok(to_regclass('public.store_chat_threads') is null, 'threads table removed');
select pg_temp.ok(
  (select count(*) from pg_constraint where contype = 'f'
     and confrelid = 'public.store_order_snapshots'::regclass
     and conrelid in ('public.store_order_messages'::regclass, 'public.store_order_conversations'::regclass)) = 2,
  'messages and conversations reference orders again');
select pg_temp.ok(to_regproc('public.store_chat_owner') is null and to_regproc('public.store_open_inquiry') is null,
  'helper functions removed');
select pg_temp.ok(
  (store_post_message('BW-AAAAAA', 'customer', '00000000-0000-0000-0000-0000000000c1', 'text', 'after rollback', null, null, gen_random_uuid()) ->> 'created')::boolean,
  'order chats keep working after the rollback');
select pg_temp.ok(
  exists (select 1 from store_customer_conversations('00000000-0000-0000-0000-0000000000c1') where order_number = 'BW-AAAAAA'),
  'customer conversations use the restored definition');
\echo 'ALL 0026 ROLLBACK TESTS PASSED'
