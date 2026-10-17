-- Tests for 0023 (removing the 0020 access path after the new code ships).
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;
create or replace function pg_temp.raises(sql text, expected_state text, label text) returns void
language plpgsql as $$ begin
  begin execute sql;
  exception when others then
    if expected_state is not null and sqlstate <> expected_state then
      raise exception 'FAIL: % (expected %, got % %)', label, expected_state, sqlstate, sqlerrm; end if;
    raise notice 'ok - % (%)', label, sqlstate; return; end;
  raise exception 'FAIL: % (statement succeeded)', label; end $$;

\echo '--- after cleanup migration 0023'
select pg_temp.ok(
  not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'store_order_messages'),
  'raw message rows are no longer streamed (postgres_changes path removed)');
select pg_temp.ok(
  not exists (select 1 from pg_trigger where tgname = 'store_order_messages_legacy_read_sync'),
  'transition-only read sync removed');
select 'chat:' || id as topic_a from store_order_conversations where order_number = 'BW-AAAAAA' \gset
select store_chat_send(:'topic_a', 'message', '{"probe": 2}');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select pg_temp.raises($$select * from store_order_messages$$, '42501', 'customers can no longer read message rows directly (incl. admin ids, paths)');
select pg_temp.raises($$select order_number from store_order_snapshots$$, '42501', 'customers can no longer read snapshot headers directly');
select set_config('realtime.topic', :'topic_a', false);
select pg_temp.ok((select count(*) from realtime.messages where topic = :'topic_a') > 0,
  'customer realtime still authorised after cleanup (topic check needs no table grants)');
reset role;
select pg_temp.ok((select count(*) from store_admin_inbox('00000000-0000-0000-0000-0000000000a1')) >= 3,
  'new inbox function unaffected by cleanup');
\echo 'ALL 0023 DATABASE TESTS PASSED'
