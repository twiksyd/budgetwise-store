-- 0024 rollback: refuses while albums exist; otherwise restores 0021 shapes.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;

\echo '--- 0024 rollback'
select pg_temp.ok(
  (select count(*) from information_schema.columns where table_name = 'store_order_conversations' and column_name = 'state') = 0
  and to_regclass('public.store_order_message_attachments') is null
  and to_regprocedure('public.store_set_conversation_state(text,uuid,text,uuid)') is null
  and to_regprocedure('public.store_customer_orders(uuid,text,timestamptz,text,integer)') is null,
  'workflow columns, attachments table and new functions are gone');
select pg_temp.ok(
  (select count(*) from store_admin_inbox('00000000-0000-0000-0000-0000000000a1')) > 0
  and (select count(*) from store_customer_conversations('00000000-0000-0000-0000-0000000000c1')) > 0,
  '0021 inbox and customer functions work again');
truncate realtime.messages;
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
values ('BW-AAAAAA', 'customer', '00000000-0000-0000-0000-0000000000c1', 'text', 'after rollback');
select pg_temp.ok(
  (select count(*) from realtime.messages where topic like 'customer:%') = 0
  and (select count(*) from realtime.messages where topic = 'admin:inbox' and event = 'message') = 1,
  'message trigger is the 0021 one again (no customer topic)');
select pg_temp.ok(
  (select pg_get_constraintdef(oid) not like '%album%' from pg_constraint where conname = 'store_order_messages_kind_valid'),
  'message kinds back to 0021');
\echo 'ALL 0024 ROLLBACK TESTS PASSED'
