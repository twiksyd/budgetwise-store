-- Tests for 0034: one premium Vouch Request per customer conversation.
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
\set customer '''00000000-0000-0000-0000-0000000000c1'''

\echo '--- premium vouch request (0034)'
truncate realtime.messages;
select store_send_vouch_request('BW-AAAAAA', :robert) as first_result \gset
select pg_temp.ok(
  (:'first_result'::jsonb ->> 'created')::boolean
  and (select kind = 'vouch' and sender_role = 'admin' and sender_user_id = :robert
              and payload is null and attachment_path is null and body not like '%facebook.com%'
         from store_order_messages where id = (:'first_result'::jsonb ->> 'message_id')::uuid),
  'an admin sends a structured vouch card without storing a URL');
select pg_temp.ok(
  (select last_message_kind = 'vouch' and last_message_preview = 'Vouch request'
     from store_order_conversations where order_number = 'BW-AAAAAA'),
  'the inbox gets a concise vouch preview');

select store_send_vouch_request('BW-AAAAAA', :andre) as second_result \gset
select pg_temp.ok(
  not (:'second_result'::jsonb ->> 'created')::boolean
  and :'second_result'::jsonb ->> 'message_id' = :'first_result'::jsonb ->> 'message_id'
  and (select count(*) = 1 from store_order_messages where order_number = 'BW-AAAAAA' and kind = 'vouch'),
  'another admin gets the original card and cannot create a duplicate');
select pg_temp.ok(
  (select count(*) = 1 from realtime.messages where topic = 'admin:inbox' and event = 'message'
       and payload -> 'row' ->> 'last_message_kind' = 'vouch'),
  'only the created card emits an inbox event');

select pg_temp.raises(
  format($q$select store_send_vouch_request('BW-AAAAAA', %L)$q$, :customer),
  '42501', 'a customer cannot send a vouch request');
select pg_temp.raises(
  format($q$insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
    values ('BW-AAAAAA', 'customer', %L, 'vouch', 'fake')$q$, :customer),
  '23514', 'a vouch card must be admin-authored');
select pg_temp.raises(
  format($q$insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
    values ('BW-AAAAAA', 'admin', %L, 'vouch', 'duplicate')$q$, :andre),
  '23505', 'the database unique index is the final duplicate guard');

select '0034 TESTS PASSED' as result;
