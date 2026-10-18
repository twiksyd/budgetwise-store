-- Tests for 0026 (General Inquiry conversations as chat threads).
-- Runs after 0026 on a database that already has order chats.
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
insert into storage.buckets (id, name, public) values ('order-chat-attachments', 'order-chat-attachments', false)
  on conflict (id) do nothing;

\set robert '''00000000-0000-0000-0000-0000000000a1'''
\set andre  '''00000000-0000-0000-0000-0000000000a2'''
\set custa  '''00000000-0000-0000-0000-0000000000c1'''
\set custb  '''00000000-0000-0000-0000-0000000000c2'''

\echo '--- every order is a thread; existing chats untouched (0026)'
select pg_temp.ok(
  (select count(*) from store_order_snapshots s
     left join store_chat_threads t on t.key = s.order_number and t.kind = 'order' and t.order_number = s.order_number
    where t.key is null) = 0,
  'every existing order has its order thread');
select pg_temp.ok(
  (select count(*) from store_order_messages m left join store_chat_threads t on t.key = m.order_number where t.key is null) = 0
  and (select count(*) from store_order_conversations c left join store_chat_threads t on t.key = c.order_number where t.key is null) = 0,
  'every message and conversation belongs to a thread');
select pg_temp.ok(
  (select count(*) from pg_constraint where contype = 'f'
     and confrelid = 'public.store_order_snapshots'::regclass
     and conrelid in ('public.store_order_messages'::regclass, 'public.store_order_conversations'::regclass)) = 0
  and (select count(*) from pg_constraint where contype = 'f' and convalidated
     and confrelid = 'public.store_chat_threads'::regclass
     and conrelid in ('public.store_order_messages'::regclass, 'public.store_order_conversations'::regclass)) = 2,
  'messages and conversations now reference threads (validated foreign keys)');
create temp table snapshots_before as select order_number from store_order_snapshots;
create temp table xob_before_0026 as select id, status from orders;

insert into store_order_snapshots (order_number, idempotency_key, request_fingerprint, view_token_hash,
  buyer_name, buyer_roblox_username, total_amount, owner_user_id)
values ('BW-NEW026', 'idem-new-0026-000000000', repeat('f', 64), repeat('f', 64), 'New Buyer', 'newRBX', 99, :custa);
select pg_temp.ok(exists (select 1 from store_chat_threads where key = 'BW-NEW026' and kind = 'order'),
  'a new order gets its thread automatically (checkout unchanged)');
select store_post_message('BW-NEW026', 'customer', :custa, 'text', 'Order chat still works', null, null, gen_random_uuid());
select pg_temp.ok((select last_message_preview from store_order_conversations where order_number = 'BW-NEW026') = 'Order chat still works',
  'order chats post and preview exactly as before');
delete from snapshots_before; insert into snapshots_before select order_number from store_order_snapshots;

\echo '--- one General Inquiry per customer, never an order (0026)'
select store_open_inquiry(:custa, 'Juan Dela Cruz') as inq_a \gset
select pg_temp.ok(:'inq_a' ~ '^GI-[0-9A-F]{8}$', 'an inquiry key looks like GI-XXXXXXXX');
select pg_temp.ok(store_open_inquiry(:custa, 'Juan Dela Cruz') = :'inq_a', 'opening again returns the same inquiry');
select store_open_inquiry(:custb, 'Maria Santos') as inq_b \gset
select pg_temp.ok(:'inq_b' <> :'inq_a', 'another customer gets their own inquiry');
select pg_temp.ok((select count(*) from store_chat_threads where kind = 'inquiry' and owner_user_id = :custa) = 1,
  'still exactly one inquiry for the first customer');
select pg_temp.raises($q$select store_open_inquiry('00000000-0000-0000-0000-00000000dead', 'Ghost')$q$, '42501',
  'an unknown user cannot open an inquiry');
select pg_temp.raises(format($q$insert into store_chat_threads (key, kind, owner_user_id) values ('GI-AAAAAAAA', 'inquiry', %L)$q$, :custa),
  '23505', 'a second inquiry for the same customer is refused by the database');
select pg_temp.raises($q$insert into store_chat_threads (key, kind, owner_user_id) values ('BW-FAKE00', 'inquiry', '00000000-0000-0000-0000-0000000000c1')$q$,
  '23514', 'an inquiry key can never look like an order number');
select pg_temp.ok(
  (select count(*) from store_order_snapshots) = (select count(*) from snapshots_before)
  and not exists (select 1 from store_order_snapshots where order_number like 'GI-%'),
  'no order was created for an inquiry');

\echo '--- messages, conversation and realtime for an inquiry (0026)'
truncate realtime.messages;
select (store_post_message(:'inq_a', 'customer', :custa, 'text', 'Hi, do you sell Robux?', null, null, gen_random_uuid())
        -> 'message' ->> 'id') as inq_msg1 \gset
select pg_temp.ok(
  (select state = 'active' and last_sender_role = 'customer' and last_message_preview = 'Hi, do you sell Robux?'
     from store_order_conversations where order_number = :'inq_a'),
  'the first customer message starts an Active conversation');
select id as inq_conv from store_order_conversations where order_number = :'inq_a' \gset
select pg_temp.ok(
  exists (select 1 from realtime.messages where topic = 'admin:inbox' and event = 'message' and payload ->> 'order_number' = :'inq_a')
  and exists (select 1 from realtime.messages where topic = 'chat:' || :'inq_conv' and event = 'message')
  and exists (select 1 from realtime.messages where topic = 'customer:' || :custa and event = 'message'),
  'realtime: admin inbox, the chat topic and the customer''s own topic all hear it');
select pg_temp.ok(
  not exists (select 1 from realtime.messages where topic = 'customer:' || :custb),
  '... and no other customer does');
select pg_temp.raises(format($q$select store_post_message(%L, 'customer', %L, 'text', 'not mine', null, null, gen_random_uuid())$q$, :'inq_a', :custb),
  '42501', 'another customer cannot post in someone else''s inquiry');
select pg_temp.raises(format($q$select store_post_message(%L, 'admin', %L, 'text', 'not an admin', null, null, gen_random_uuid())$q$, :'inq_a', :custa),
  '42501', 'a customer cannot post as an admin');
select store_post_message(:'inq_a', 'admin', :robert, 'text', 'Yes po! How many?', null, null, gen_random_uuid());
select pg_temp.ok((select last_sender_role from store_order_conversations where order_number = :'inq_a') = 'admin',
  'admins reply in the inquiry');
select pg_temp.ok((select count(*) from store_chat_messages_page(:'inq_a')) = 2, 'messages page like any chat');

\echo '--- images in an inquiry (0026)'
select gen_random_uuid() as inq_cid \gset
select format('[{"position":0,"path":"%1$s/%2$s/%3$s/0.jpg","mime":"image/jpeg","size":9,"thumb_path":"%1$s/%2$s/%3$s/0.thumb.jpg","thumb_mime":"image/jpeg"}]',
  :'inq_a', '00000000-0000-0000-0000-0000000000c1', :'inq_cid') as inq_album \gset
insert into storage.objects (bucket_id, name)
select 'order-chat-attachments', f from jsonb_array_elements(:'inq_album'::jsonb) a,
  lateral (values (a ->> 'path'), (a ->> 'thumb_path')) v(f);
select (store_post_album(:'inq_a', 'customer', :custa, 'receipt', null, :'inq_album'::jsonb, :'inq_cid') -> 'message' ->> 'id') as inq_album_id \gset
select pg_temp.ok(
  (select kind = 'album' from store_order_messages where id = :'inq_album_id')
  and (select count(*) from store_order_message_attachments where message_id = :'inq_album_id') = 1,
  'a customer can send photos in their inquiry');
select pg_temp.raises(format($q$select store_post_album(%L, 'customer', %L, '', null, %L::jsonb, gen_random_uuid())$q$, :'inq_a', :custb, :'inq_album'),
  '42501', 'another customer cannot send photos into it');

\echo '--- admin inbox: alongside order chats, labelled by the customer (0026)'
select pg_temp.ok(
  (select buyer_name = 'Juan Dela Cruz' and total_amount is null and buyer_roblox_username is null and order_status is null
     from store_admin_inbox(:robert, 'all', null, null, null, 100, :'inq_a')),
  'the inquiry is an inbox row with the customer''s name and no order fields');
select pg_temp.ok(
  exists (select 1 from store_admin_inbox(:andre, 'unread', null, null, null, 100) where order_number = :'inq_a' and unread_count = 2),
  'unread counts work per admin');
select pg_temp.ok(
  exists (select 1 from store_admin_inbox(:robert, 'all', 'Juan Dela', null, null, 100) where order_number = :'inq_a')
  and exists (select 1 from store_admin_inbox(:robert, 'all', :'inq_a', null, null, 100) where order_number = :'inq_a'),
  'search finds it by customer name and by GI key');
select pg_temp.ok(
  exists (select 1 from store_admin_inbox(:robert, 'all', null, null, null, 100) where order_number = 'BW-AAAAAA')
  and exists (select 1 from store_admin_inbox(:robert, 'all', null, null, null, 100) where order_number = :'inq_a'),
  'order chats and inquiries share one inbox');
select pg_temp.ok(
  not exists (select 1 from store_admin_inbox(:robert, 'under_review', null, null, null, 100) where order_number = :'inq_a'),
  'order-status filters leave inquiries out');

\echo '--- assignment, reads, Done/Reopen for an inquiry (0026)'
truncate realtime.messages;
select store_assign_conversation(:'inq_a', :andre, :robert);
select pg_temp.ok(
  (select assigned_admin_id = :andre from store_order_conversations where order_number = :'inq_a')
  and exists (select 1 from realtime.messages where topic = 'chat:' || :'inq_conv' and event = 'assistant' and payload = '{}'::jsonb),
  'assignment works and pings the customer''s chat (public username shown from 0025)');
select pg_temp.ok(
  exists (select 1 from store_admin_inbox(:andre, 'mine', null, null, null, 100) where order_number = :'inq_a'),
  '"Assigned to me" includes it');
select id as inq_last from store_order_messages where order_number = :'inq_a' order by created_at desc, id desc limit 1 \gset
select store_mark_admin_read(:'inq_a', :andre, :'inq_last');
select pg_temp.ok(
  (select unread_count from store_admin_inbox(:andre, 'all', null, null, null, 100, :'inq_a')) = 0,
  'an admin reading it clears their unread count');
select id as inq_admin_msg from store_order_messages where order_number = :'inq_a' and sender_role = 'admin' order by created_at desc limit 1 \gset
select store_mark_customer_read(:'inq_a', :'inq_admin_msg');
select pg_temp.ok(
  (select unread_count from store_customer_conversations(:custa) where order_number = :'inq_a') = 0,
  'the customer reading it clears theirs');
select store_set_conversation_state(:'inq_a', :robert, 'done', :'inq_last');
select pg_temp.ok((select state from store_order_conversations where order_number = :'inq_a') = 'done', 'Mark Done works');
select store_post_message(:'inq_a', 'customer', :custa, 'text', 'One more question po', null, null, gen_random_uuid());
select pg_temp.ok((select state from store_order_conversations where order_number = :'inq_a') = 'active',
  'a new customer message reopens it, like an order chat');

\echo '--- the customer side (0026)'
select pg_temp.ok(
  exists (select 1 from store_customer_conversations(:custa) where order_number = :'inq_a')
  and exists (select 1 from store_customer_conversations(:custa) where order_number = 'BW-NEW026'),
  'a customer''s conversations include their inquiry and their order chats');
select pg_temp.ok(
  not exists (select 1 from store_customer_conversations(:custb) where order_number = :'inq_a'),
  '... never someone else''s inquiry');
select pg_temp.ok(
  not exists (select 1 from store_customer_orders(:custa, 'open') where order_number like 'GI-%')
  and not exists (select 1 from store_customer_orders(:custa, 'completed') where order_number like 'GI-%'),
  'My Orders lists orders only');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select pg_temp.ok(store_realtime_topic_allowed('chat:' || :'inq_conv'), 'the owner may receive the inquiry''s chat topic');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
select pg_temp.ok(not store_realtime_topic_allowed('chat:' || :'inq_conv'), '... another customer may not');
select pg_temp.ok(not store_realtime_topic_allowed('chat:' || (select id from store_order_conversations where order_number = 'BW-AAAAAA')),
  '... and order topics are still owner-only');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select pg_temp.ok(store_realtime_topic_allowed('chat:' || (select id from store_order_conversations where order_number = 'BW-AAAAAA')),
  'the order''s owner still receives the order topic');
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.ok(not store_realtime_topic_allowed('chat:' || :'inq_conv'), 'signed out: nothing');

\echo '--- order-only features refuse inquiries (0026)'
select pg_temp.raises(format($q$select store_send_payment_details(%L, %L, gen_random_uuid(), gen_random_uuid())$q$, :'inq_a', :robert),
  null, 'payment details need a real order');
select pg_temp.raises(format($q$select store_set_fulfillment_detail(%L, 0, 0, 'gamepass_link', 'x', null, %L, 'customer')$q$, :'inq_a', :custa),
  null, 'fulfillment details need a real order');
select pg_temp.raises(format($q$insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body) values (%L, 'customer', %L, 'slip', 'slip')$q$, 'GI-00000000', :custa),
  '23503', 'a message for a thread that does not exist is refused');

\echo '--- privileges (0026)'
set role authenticated;
select pg_temp.raises($q$select * from store_chat_threads$q$, '42501', 'browsers cannot read threads');
select pg_temp.raises($q$select store_open_inquiry('00000000-0000-0000-0000-0000000000c1', 'x')$q$, '42501', 'browsers cannot open inquiries directly');
select pg_temp.raises($q$select store_chat_owner('BW-AAAAAA')$q$, '42501', 'browsers cannot look up thread owners');
reset role;

\echo '--- cascade and XOB (0026)'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c7', 'leaving@gmail.test');
select store_open_inquiry('00000000-0000-0000-0000-0000000000c7', 'Leaving') as inq_gone \gset
select store_post_message(:'inq_gone', 'customer', '00000000-0000-0000-0000-0000000000c7', 'text', 'bye', null, null, gen_random_uuid());
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c7';
select pg_temp.ok(
  not exists (select 1 from store_chat_threads where key = :'inq_gone')
  and not exists (select 1 from store_order_messages where order_number = :'inq_gone')
  and not exists (select 1 from store_order_conversations where order_number = :'inq_gone'),
  'a deleted account takes its inquiry with it');
select pg_temp.ok(
  (select count(*) from orders o join xob_before_0026 b using (id) where o.status is distinct from b.status) = 0,
  'XOB orders.status untouched');

\echo 'ALL 0026 DATABASE TESTS PASSED'
