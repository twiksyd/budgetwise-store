-- Behavioural tests for 0021 (shared admin inbox). Runs against a THROWAWAY
-- local Postgres via scripts/test-db.sh — never against production.
-- Every check is an exact assertion; "denied" checks first prove the data
-- they would have seen actually exists.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;

create or replace function pg_temp.raises(sql text, expected_state text, label text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if expected_state is not null and sqlstate <> expected_state then
      raise exception 'FAIL: % (expected %, got % %)', label, expected_state, sqlstate, sqlerrm;
    end if;
    raise notice 'ok - % (%)', label, sqlstate;
    return;
  end;
  raise exception 'FAIL: % (statement succeeded)', label;
end $$;

\set robert  '''00000000-0000-0000-0000-0000000000a1'''
\set andre   '''00000000-0000-0000-0000-0000000000a2'''
\set kenneth '''00000000-0000-0000-0000-0000000000a3'''
\set custa   '''00000000-0000-0000-0000-0000000000c1'''
\set custb   '''00000000-0000-0000-0000-0000000000c2'''

-- ============================================================ 1. Backfill
\echo '--- backfill and safety for existing data'
select pg_temp.ok(
  (select message_count from test_before) = (select count(*) from store_order_messages)
  and (select message_hash from test_before) = (
    select md5(string_agg(concat_ws('|', id, order_number, sender_role, sender_user_id,
                                     kind, body, attachment_path, created_at, read_at), ','
                          order by id)) from store_order_messages),
  'existing messages unchanged: same rows, bodies, senders, timestamps, read_at (after running 0021 twice)');
select pg_temp.ok(
  (select snapshot_hash from test_before) = (
    select md5(string_agg(concat_ws('|', order_number, buyer_name, buyer_roblox_username,
                                     total_amount, owner_user_id, created_at), ','
                          order by order_number)) from store_order_snapshots),
  'existing orders/snapshots unchanged');
select pg_temp.ok(
  (select count(*) from store_order_conversations) = 2
  and (select count(distinct order_number) from store_order_conversations) = 2,
  'exactly one conversation per existing chat, no duplicates after a second run');
select pg_temp.ok(
  not exists (select 1 from store_order_conversations where order_number = 'BW-NOCHAT'),
  'an old order with no owner and no chat gets no conversation row');
select pg_temp.ok(
  (select count(*) from store_conversation_reads) = 2,
  'read cursors backfilled once per admin for the handled chat, not duplicated');
select pg_temp.ok(
  (select bool_and(unread_since = '-infinity') from admin_users),
  'existing admins keep the full history in their unread calculation');
select pg_temp.ok(
  (select unread_count from store_admin_inbox(:robert, p_order_number => 'BW-AAAAAA')) = 0
  and (select unread_count from store_admin_inbox(:andre, p_order_number => 'BW-AAAAAA')) = 0,
  'handled chat stays read for every admin');
select pg_temp.ok(
  (select unread_count from store_admin_inbox(:robert, p_order_number => 'BW-BBBBBB')) = 1
  and (select unread_count from store_admin_inbox(:andre, p_order_number => 'BW-BBBBBB')) = 1,
  'unanswered chat stays unread for every admin');
select pg_temp.ok(
  (select customer_read_message_id is not null from store_order_conversations where order_number = 'BW-AAAAAA')
  and (select customer_read_message_id is null from store_order_conversations where order_number = 'BW-BBBBBB'),
  'customer-side seen state carried over');

-- ============================================================ 2. Inbox
\echo '--- inbox ordering and new activity'
select pg_temp.ok(
  (select array_agg(order_number) from store_admin_inbox(:robert)) = array['BW-BBBBBB', 'BW-AAAAAA'],
  'inbox ordered by latest activity');
select pg_temp.ok(
  (select count(*) from store_admin_inbox(:custa)) = 0,
  'inbox returns nothing for a non-admin id');

truncate realtime.messages;
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, client_message_id)
values ('BW-AAAAAA', 'customer', :custa, 'text', 'paid na po', '11111111-1111-1111-1111-111111111111');

select pg_temp.ok(
  (select order_number from store_admin_inbox(:robert) limit 1) = 'BW-AAAAAA',
  'a new customer message moves the conversation to the top');
select pg_temp.ok(
  (select unread_count from store_admin_inbox(:robert, p_order_number => 'BW-AAAAAA')) = 1
  and (select unread_count from store_admin_inbox(:andre, p_order_number => 'BW-AAAAAA')) = 1,
  'new customer message is unread for every admin');

-- ============================================================ 3. Realtime payloads
\echo '--- realtime payloads'
select pg_temp.ok(
  (select count(*) from realtime.messages where topic = 'admin:inbox' and event = 'message') = 1,
  'one admin inbox event per message');
select pg_temp.ok(
  (select count(*) from realtime.messages
    where topic = (select 'chat:' || id from store_order_conversations where order_number = 'BW-AAAAAA')
      and event = 'message') = 1,
  'one ping on the customer''s own chat topic');
select pg_temp.ok(
  (select array_agg(k order by k) from realtime.messages, jsonb_object_keys(payload) k
    where topic like 'chat:%' and event = 'message') = array['created_at', 'message_id'],
  'customer payload is exactly {message_id, created_at}: no body, no sender id, no paths');
select pg_temp.ok(
  (select count(*) from realtime.messages
    where topic like 'chat:%'
      and (payload::text like '%sender_user_id%' or payload::text like '%attachment%'
           or payload::text like '%00000000-0000-0000-0000-0000000000c1%')) = 0,
  'customer payload carries no user ids or attachment paths');
select pg_temp.ok(
  (select payload->'message' ? 'body' from realtime.messages
    where topic = 'admin:inbox' and event = 'message') = false
  and (select payload->'row'->>'last_message_preview' from realtime.messages
    where topic = 'admin:inbox' and event = 'message') = 'paid na po',
  'admin event is compact: list-row preview only, no full body');
select pg_temp.ok(
  (select payload ? 'buyer_name' or payload->'row' ? 'buyer_name' from realtime.messages
    where topic = 'admin:inbox' and event = 'message') = false,
  'admin event does not carry order/customer records');
select pg_temp.ok(
  (select payload->>'is_new_conversation' from realtime.messages
    where topic = 'admin:inbox' and event = 'message') = 'false',
  'existing conversation is flagged as not new (patch, do not fetch)');

-- brand-new order chat
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c3', 'custc@gmail.test');
insert into store_order_snapshots (order_number, idempotency_key, request_fingerprint, view_token_hash,
  buyer_name, buyer_roblox_username, total_amount, owner_user_id)
values ('BW-CCCCCC', 'idem-key-cccccccccccccccc', repeat('c',64), repeat('c',64),
  'Kenji Cruz', 'kenjiRBX', 279, '00000000-0000-0000-0000-0000000000c3');
truncate realtime.messages;
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, created_at)
values ('BW-CCCCCC', 'customer', '00000000-0000-0000-0000-0000000000c3', 'slip', 'ORDER SLIP C', now() + interval '1 min');
select pg_temp.ok(
  (select payload->>'is_new_conversation' from realtime.messages
    where topic = 'admin:inbox' and event = 'message') = 'true',
  'a brand-new chat is flagged so inboxes fetch just that one row');
select pg_temp.ok(
  (select order_number from store_admin_inbox(:robert) limit 1) = 'BW-CCCCCC',
  'a brand-new chat appears at the top of the inbox');

-- ============================================================ 4. Idempotency
\echo '--- idempotent sending'
select pg_temp.raises(
  $$insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, client_message_id)
    values ('BW-AAAAAA', 'customer', '00000000-0000-0000-0000-0000000000c1', 'text', 'paid na po',
            '11111111-1111-1111-1111-111111111111')$$, '23505',
  'same sender + same client_message_id is rejected');
select pg_temp.ok(
  (select count(*) from store_order_messages where client_message_id = '11111111-1111-1111-1111-111111111111') = 1,
  'exactly one copy stored');
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, client_message_id)
values ('BW-AAAAAA', 'admin', :robert, 'text', 'ok po', '11111111-1111-1111-1111-111111111111');
select pg_temp.ok(
  (select count(*) from store_order_messages where client_message_id = '11111111-1111-1111-1111-111111111111') = 2,
  'a different sender reusing the same client id is unaffected (no cross-user interference)');

-- ============================================================ 5. Per-admin unread
\echo '--- per-admin unread'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a3', 'kenneth@bw.test');
-- Kenneth joins after the slip but before the four messages below.
insert into admin_users (user_id, unread_since) values (:kenneth, now() + interval '2 min');
select pg_temp.ok(
  (select unread_since <> '-infinity' from admin_users where user_id = :kenneth),
  'admins added later get a real unread_since');

select store_mark_admin_read('BW-CCCCCC', :robert, (select id from store_order_messages where order_number = 'BW-CCCCCC' and kind = 'slip'));
select store_mark_admin_read('BW-CCCCCC', :andre, (select id from store_order_messages where order_number = 'BW-CCCCCC' and kind = 'slip'));
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, created_at) values
  ('BW-CCCCCC', 'customer', '00000000-0000-0000-0000-0000000000c3', 'text', 'm1', now() + interval '3 min'),
  ('BW-CCCCCC', 'customer', '00000000-0000-0000-0000-0000000000c3', 'text', 'm2', now() + interval '4 min'),
  ('BW-CCCCCC', 'customer', '00000000-0000-0000-0000-0000000000c3', 'text', 'm3', now() + interval '5 min'),
  ('BW-CCCCCC', 'customer', '00000000-0000-0000-0000-0000000000c3', 'text', 'm4', now() + interval '6 min');
select store_mark_admin_read('BW-CCCCCC', :andre, (select id from store_order_messages where body = 'm2'));
select pg_temp.ok((select unread_count from store_admin_inbox(:robert, p_order_number => 'BW-CCCCCC')) = 4,
  'Robert (read up to the slip) = 4 unread');
select pg_temp.ok((select unread_count from store_admin_inbox(:andre, p_order_number => 'BW-CCCCCC')) = 2,
  'Andre (read up to m2) = 2 unread');
select pg_temp.ok((select unread_count from store_admin_inbox(:kenneth, p_order_number => 'BW-CCCCCC')) = 4,
  'Kenneth (never opened) = 4 unread');
select pg_temp.ok((select count(*) from store_conversation_reads where admin_user_id = :kenneth) = 0,
  'Andre reading created no row for Kenneth');
select pg_temp.ok(
  (select last_read_message_id from store_conversation_reads where admin_user_id = :robert and order_number = 'BW-CCCCCC')
    = (select id from store_order_messages where order_number = 'BW-CCCCCC' and kind = 'slip'),
  'Andre reading did not move Robert''s cursor');
select pg_temp.ok(
  (select count(*) from store_admin_inbox(:kenneth, 'unread')) = 1,
  'Kenneth''s unread filter shows only the chat that arrived after he joined');

select store_mark_admin_read('BW-CCCCCC', :andre, (select id from store_order_messages where body = 'm1'));
select pg_temp.ok((select unread_count from store_admin_inbox(:andre, p_order_number => 'BW-CCCCCC')) = 2,
  'an older position never moves a cursor backwards');
select pg_temp.raises(
  $$select store_mark_admin_read('BW-CCCCCC', '00000000-0000-0000-0000-0000000000a2',
      (select id from store_order_messages where order_number = 'BW-AAAAAA' limit 1))$$, 'P0002',
  'cannot mark read using a message from a different chat');
select pg_temp.raises(
  $$select store_mark_admin_read('BW-CCCCCC', '00000000-0000-0000-0000-0000000000c3',
      (select id from store_order_messages where body = 'm4'))$$, '42501',
  'a customer id cannot write admin read state');

-- identical timestamps: the (created_at, id) cursor is exact
insert into store_order_messages (id, order_number, sender_role, sender_user_id, kind, body, created_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'BW-CCCCCC', 'customer', '00000000-0000-0000-0000-0000000000c3', 'text', 'tie1', '2100-01-01 00:00:00+00'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'BW-CCCCCC', 'customer', '00000000-0000-0000-0000-0000000000c3', 'text', 'tie2', '2100-01-01 00:00:00+00');
select store_mark_admin_read('BW-CCCCCC', :kenneth, 'aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok((select unread_count from store_admin_inbox(:kenneth, p_order_number => 'BW-CCCCCC')) = 1,
  'two messages with the same timestamp: reading the first leaves exactly the second unread');

-- customer "Seen" follows the furthest admin position
truncate realtime.messages;
select store_mark_admin_read('BW-AAAAAA', :andre, (select id from store_order_messages where body = 'paid na po'));
select pg_temp.ok(
  (select admin_read_message_id from store_order_conversations where order_number = 'BW-AAAAAA')
    = (select id from store_order_messages where body = 'paid na po'),
  'customer Seen position = furthest admin read');
select pg_temp.ok(
  (select array_agg(k order by k) from realtime.messages, jsonb_object_keys(payload) k
    where topic like 'chat:%' and event = 'seen') = array['admin_read_at', 'admin_read_message_id'],
  'customer receives a seen ping with no admin identity');

-- customer side
select pg_temp.ok(
  (select unread_count from store_customer_conversations(:custa) where order_number = 'BW-AAAAAA') = 1,
  'customer unread = admin messages after the customer''s cursor');
select store_mark_customer_read('BW-AAAAAA', (select id from store_order_messages where body = 'ok po'));
select pg_temp.ok(
  (select unread_count from store_customer_conversations(:custa) where order_number = 'BW-AAAAAA') = 0,
  'customer reading clears customer unread');
select pg_temp.ok(
  (select count(*) from store_customer_conversations(:custa)) = 1
  and (select count(*) from store_customer_conversations(:custa) where order_number = 'BW-BBBBBB') = 0,
  'customer list only contains the customer''s own chats');

-- ============================================================ 6. Assignment
\echo '--- assignment'
truncate realtime.messages;
select pg_temp.raises(
  $$select store_assign_conversation('BW-BBBBBB', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2')$$, '42501',
  'non-admin actor rejected');
select pg_temp.raises(
  $$select store_assign_conversation('BW-BBBBBB', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1')$$, '22023',
  'assigning to a non-admin rejected');
select pg_temp.raises(
  $$select store_assign_conversation('BW-ZZZZZZ', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1')$$, 'P0002',
  'assigning a missing conversation rejected');
select store_assign_conversation('BW-BBBBBB', :robert, :andre);
select pg_temp.ok(
  (select assigned_admin_id = :robert and assigned_by = :andre from store_order_conversations where order_number = 'BW-BBBBBB'),
  'Andre assigned the chat to Robert');
select pg_temp.ok(
  (select count(*) from store_chat_audit_log where action = 'conversation.assigned'
     and order_number = 'BW-BBBBBB' and actor_user_id = :andre
     and details->>'to' = '00000000-0000-0000-0000-0000000000a1') = 1,
  'audit row records actor and new assignee');
select pg_temp.ok(
  (select payload->>'assigned_admin_id' from realtime.messages where topic = 'admin:inbox' and event = 'conversation')
    = '00000000-0000-0000-0000-0000000000a1',
  'assignment broadcast to admins (ids only)');
select pg_temp.ok((select count(*) from realtime.messages where topic like 'chat:%') = 0,
  'customers are not told about internal assignment');
select store_assign_conversation('BW-BBBBBB', :robert, :robert);
select pg_temp.ok(
  (select count(*) from store_chat_audit_log where order_number = 'BW-BBBBBB') = 1,
  're-assigning to the same admin writes no extra audit row');
select store_assign_conversation('BW-BBBBBB', null, :kenneth);
select pg_temp.ok(
  (select assigned_admin_id is null from store_order_conversations where order_number = 'BW-BBBBBB')
  and (select count(*) from store_chat_audit_log where action = 'conversation.unassigned') = 1,
  'unassign works and is audited');

-- ============================================================ 7. Filters/search/pages
\echo '--- filters, search, pagination'
select store_assign_conversation('BW-BBBBBB', :robert, :robert);
select pg_temp.ok((select array_agg(order_number) from store_admin_inbox(:robert, 'mine')) = array['BW-BBBBBB'], 'filter: assigned to me');
select pg_temp.ok((select array_agg(order_number order by order_number) from store_admin_inbox(:robert, 'unassigned')) = array['BW-AAAAAA', 'BW-CCCCCC'], 'filter: unassigned');
select pg_temp.ok((select array_agg(order_number) from store_admin_inbox(:robert, 'under_review')) = array['BW-AAAAAA'], 'filter: under review = XOB status pending');
select pg_temp.ok((select array_agg(order_number) from store_admin_inbox(:robert, p_search => 'juan123')) = array['BW-AAAAAA'], 'search: Roblox username, case-insensitive');
select pg_temp.ok((select array_agg(order_number) from store_admin_inbox(:robert, p_search => 'maria')) = array['BW-BBBBBB'], 'search: customer name');
select pg_temp.ok((select array_agg(order_number) from store_admin_inbox(:robert, p_search => 'bw-ccc')) = array['BW-CCCCCC'], 'search: order number');
select pg_temp.ok(
  (select array_agg(order_number) from store_admin_inbox(:robert, p_limit => 1)) = array['BW-CCCCCC']
  and (select array_agg(order_number) from store_admin_inbox(:robert,
         p_before_at => (select last_message_at from store_order_conversations where order_number = 'BW-CCCCCC'),
         p_before_order => 'BW-CCCCCC', p_limit => 1)) = array['BW-AAAAAA'],
  'keyset pagination returns consecutive pages');

-- ============================================================ 8. Payment details
\echo '--- payment details'
select pg_temp.raises($$select store_save_payment_method('00000000-0000-0000-0000-0000000000c1', null, 'GCash', 'A L M', '09171234567', null, true)$$, '42501',
  'non-admin cannot create a payment account');
select pg_temp.raises($$select store_save_payment_method('00000000-0000-0000-0000-0000000000a1', null, 'GCash', 'A L M', '+63 917 123 4567', null, true)$$, '23514',
  'account number must be 09XXXXXXXXX');
select pg_temp.raises($$select store_save_payment_method('00000000-0000-0000-0000-0000000000a1', null, 'GCash', 'A L M', '09171234567', '../../etc/passwd', true)$$, '23514',
  'QR path must be a generated qr/<uuid>.<ext> name');
select id as gcash_id from store_save_payment_method(:robert, null, 'GCash', 'A L M', '09171234567',
  'qr/5f0c1b2a-3d4e-4f60-8a7b-9c0d1e2f3a4b.png', true) \gset
select pg_temp.ok(
  (select created_by = :robert and updated_by = :robert from store_payment_methods where id = :'gcash_id'),
  'created_by/updated_by come from the verified actor');
select store_save_payment_method(:andre, :'gcash_id', 'GCash', 'A L M', '09179998888',
  'qr/5f0c1b2a-3d4e-4f60-8a7b-9c0d1e2f3a4b.png', true);
select pg_temp.ok(
  (select details->'before'->>'account_number' = '09171234567'
      and details->'after'->>'account_number' = '09179998888'
      and actor_user_id = :andre
     from store_chat_audit_log where action = 'payment_method.updated'),
  'payment account edit audited with before/after and actor');

truncate realtime.messages;
select store_send_payment_details('BW-CCCCCC', :robert, :'gcash_id', '22222222-2222-2222-2222-222222222222') as pay_msg \gset
select pg_temp.ok(
  (select (payload->>'amount')::numeric from store_order_messages where id = :'pay_msg') = 279
  and (select payload->>'account_number' from store_order_messages where id = :'pay_msg') = '09179998888',
  'payment message amount = snapshot total, number = stored account');
select pg_temp.ok(
  (select store_send_payment_details('BW-CCCCCC', :robert, :'gcash_id', '22222222-2222-2222-2222-222222222222')) = :'pay_msg'
  and (select count(*) from store_order_messages where kind = 'payment') = 1,
  'sending payment details twice with the same client id creates one message');
select pg_temp.ok(
  (select payment_details_sent_at is not null from store_order_conversations where order_number = 'BW-CCCCCC'),
  'structured payment state recorded on the conversation');
select pg_temp.ok(
  (select count(*) from realtime.messages where payload::text like '%qr/%' or payload::text like '%09179998888%') = 0,
  'no realtime payload carries the QR path or payment payload');
select pg_temp.raises(
  $$insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, payload)
    values ('BW-AAAAAA', 'customer', '00000000-0000-0000-0000-0000000000c1', 'payment', '', '{"amount":1}')$$, '23514',
  'a customer can never author payment details');
select pg_temp.raises(
  $$insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, payload)
    values ('BW-AAAAAA', 'admin', '00000000-0000-0000-0000-0000000000a1', 'text', 'hi', '{"amount":1}')$$, '23514',
  'payload only on payment messages');
update store_payment_methods set is_active = false where id = :'gcash_id';
select pg_temp.raises(
  $$select store_send_payment_details('BW-AAAAAA', '00000000-0000-0000-0000-0000000000a1',
      (select id from store_payment_methods limit 1), gen_random_uuid())$$, 'P0002',
  'an inactive account cannot be sent');
select pg_temp.raises(
  $$select store_send_payment_details('BW-AAAAAA', '00000000-0000-0000-0000-0000000000c1',
      (select id from store_payment_methods limit 1), gen_random_uuid())$$, '42501',
  'a non-admin cannot send payment details');

-- ============================================================ 9. Quick replies
\echo '--- quick replies'
select pg_temp.raises($$select store_save_quick_reply('00000000-0000-0000-0000-0000000000c1', null, 'was', 'x', 'y', true)$$, '42501',
  'non-admin cannot create a quick reply');
select id as qr_id from store_save_quick_reply(:robert, null, '  WAS ', 'Payment received', 'Payment received po! Kindly accept my friend request.', true) \gset
select pg_temp.ok(
  (select shortcut from store_quick_replies where id = :'qr_id') = 'was',
  '/WAS is stored as the canonical lowercase shortcut "was"');
select pg_temp.raises($$select store_save_quick_reply('00000000-0000-0000-0000-0000000000a2', null, 'Was', 't', 'b', true)$$, '23505',
  '/Was collides with /was (database-enforced uniqueness)');
select pg_temp.raises($$insert into store_quick_replies (shortcut, title, body) values ('WAS2', 't', 'b')$$, '23514',
  'uppercase can never be stored, even bypassing the function');
select pg_temp.raises($$select store_save_quick_reply('00000000-0000-0000-0000-0000000000a2', null, 'bad shortcut!', 't', 'b', true)$$, '23514',
  'shortcut format enforced');
select store_save_quick_reply(:andre, :'qr_id', 'was', 'Payment received', 'Payment received po!', false);
select pg_temp.ok(
  (select not is_enabled and updated_by = :andre and created_by = :robert from store_quick_replies where id = :'qr_id'),
  'edit + disable records updated_by and keeps created_by');
select pg_temp.ok(
  (select count(*) from store_chat_audit_log where subject_id = :'qr_id') = 2
  and (select details->'before'->>'is_enabled' = 'true' and details->'after'->>'is_enabled' = 'false'
         from store_chat_audit_log where subject_id = :'qr_id' and action = 'quick_reply.updated'),
  'create and edit are audited with before/after');
select pg_temp.raises($$select store_save_quick_reply('00000000-0000-0000-0000-0000000000c1', (select id from store_quick_replies limit 1), 'was', 'x', 'y', true)$$, '42501',
  'non-admin cannot edit or disable');

-- ============================================================ 10. Legacy compat
\echo '--- compatibility with the currently deployed code'
select pg_temp.ok((select count(*) from store_admin_chat_inbox(100)) = 3,
  'the deployed inbox RPC still works');
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, created_at)
values ('BW-BBBBBB', 'customer', :custb, 'text', 'hello?', now() + interval '10 min');
select pg_temp.ok((select unread_count from store_admin_inbox(:andre, p_order_number => 'BW-BBBBBB')) = 2,
  'precondition: Andre has 2 unread on B');
-- what the deployed markChatRead does:
update store_order_messages set read_at = now()
 where order_number = 'BW-BBBBBB' and sender_role = 'customer' and read_at is null;
select pg_temp.ok(
  (select unread_count from store_admin_inbox(:andre, p_order_number => 'BW-BBBBBB')) = 0
  and (select unread_count from store_admin_inbox(:robert, p_order_number => 'BW-BBBBBB')) = 0,
  'old-code reads during the transition carry into the new cursors (old shared semantics)');

-- ============================================================ 11. Browser access
\echo '--- browser access: tables, functions, realtime, storage'
select 'chat:' || id as topic_a from store_order_conversations where order_number = 'BW-AAAAAA' \gset
select 'chat:' || id as topic_b from store_order_conversations where order_number = 'BW-BBBBBB' \gset
select store_chat_send(:'topic_a', 'message', '{"probe": 1}');
select store_chat_send(:'topic_b', 'message', '{"probe": 1}');
select store_chat_send('admin:inbox', 'message', '{"probe": 1}');
insert into storage.objects (bucket_id, name, owner) values
  ('order-chat-attachments', 'BW-AAAAAA/receipt-a.jpg', :custa),
  ('order-chat-attachments', 'BW-BBBBBB/receipt-b.jpg', :custb);
select pg_temp.ok(
  (select count(*) from store_order_messages where order_number = 'BW-BBBBBB') > 0
  and (select count(*) from storage.objects where bucket_id = 'order-chat-attachments') = 2,
  'precondition: B has messages and both receipts exist');
select pg_temp.ok(
  (select not public from storage.buckets where id = 'order-chat-attachments')
  and (select not public from storage.buckets where id = 'store-payment-qr'),
  'receipt and QR buckets are private');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select pg_temp.ok((select count(*) from store_order_messages where order_number = 'BW-AAAAAA') > 0,
  'customer A can read own chat (0020 policy, until cleanup)');
select pg_temp.ok((select count(*) from store_order_messages where order_number = 'BW-BBBBBB') = 0,
  'customer A cannot read customer B''s chat');
select pg_temp.ok((select count(*) from storage.objects) = 0,
  'customer A cannot list or read any receipt object directly (incl. B''s)');
select pg_temp.raises($$select * from store_order_conversations$$, '42501', 'customers cannot read conversations');
select pg_temp.raises($$select * from store_conversation_reads$$, '42501', 'customers cannot read read cursors');
select pg_temp.raises($$select * from store_quick_replies$$, '42501', 'customers cannot read quick replies');
select pg_temp.raises($$insert into store_quick_replies (shortcut, title, body) values ('x', 'x', 'x')$$, '42501', 'customers cannot create quick replies');
select pg_temp.raises($$update store_quick_replies set is_enabled = false$$, '42501', 'customers cannot disable quick replies');
select pg_temp.raises($$select * from store_payment_methods$$, '42501', 'customers cannot browse payment accounts');
select pg_temp.raises($$select * from store_chat_audit_log$$, '42501', 'customers cannot read the audit log');
select pg_temp.raises($$select store_assign_conversation('BW-AAAAAA', null, '00000000-0000-0000-0000-0000000000a1')$$, '42501', 'customers cannot call assignment');
select pg_temp.raises($$select * from store_admin_inbox('00000000-0000-0000-0000-0000000000a1')$$, '42501', 'customers cannot call the inbox function');
select pg_temp.raises($$select store_mark_admin_read('BW-AAAAAA', '00000000-0000-0000-0000-0000000000a1', gen_random_uuid())$$, '42501', 'customers cannot forge admin reads');
select pg_temp.raises($$select store_save_quick_reply('00000000-0000-0000-0000-0000000000a1', null, 'x', 'x', 'x', true)$$, '42501', 'customers cannot call quick reply management even with an admin id');
select pg_temp.raises($$select store_send_payment_details('BW-AAAAAA', '00000000-0000-0000-0000-0000000000a1', gen_random_uuid(), gen_random_uuid())$$, '42501', 'customers cannot send payment details');
select pg_temp.raises($$insert into store_order_messages (order_number, sender_role, kind, body) values ('BW-AAAAAA', 'admin', 'text', 'fake')$$, '42501', 'customers cannot insert messages (cannot forge sender)');

-- realtime as customer A
select set_config('realtime.topic', :'topic_a', false);
select pg_temp.ok((select count(*) from realtime.messages where topic = :'topic_a') > 0, 'realtime: A receives own chat topic');
select set_config('realtime.topic', :'topic_b', false);
select pg_temp.ok((select count(*) from realtime.messages where topic = :'topic_b') = 0, 'realtime: A cannot receive B''s chat topic');
select set_config('realtime.topic', 'admin:inbox', false);
select pg_temp.ok((select count(*) from realtime.messages where topic = 'admin:inbox') = 0, 'realtime: A cannot receive the admin inbox');
select set_config('realtime.topic', 'chat:not-a-uuid', false);
select pg_temp.ok((select count(*) from realtime.messages) = 0, 'realtime: malformed topic denied without error');
select set_config('realtime.topic', 'admin:inbox', false);
select pg_temp.raises($$insert into realtime.messages (topic, extension, event, payload) values ('admin:inbox', 'broadcast', 'signal', '{}')$$, '42501', 'realtime: A cannot publish admin events');
select pg_temp.raises($$insert into realtime.messages (topic, extension, event, payload) values ('admin:inbox', 'presence', 'sync', '{}')$$, '42501', 'realtime: A cannot publish presence');
select set_config('realtime.topic', :'topic_a', false);
select pg_temp.raises(format($$insert into realtime.messages (topic, extension, event, payload) values (%L, 'broadcast', 'message', '{}')$$, :'topic_a'), '42501', 'realtime: A cannot inject events into own chat topic');

-- realtime as an admin
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
select set_config('realtime.topic', 'admin:inbox', false);
select pg_temp.ok((select count(*) from realtime.messages where topic = 'admin:inbox') > 0, 'realtime: admin receives the inbox topic');
select pg_temp.raises($$insert into realtime.messages (topic, extension, event, payload) values ('admin:inbox', 'broadcast', 'signal', '{"admin_user_id":"00000000-0000-0000-0000-0000000000a1"}')$$, '42501',
  'realtime: an admin cannot publish (so cannot impersonate another admin''s typing/viewing)');
select pg_temp.raises($$insert into realtime.messages (topic, extension, event, payload) values ('admin:inbox', 'presence', 'sync', '{}')$$, '42501',
  'realtime: an admin cannot publish presence');
select set_config('realtime.topic', :'topic_a', false);
select pg_temp.ok((select count(*) from realtime.messages where topic = :'topic_a') = 0,
  'realtime: admins do not subscribe to customer chat topics (least privilege; they use admin:inbox)');
select pg_temp.ok((select count(*) from storage.objects) = 0,
  'admins cannot browse receipts directly either (server signs URLs after checks)');

select set_config('request.jwt.claim.sub', '', false);
set role anon;
select set_config('realtime.topic', :'topic_a', false);
select pg_temp.raises($$select count(*) from realtime.messages$$, '42501', 'realtime: anonymous visitors get nothing');
reset role;

\echo 'ALL 0021 DATABASE TESTS PASSED'
