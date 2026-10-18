-- Tests for 0030 (Unopened / Seen, no reply filters). Runs after 0029 + 0030.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;

\set robert  '''00000000-0000-0000-0000-0000000000a1'''
\set andre   '''00000000-0000-0000-0000-0000000000a2'''
\set kenneth '''00000000-0000-0000-0000-0000000000a3'''
\set custa   '''00000000-0000-0000-0000-0000000000c1'''
\set custb   '''00000000-0000-0000-0000-0000000000c9'''

insert into auth.users (id, email) values (:kenneth, 'kenneth@bw.test') on conflict do nothing;
insert into admin_users (user_id, display_name) values (:kenneth, 'Kenneth') on conflict do nothing;
insert into auth.users (id, email) values (:custb, 'custc9@gmail.test') on conflict do nothing;

insert into store_order_snapshots (order_number, idempotency_key, request_fingerprint, view_token_hash,
  buyer_name, buyer_roblox_username, total_amount, owner_user_id)
values ('BW-ATT030', 'idem-att-0030-000000000', repeat('4', 64), repeat('4', 64), 'Attn Buyer', 'attRBX', 120, :custa);
insert into store_order_line_snapshots (order_number, line_index, game_id, product_name, game_name, robux_amount, quantity, unit_price, line_total)
values ('BW-ATT030', 0, '11111111-0000-0000-0000-00000000000a', 'Item', 'Karinderya', 0, 1, 120, 120);
select store_open_inquiry(:custb, 'Maria') as gi \gset

create or replace function pg_temp.state(p_key text) returns text language sql as $$
  select case
    when exists (select 1 from store_admin_inbox('00000000-0000-0000-0000-0000000000a1', 'unopened', null, null, null, 100) where order_number = p_key) then 'unopened'
    when exists (select 1 from store_admin_inbox('00000000-0000-0000-0000-0000000000a1', 'seen_no_reply', null, null, null, 100) where order_number = p_key) then 'seen'
    else 'other' end $$;
create or replace function pg_temp.latest(p_key text) returns uuid language sql as $$
  select id from store_order_messages where order_number = p_key order by created_at desc, id desc limit 1 $$;

\echo '--- an inquiry nobody wrote in is never urgent (0030)'
select pg_temp.ok(pg_temp.state(:'gi') = 'other', 'an empty General Inquiry is neither Unopened nor Seen');

\echo '--- order chat: Unopened -> Seen -> Replied -> Unopened (0030)'
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
values ('BW-ATT030', 'customer', :custa, 'slip', 'SLIP ATT');
select pg_temp.ok(pg_temp.state('BW-ATT030') = 'unopened', 'the order slip is Unopened');
select store_assign_conversation('BW-ATT030', :andre, :robert);
select pg_temp.ok(pg_temp.state('BW-ATT030') = 'unopened', 'assignment is not viewing');
select store_save_payment_method(:robert, null, 'GCash', 'B W Store', '09170000030', null, true) is not null as _m \gset
select store_send_payment_details('BW-ATT030', :robert,
  (select id from store_payment_methods where account_number = '09170000030'), gen_random_uuid()) as pay \gset
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
values ('BW-ATT030', 'customer', :custa, 'text', 'Paid na po');
select pg_temp.ok(pg_temp.state('BW-ATT030') = 'unopened', 'payment details are not a reply; the new message is Unopened');
select store_mark_admin_read('BW-ATT030', :kenneth, pg_temp.latest('BW-ATT030'));
select pg_temp.ok(pg_temp.state('BW-ATT030') = 'seen', 'Akio reads it: Seen, no reply');
select pg_temp.ok((select viewed_by = array[:kenneth]::uuid[] from store_admin_inbox(:andre, p_order_number => 'BW-ATT030')),
  'Viewed by Akio (from his read cursor)');
select pg_temp.ok((select unread_count > 0 from store_admin_inbox(:andre, p_order_number => 'BW-ATT030')),
  'Twicks keeps a personal unread');
select store_confirm_payment('BW-ATT030', :'pay', :robert);
select pg_temp.ok(pg_temp.state('BW-ATT030') = 'seen', 'Payment Received is not a reply');
select store_post_message('BW-ATT030', 'admin', :kenneth, 'text', 'Thanks! Sending now.', null, null, gen_random_uuid());
select pg_temp.ok(pg_temp.state('BW-ATT030') = 'other'
  and not exists (select 1 from store_admin_inbox(:robert, 'needs_reply', null, null, null, 100) where order_number = 'BW-ATT030'),
  'Akio replies: Replied (in neither filter)');
select pg_temp.ok((select unread_count > 0 from store_admin_inbox(:andre, p_order_number => 'BW-ATT030')),
  'Twicks'' personal unread survives Akio''s reply');
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
values ('BW-ATT030', 'customer', :custa, 'text', 'One more thing');
select pg_temp.ok(pg_temp.state('BW-ATT030') = 'unopened', 'a follow-up resets it to Unopened');

\echo '--- General Inquiry follows the same states (0030)'
select store_post_message(:'gi', 'customer', :custb, 'text', 'Hello?', null, null, gen_random_uuid());
select pg_temp.ok(pg_temp.state(:'gi') = 'unopened', 'the first inquiry message is Unopened');
select store_mark_admin_read(:'gi', :robert, pg_temp.latest(:'gi'));
select pg_temp.ok(pg_temp.state(:'gi') = 'seen', 'read by Zuno: Seen, no reply');
select store_post_message(:'gi', 'admin', :robert, 'text', 'Hi! How can we help?', null, null, gen_random_uuid());
select pg_temp.ok(pg_temp.state(:'gi') = 'other', 'replied');

\echo '--- combines with the game filter, pagination and Done (0030)'
select store_mark_admin_read('BW-ATT030', :andre, pg_temp.latest('BW-ATT030'));
select pg_temp.ok(
  exists (select 1 from store_admin_inbox(:robert, 'seen_no_reply', null, null, null, 100, null, array['11111111-0000-0000-0000-00000000000a']::uuid[], false) where order_number = 'BW-ATT030')
  and not exists (select 1 from store_admin_inbox(:robert, 'seen_no_reply', null, null, null, 100, null, array['11111111-0000-0000-0000-00000000000b']::uuid[], false) where order_number = 'BW-ATT030'),
  'Seen, no reply combines with the game filter');
select pg_temp.ok(
  (select count(*) from store_admin_inbox(:robert, 'seen_no_reply', null, null, null, 1)) <= 1,
  'the page size is respected');
select store_set_conversation_state('BW-ATT030', :robert, 'done', pg_temp.latest('BW-ATT030'));
select pg_temp.ok(pg_temp.state('BW-ATT030') = 'other', 'a Done chat is in neither filter');
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
values ('BW-ATT030', 'customer', :custa, 'text', 'Reopen please');
select pg_temp.ok(pg_temp.state('BW-ATT030') = 'unopened', 'a customer message reopens it as Unopened');
select pg_temp.ok(
  (select bool_and(state = 'active') from store_admin_inbox(:robert, 'unopened', null, null, null, 100))
  and (select bool_and(state = 'active') from store_admin_inbox(:robert, 'seen_no_reply', null, null, null, 100)),
  'both filters only ever return Active chats');

\echo 'PASSED 33_attention_filters_test'
