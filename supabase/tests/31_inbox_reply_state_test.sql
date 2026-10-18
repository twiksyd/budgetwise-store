-- Tests for 0028 (Needs reply / Replied by / Viewed by). Runs after 0027 + 0028.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;

\set robert  '''00000000-0000-0000-0000-0000000000a1'''
\set andre   '''00000000-0000-0000-0000-0000000000a2'''
\set kenneth '''00000000-0000-0000-0000-0000000000a3'''
\set custa   '''00000000-0000-0000-0000-0000000000c1'''

-- A third admin (Kenneth / Akio).
insert into auth.users (id, email) values (:kenneth, 'kenneth@bw.test') on conflict do nothing;
insert into admin_users (user_id, display_name) values (:kenneth, 'Kenneth') on conflict do nothing;

create or replace function pg_temp.needs(p_admin uuid) returns boolean language sql as $$
  select last_customer_message_id is not null
         and (last_admin_reply_id is null
              or (last_admin_reply_at, last_admin_reply_id) < (last_customer_message_at, last_customer_message_id))
    from store_admin_inbox(p_admin, p_order_number => 'BW-INB028') $$;

\echo '--- backfill (0028)'
select pg_temp.ok(
  (select count(*) from store_order_conversations c
    where c.last_customer_message_id is distinct from (
      select m.id from store_order_messages m where m.order_number = c.order_number and m.sender_role = 'customer'
       order by m.created_at desc, m.id desc limit 1)
       or c.last_admin_reply_id is distinct from (
      select m.id from store_order_messages m where m.order_number = c.order_number and m.sender_role = 'admin'
         and m.kind in ('text', 'image', 'album')
       order by m.created_at desc, m.id desc limit 1)) = 0,
  'existing chats backfilled with their latest customer message and admin reply');

\echo '--- F: a new order slip needs attention; reading it does not answer it'
insert into store_order_snapshots (order_number, idempotency_key, request_fingerprint, view_token_hash,
  buyer_name, buyer_roblox_username, total_amount, owner_user_id)
values ('BW-INB028', 'idem-inb-0028-000000000', repeat('7', 64), repeat('7', 64), 'Inbox Buyer', 'inbRBX', 300, :custa);
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
values ('BW-INB028', 'customer', :custa, 'slip', 'ORDER SLIP INB') returning id as slip \gset
select pg_temp.ok(pg_temp.needs(:robert) and pg_temp.needs(:andre) and pg_temp.needs(:kenneth),
  'the order slip makes the chat Needs reply for every admin');
select pg_temp.ok((select last_admin_reply_by is null and viewed_by = '{}' and unread_count = 1 from store_admin_inbox(:robert, p_order_number => 'BW-INB028')),
  'nobody replied or viewed yet; one unread');
select pg_temp.ok(exists (select 1 from store_admin_inbox(:robert, 'needs_reply') where order_number = 'BW-INB028'),
  'it is in the Needs reply filter');

\echo '--- C: Zuno views without replying'
select store_mark_admin_read('BW-INB028', :robert, :'slip');
select pg_temp.ok((select viewed_by = array[:robert]::uuid[] from store_admin_inbox(:andre, p_order_number => 'BW-INB028')),
  'every admin sees Viewed by Zuno');
select pg_temp.ok(pg_temp.needs(:andre), 'viewing does not answer it: still Needs reply');
select pg_temp.ok((select unread_count from store_admin_inbox(:robert, p_order_number => 'BW-INB028')) = 0 and (select unread_count from store_admin_inbox(:andre, p_order_number => 'BW-INB028')) = 1,
  'Zuno''s read clears only Zuno''s unread');

\echo '--- A / D / E: Akio replies to a chat assigned to Twicks'
select store_assign_conversation('BW-INB028', :andre, :robert);
truncate realtime.messages;
select (store_post_message('BW-INB028', 'admin', :kenneth, 'text', 'Hi! Checking your order now.', null, null, gen_random_uuid())
        -> 'message' ->> 'id') as reply1 \gset
select pg_temp.ok(not pg_temp.needs(:robert) and not pg_temp.needs(:andre) and not pg_temp.needs(:kenneth),
  'A: after Akio replies, nobody sees Needs reply');
select pg_temp.ok((select last_admin_reply_by = :kenneth and last_admin_reply_id = :'reply1' from store_admin_inbox(:andre, p_order_number => 'BW-INB028')),
  'A: everyone sees Replied by Akio');
select pg_temp.ok((select assigned_admin_id = :andre from store_admin_inbox(:robert, p_order_number => 'BW-INB028')),
  'D: the assignment stays with Twicks');
select pg_temp.ok((select unread_count from store_admin_inbox(:andre, p_order_number => 'BW-INB028')) = 1,
  'E: Twicks still has a personal unread, separate from Replied by Akio');
select pg_temp.ok(not exists (select 1 from store_admin_inbox(:robert, 'needs_reply') where order_number = 'BW-INB028'),
  'it left the Needs reply filter');
select pg_temp.ok(not exists (select 1 from realtime.messages where event = 'conversation'),
  'the reply state adds no realtime event (clients derive it from the message event)');

\echo '--- B: the customer writes again (twice)'
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
values ('BW-INB028', 'customer', :custa, 'text', 'Thanks! How long?');
select (store_post_message('BW-INB028', 'customer', :custa, 'text', 'Also, can I add one more?', null, null, gen_random_uuid())
        -> 'message' ->> 'id') as cust2 \gset
select pg_temp.ok(pg_temp.needs(:kenneth), 'B: a customer message after the reply means Needs reply again');
select pg_temp.ok((select last_customer_message_id = :'cust2' from store_order_conversations where order_number = 'BW-INB028'),
  'B: consecutive customer messages: the latest one is what needs a reply');
select pg_temp.ok((select viewed_by = '{}' from store_admin_inbox(:andre, p_order_number => 'BW-INB028')),
  'B: Viewed by resets to admins who read the NEW activity');

\echo '--- payment cards and proof albums'
select store_save_payment_method(:robert, null, 'GCash', 'B W Store', '09170000028', null, true) is not null as _m \gset
select store_send_payment_details('BW-INB028', :robert,
  (select id from store_payment_methods where account_number = '09170000028'), gen_random_uuid()) as pay \gset
select pg_temp.ok(pg_temp.needs(:robert), 'a payment-details card alone does not count as a reply');
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, payload)
values ('BW-INB028', 'admin', :andre, 'album', '', '{"label": "proof_of_delivery"}');
select pg_temp.ok(not pg_temp.needs(:robert) and (select last_admin_reply_by = :andre from store_admin_inbox(:robert, p_order_number => 'BW-INB028')),
  'a proof-of-delivery album from an admin counts as a reply (Replied by Twicks)');

\echo '--- H: Payment Received changes neither reply nor read state'
create temp table before_h as select last_admin_reply_id, viewed_by, unread_count from store_admin_inbox(:andre, p_order_number => 'BW-INB028');
select store_confirm_payment('BW-INB028', :'pay', :kenneth);
select pg_temp.ok(
  (select f.last_admin_reply_id = b.last_admin_reply_id and f.viewed_by = b.viewed_by and f.unread_count = b.unread_count
          and f.payment_received_message_id = :'pay' and f.state = 'active'
     from store_admin_inbox(:andre, p_order_number => 'BW-INB028') f, before_h b),
  'H: Paid, but the reply / viewed / unread state and Active are unchanged');

\echo '--- G: a Done chat reopens with Needs reply'
select store_set_conversation_state('BW-INB028', :kenneth, 'done',
  (select id from store_order_messages where order_number = 'BW-INB028' order by created_at desc, id desc limit 1));
select pg_temp.ok(not exists (select 1 from store_admin_inbox(:robert, 'needs_reply') where order_number = 'BW-INB028')
  and not exists (select 1 from store_admin_inbox(:robert, 'active') where order_number = 'BW-INB028'),
  'G: a Done chat is in neither Active nor Needs reply');
select store_post_message('BW-INB028', 'customer', :custa, 'text', 'One more question', null, null, gen_random_uuid());
select pg_temp.ok((select state = 'active' from store_admin_inbox(:robert, p_order_number => 'BW-INB028')) and pg_temp.needs(:robert)
  and exists (select 1 from store_admin_inbox(:robert, 'needs_reply') where order_number = 'BW-INB028'),
  'G: the customer''s message reopens it as Active and Needs reply');

\echo '--- General Inquiry'
select store_open_inquiry('00000000-0000-0000-0000-0000000000c2', 'Maria') as gi \gset
select pg_temp.ok(not exists (select 1 from store_admin_inbox(:robert, 'all', null, null, null, 100) where order_number = :'gi')
  or exists (select 1 from store_order_messages where order_number = :'gi'),
  'an inquiry nobody has written in is not in the inbox (no false Needs reply)');
select store_post_message(:'gi', 'customer', '00000000-0000-0000-0000-0000000000c2', 'text', 'Hello, question', null, null, gen_random_uuid());
select pg_temp.ok(exists (select 1 from store_admin_inbox(:robert, 'needs_reply', null, null, null, 100) where order_number = :'gi'),
  'the inquiry''s first customer message needs a reply like an order');

\echo '--- customers see none of it'
select pg_temp.ok(
  not exists (select 1 from information_schema.routines r
                join information_schema.parameters p on p.specific_name = r.specific_name
               where r.routine_name = 'store_customer_conversations'
                 and (p.parameter_name like '%viewed%' or p.parameter_name like '%reply%')),
  'the customer conversation list exposes no viewed / replied-by data');

\echo 'PASSED 31_inbox_reply_state_test'
