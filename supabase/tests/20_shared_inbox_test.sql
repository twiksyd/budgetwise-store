-- Behavioural tests for migration 0021 (shared admin inbox).
-- Run with scripts/test-db.sh against a THROWAWAY local Postgres — never
-- against the production project.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FAIL: %', label;
  end if;
  raise notice 'ok - %', label;
end $$;

create or replace function pg_temp.raises(sql text, label text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok - % (%)', label, sqlstate;
    return;
  end;
  raise exception 'FAIL: % (statement succeeded)', label;
end $$;

\set robert '''00000000-0000-0000-0000-0000000000a1'''
\set andre  '''00000000-0000-0000-0000-0000000000a2'''
\set custa  '''00000000-0000-0000-0000-0000000000c1'''
\set custb  '''00000000-0000-0000-0000-0000000000c2'''

-- ---------------------------------------------------------------- backfill
select pg_temp.ok(
  (select count(*) from store_order_conversations) = 2,
  'backfill: one conversation per existing chat');
select pg_temp.ok(
  (select unread_count from store_admin_inbox(:robert, p_order_number => 'BW-BBBBBB')) = 1,
  'backfill: unanswered chat is still unread');
select pg_temp.ok(
  (select unread_count from store_admin_inbox(:robert, p_order_number => 'BW-AAAAAA')) = 0,
  'backfill: handled chat stays read for every admin');

-- ------------------------------------------------------------- inbox order
select pg_temp.ok(
  (select array_agg(order_number) from store_admin_inbox(:robert))
    = array['BW-BBBBBB', 'BW-AAAAAA'],
  'inbox: ordered by latest activity');
select pg_temp.ok(
  (select count(*) from store_admin_inbox('00000000-0000-0000-0000-0000000000c1')) = 0,
  'inbox: a non-admin id gets nothing');

-- ------------------------------------- new customer message moves to top
truncate realtime.messages;
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, client_message_id)
values ('BW-AAAAAA', 'customer', :custa, 'text', 'paid na po',
        '11111111-1111-1111-1111-111111111111');

select pg_temp.ok(
  (select order_number from store_admin_inbox(:robert) limit 1) = 'BW-AAAAAA',
  'new message: conversation moves to the top');
select pg_temp.ok(
  (select last_message_preview from store_order_conversations where order_number = 'BW-AAAAAA') = 'paid na po',
  'new message: preview updated by trigger');
select pg_temp.ok(
  (select unread_count from store_admin_inbox(:robert, p_order_number => 'BW-AAAAAA')) = 1
  and (select unread_count from store_admin_inbox(:andre, p_order_number => 'BW-AAAAAA')) = 1,
  'new message: unread for every admin');

select pg_temp.ok(
  (select count(*) from realtime.messages where topic = 'admin:inbox' and event = 'message') = 1,
  'broadcast: one admin inbox event per message');
select pg_temp.ok(
  (select payload->'conversation'->>'buyer_name' from realtime.messages
    where topic = 'admin:inbox' and event = 'message') = 'Juan Dela Cruz',
  'broadcast: admin event carries the conversation row (no refetch needed)');
select pg_temp.ok(
  (select count(*) from realtime.messages where topic = 'order:BW-AAAAAA' and event = 'message') = 1,
  'broadcast: customer topic gets the message');
select pg_temp.ok(
  (select not (payload->'message' ? 'sender_user_id') from realtime.messages
    where topic = 'order:BW-AAAAAA' and event = 'message'),
  'broadcast: customer payload has no sender_user_id');
select pg_temp.ok(
  (select payload->'message'->>'client_message_id' from realtime.messages
    where topic = 'order:BW-AAAAAA' and event = 'message') = '11111111-1111-1111-1111-111111111111',
  'broadcast: sender can reconcile its optimistic bubble');

-- ------------------------------------------------------------ idempotency
select pg_temp.raises(
  $$insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, client_message_id)
    values ('BW-AAAAAA', 'customer', '00000000-0000-0000-0000-0000000000c1', 'text', 'paid na po',
            '11111111-1111-1111-1111-111111111111')$$,
  'idempotency: a repeated client_message_id cannot create a duplicate');
select pg_temp.ok(
  (select count(*) from store_order_messages where body = 'paid na po') = 1,
  'idempotency: exactly one copy stored');

-- ------------------------------------------------------- per-admin reads
truncate realtime.messages;
select store_mark_admin_read('BW-AAAAAA', :robert, now());
select pg_temp.ok(
  (select unread_count from store_admin_inbox(:robert, p_order_number => 'BW-AAAAAA')) = 0,
  'reads: Robert reading clears Robert''s badge');
select pg_temp.ok(
  (select unread_count from store_admin_inbox(:andre, p_order_number => 'BW-AAAAAA')) = 1,
  'reads: Andre still has his own unread badge');
select pg_temp.ok(
  (select count(*) from realtime.messages where topic = 'order:BW-AAAAAA' and event = 'seen') = 1,
  'reads: customer is told the message was seen');
select pg_temp.raises(
  $$select store_mark_admin_read('BW-AAAAAA', '00000000-0000-0000-0000-0000000000c1', now())$$,
  'reads: a customer id cannot write admin read state');

-- cursor never moves backwards
select store_mark_admin_read('BW-AAAAAA', :robert, now() - interval '1 day');
select pg_temp.ok(
  (select last_read_at > now() - interval '1 minute' from store_conversation_reads
    where admin_user_id = :robert and order_number = 'BW-AAAAAA'),
  'reads: an older cursor does not un-read messages');

-- ------------------------------------------------------------ assignment
truncate realtime.messages;
select pg_temp.raises(
  $$select store_assign_conversation('BW-BBBBBB', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2')$$,
  'assign: a non-admin actor is rejected');
select pg_temp.raises(
  $$select store_assign_conversation('BW-BBBBBB', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1')$$,
  'assign: assigning to a non-admin is rejected');
select store_assign_conversation('BW-BBBBBB', :robert, :andre);
select pg_temp.ok(
  (select assigned_admin_id = :robert and assigned_by = :andre
     from store_order_conversations where order_number = 'BW-BBBBBB'),
  'assign: Andre assigned the chat to Robert');
select pg_temp.ok(
  (select count(*) from store_chat_audit_log
    where action = 'conversation.assigned' and order_number = 'BW-BBBBBB'
      and actor_user_id = :andre) = 1,
  'assign: audit row records who did it');
select pg_temp.ok(
  (select payload->'conversation'->>'assigned_admin_id' from realtime.messages
    where topic = 'admin:inbox' and event = 'conversation') = '00000000-0000-0000-0000-0000000000a1',
  'assign: change is broadcast to every admin');
select pg_temp.ok(
  (select count(*) from realtime.messages where topic like 'order:%') = 0,
  'assign: customers are not told about internal assignment');

-- ---------------------------------------------------------------- filters
select pg_temp.ok(
  (select array_agg(order_number) from store_admin_inbox(:robert, 'mine')) = array['BW-BBBBBB'],
  'filter: assigned to me');
select pg_temp.ok(
  (select array_agg(order_number) from store_admin_inbox(:robert, 'unassigned')) = array['BW-AAAAAA'],
  'filter: unassigned');
select pg_temp.ok(
  (select array_agg(order_number) from store_admin_inbox(:robert, 'under_review')) = array['BW-AAAAAA'],
  'filter: under review = XOB status pending');
select pg_temp.ok(
  (select array_agg(order_number) from store_admin_inbox(:andre, 'unread')) = array['BW-AAAAAA', 'BW-BBBBBB'],
  'filter: unread is per admin (Andre)');
select pg_temp.ok(
  (select array_agg(order_number) from store_admin_inbox(:robert, 'unread')) = array['BW-BBBBBB'],
  'filter: unread is per admin (Robert)');
select pg_temp.ok(
  (select array_agg(order_number) from store_admin_inbox(:robert, p_search => 'juan123')) = array['BW-AAAAAA'],
  'search: Roblox username, case-insensitive');
select pg_temp.ok(
  (select array_agg(order_number) from store_admin_inbox(:robert, p_search => 'maria')) = array['BW-BBBBBB'],
  'search: customer name');
select pg_temp.ok(
  (select array_agg(order_number) from store_admin_inbox(:robert, p_search => 'bw-bbb')) = array['BW-BBBBBB'],
  'search: order number');
select pg_temp.ok(
  (select array_agg(order_number) from store_admin_inbox(
     :robert,
     p_before_at => (select last_message_at from store_order_conversations where order_number = 'BW-AAAAAA'),
     p_before_order => 'BW-AAAAAA')) = array['BW-BBBBBB'],
  'pagination: keyset cursor returns the next page');

-- ------------------------------------------------------- payment messages
select pg_temp.raises(
  $$insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, payload)
    values ('BW-AAAAAA', 'customer', '00000000-0000-0000-0000-0000000000c1', 'payment', '', '{"amount":1}')$$,
  'payment: a customer cannot post payment details');
select pg_temp.raises(
  $$insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, payload)
    values ('BW-AAAAAA', 'admin', '00000000-0000-0000-0000-0000000000a1', 'text', 'hi', '{"amount":1}')$$,
  'payment: payload only allowed on payment messages');
truncate realtime.messages;
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, payload)
values ('BW-AAAAAA', 'admin', :robert, 'payment', 'GCash payment details',
        '{"amount": 250, "account_name": "A L M", "account_number": "09171234567", "qr_path": "qr/abc.png", "has_qr": true}');
select pg_temp.ok(
  (select payment_details_sent_at is not null from store_order_conversations where order_number = 'BW-AAAAAA'),
  'payment: structured payment state recorded');
select pg_temp.ok(
  (select not (payload->'message'->'payload' ? 'qr_path') from realtime.messages
    where topic = 'order:BW-AAAAAA' and event = 'message'),
  'payment: storage path never broadcast to the customer');

-- ---------------------------------------------- quick replies + payments
select pg_temp.raises(
  $$insert into store_quick_replies (shortcut, title, body) values ('Was!', 't', 'b')$$,
  'quick replies: shortcut format enforced');
insert into store_quick_replies (shortcut, title, body) values ('was', 'Payment received', 'Payment received po!');
select pg_temp.raises(
  $$insert into store_quick_replies (shortcut, title, body) values ('was', 'dup', 'dup')$$,
  'quick replies: shortcut is unique');
select pg_temp.raises(
  $$insert into store_payment_methods (account_name, account_number) values ('A L M', '+63 917 123')$$,
  'payment methods: number must be 09XXXXXXXXX');

-- ------------------------------------------------- browser access (RLS)
-- Make sure every topic under test actually has events in it, so a "sees
-- nothing" result means "denied", not "empty".
select store_chat_send('order:BW-BBBBBB', 'message', '{"probe": true}');
select pg_temp.ok(
  (select count(*) from realtime.messages where topic = 'order:BW-BBBBBB') > 0
  and (select count(*) from realtime.messages where topic = 'order:BW-AAAAAA') > 0
  and (select count(*) from realtime.messages where topic = 'admin:inbox') > 0,
  'realtime: every topic under test has events');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select pg_temp.raises('select * from store_order_conversations', 'rls: customers cannot read conversations');
select pg_temp.raises('select * from store_conversation_reads', 'rls: customers cannot read read-state');
select pg_temp.raises('select * from store_quick_replies', 'rls: customers cannot read quick replies');
select pg_temp.raises('insert into store_quick_replies (shortcut, title, body) values (''x'', ''x'', ''x'')', 'rls: customers cannot create quick replies');
select pg_temp.raises('select * from store_payment_methods', 'rls: customers cannot read payment accounts');
select pg_temp.raises('select * from store_chat_audit_log', 'rls: customers cannot read the audit log');
select pg_temp.raises($$select store_assign_conversation('BW-AAAAAA', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1')$$, 'rls: customers cannot call assignment');
select pg_temp.raises($$select * from store_admin_inbox('00000000-0000-0000-0000-0000000000a1')$$, 'rls: customers cannot call the inbox RPC');
select pg_temp.raises($$select store_mark_admin_read('BW-AAAAAA', '00000000-0000-0000-0000-0000000000a1', now())$$, 'rls: customers cannot forge admin reads');
select pg_temp.raises($$insert into store_order_messages (order_number, sender_role, kind, body) values ('BW-AAAAAA', 'admin', 'text', 'fake')$$, 'rls: customers cannot insert messages directly');

-- Realtime authorization: Supabase evaluates these policies with the
-- channel topic set, exactly as simulated here.
select set_config('realtime.topic', 'order:BW-AAAAAA', false);
select pg_temp.ok((select count(*) from realtime.messages) > 0, 'realtime: customer A receives own order topic');
select set_config('realtime.topic', 'order:BW-BBBBBB', false);
select pg_temp.ok((select count(*) from realtime.messages) = 0, 'realtime: customer A cannot join customer B''s order topic');
select set_config('realtime.topic', 'admin:inbox', false);
select pg_temp.ok((select count(*) from realtime.messages) = 0, 'realtime: customer cannot read the admin inbox channel');
select pg_temp.raises($$insert into realtime.messages (topic, extension, event, payload) values ('admin:inbox', 'presence', 'x', '{}')$$, 'realtime: customer cannot fake admin presence');
select set_config('realtime.topic', 'order:BW-AAAAAA', false);
select pg_temp.raises($$insert into realtime.messages (topic, extension, event, payload) values ('order:BW-AAAAAA', 'broadcast', 'message', '{}')$$, 'realtime: customer cannot inject events into an order channel');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
select set_config('realtime.topic', 'admin:inbox', false);
select pg_temp.ok((select count(*) from realtime.messages) > 0, 'realtime: admin receives the inbox channel');
insert into realtime.messages (topic, extension, event, payload) values ('admin:inbox', 'presence', 'sync', '{}');
select pg_temp.ok(true, 'realtime: admin can publish presence/typing');
select set_config('realtime.topic', 'order:BW-BBBBBB', false);
select pg_temp.ok((select count(*) from realtime.messages) > 0, 'realtime: admin can follow any order topic');
select pg_temp.raises($$insert into realtime.messages (topic, extension, event, payload) values ('order:BW-BBBBBB', 'broadcast', 'message', '{}')$$, 'realtime: even admins cannot hand-craft order events');

select set_config('request.jwt.claim.sub', '', false);
set role anon;
select set_config('realtime.topic', 'order:BW-AAAAAA', false);
select pg_temp.raises('select count(*) from realtime.messages', 'realtime: anonymous visitors get nothing');
reset role;

-- ------------------------------------------------- backwards compatibility
select pg_temp.ok(
  (select count(*) from store_admin_chat_inbox(100)) = 2,
  'compat: the currently deployed inbox RPC still works');
update store_order_messages set read_at = now() where order_number = 'BW-BBBBBB' and read_at is null;
select pg_temp.ok(true, 'compat: the currently deployed markChatRead update still works');
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
values ('BW-BBBBBB', 'admin', :andre, 'text', 'reply from old admin page');
select pg_temp.ok(
  (select last_message_preview from store_order_conversations where order_number = 'BW-BBBBBB') = 'reply from old admin page',
  'compat: messages from the currently deployed code keep the inbox in sync');

\echo ALL DATABASE TESTS PASSED
