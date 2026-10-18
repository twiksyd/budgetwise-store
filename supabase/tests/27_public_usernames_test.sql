-- Tests for 0025 (customer-facing admin names + 'assistant' ping).
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

\set robert '''00000000-0000-0000-0000-0000000000a1'''
\set andre  '''00000000-0000-0000-0000-0000000000a2'''

\echo '--- public usernames (0025)'
update admin_users set public_username = 'Zuno' where user_id = :robert;
update admin_users set public_username = 'Twicks' where user_id = :andre;
select pg_temp.ok((select public_username from admin_users where user_id = :robert) = 'Zuno', 'a public username can be set');
select pg_temp.raises($q$update admin_users set public_username = 'zuno' where user_id = '00000000-0000-0000-0000-0000000000a2'$q$,
  '23505', 'two admins can never share a public name (case-insensitive)');
select pg_temp.raises($q$update admin_users set public_username = ' Zed' where user_id = '00000000-0000-0000-0000-0000000000a2'$q$,
  '23514', 'no surrounding spaces');
select pg_temp.raises($q$update admin_users set public_username = 'Zed<script>' where user_id = '00000000-0000-0000-0000-0000000000a2'$q$,
  '23514', 'letters, digits, space . _ - only');
select pg_temp.raises($q$update admin_users set public_username = repeat('a', 25) where user_id = '00000000-0000-0000-0000-0000000000a2'$q$,
  '23514', 'at most 24 characters');

\echo '--- the customer chat hears about assignment changes, without ids (0025)'
select store_assign_conversation('BW-AAAAAA', null, :robert);
truncate realtime.messages;
select store_assign_conversation('BW-AAAAAA', :andre, :robert);
select pg_temp.ok(
  (select count(*) from realtime.messages m
     join store_order_conversations c on m.topic = 'chat:' || c.id
    where c.order_number = 'BW-AAAAAA' and m.event = 'assistant' and m.payload = '{}'::jsonb) = 1,
  'assigning sends one empty ''assistant'' ping on the conversation''s own topic');
select pg_temp.ok(
  (select count(*) from realtime.messages where event = 'assistant' and payload::text ~ '[0-9a-f]{8}-') = 0,
  '... carrying no admin ids');
truncate realtime.messages;
select store_assign_conversation('BW-AAAAAA', :andre, :robert);
select pg_temp.ok((select count(*) from realtime.messages where event = 'assistant') = 0,
  'assigning to the same admin again sends nothing');
update store_order_conversations set admin_read_at = admin_read_at where order_number = 'BW-AAAAAA';
select pg_temp.ok((select count(*) from realtime.messages where event = 'assistant') = 0,
  'other conversation updates send no assistant ping');
select store_assign_conversation('BW-AAAAAA', null, :robert);
select pg_temp.ok((select count(*) from realtime.messages where event = 'assistant') = 1, 'unassigning pings too');

\echo 'ALL 0025 DATABASE TESTS PASSED'
