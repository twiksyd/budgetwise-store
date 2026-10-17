-- 0021 -> rollback -> 0021 again, on a database that has 0021 data in it.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;

\echo '--- rollback of 0021'
select store_save_quick_reply('00000000-0000-0000-0000-0000000000a1', null, 'was', 'Paid', 'Payment received po!', true);
select store_assign_conversation('BW-BBBBBB', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1');
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
values ('BW-BBBBBB', 'admin', '00000000-0000-0000-0000-0000000000a1', 'text', 'reply after 0021');

\i ../rollback/0021_down.sql

select pg_temp.ok(
  to_regclass('public.store_order_conversations') is null
  and to_regclass('public.store_quick_replies') is null
  and not exists (select 1 from pg_policies where policyname = 'store chat: receive authorised topics'),
  'rollback removed 0021 tables and realtime policy');
select pg_temp.ok(
  (select count(*) from store_order_messages) = (select message_count from test_before) + 1,
  'rollback kept every message, including ones sent after 0021');
select pg_temp.ok(
  (select count(*) from store_admin_chat_inbox(100)) = 2,
  '0020 inbox still works after rollback');

\i ../migrations/0021_store_shared_admin_inbox.sql

select pg_temp.ok(
  (select count(*) from store_order_conversations) = 2
  and (select last_message_preview from store_order_conversations where order_number = 'BW-BBBBBB') = 'reply after 0021',
  're-applying 0021 after a rollback rebuilds the inbox from the messages');
\echo 'ALL ROLLBACK TESTS PASSED'
