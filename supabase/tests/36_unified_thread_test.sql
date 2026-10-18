-- Tests for 0033 (one ongoing customer conversation + product cards). After 0032 + 0033.
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

\set robert  '''00000000-0000-0000-0000-0000000000a1'''
\set andre   '''00000000-0000-0000-0000-0000000000a2'''
\set cu      '''00000000-0000-0000-0000-0000000000f1'''
\set cv      '''00000000-0000-0000-0000-0000000000f2'''
\set game1   '''11111111-0000-0000-0000-000000000001'''
\set game2   '''11111111-0000-0000-0000-000000000002'''
\set pass1   '''22222222-0000-0000-0000-000000000001'''
\set pass2   '''22222222-0000-0000-0000-000000000002'''

insert into auth.users (id, email) values (:cu, 'unified@gmail.test'), (:cv, 'other@gmail.test') on conflict do nothing;

-- Orders as create_store_order leaves them: snapshot + frozen lines, no owner.
create or replace function pg_temp.new_order(p_number text, p_total numeric, p_game uuid, p_pass uuid) returns void
language sql as $$
  insert into store_order_snapshots (order_number, idempotency_key, request_fingerprint, view_token_hash,
      buyer_name, buyer_roblox_username, total_amount)
  values (p_number, 'idem-' || lower(p_number) || '-0033-xxxxx', repeat('7', 64), repeat('7', 64),
      'Uni Customer', 'uniRBX', p_total);
  insert into store_order_line_snapshots (order_number, line_index, gamepass_id, game_id, product_name, game_name,
      robux_amount, quantity, unit_price, line_total)
  values (p_number, 0, p_pass, p_game, 'Product ' || p_number, 'Game ' || p_game, 100, 1, p_total, p_total);
  insert into orders (order_number, buyer_name, buyer_roblox_username, status)
  values (p_number, 'Uni Customer', 'uniRBX', 'pending');
$$;

select (store_save_payment_method(:robert, null, 'GCash', 'B W Store', '09170000033', null, true)).id as method \gset
create temp table xob_before_0033 as select id, status from orders;
create temp table legacy_msgs_before_0033 as select id, order_number, body from store_order_messages;

\echo '--- General Inquiry, then an order joins the same conversation (0033)'
select store_open_inquiry(:cu, 'Uni Customer') as gi \gset
select store_post_message(:'gi', 'customer', :cu, 'text', 'Hi, can I order Blox Fruits?', null, null, gen_random_uuid());
select pg_temp.new_order('BW-UNI001', 150, :game1, :pass1);
truncate realtime.messages;
select store_attach_order_to_customer('BW-UNI001', :cu, 'SLIP ONE', 'Uni Customer', null) as att1 \gset
select pg_temp.ok((:'att1'::jsonb ->> 'attached')::boolean and :'att1'::jsonb ->> 'chat_key' = :'gi'
                  and (:'att1'::jsonb ->> 'unified')::boolean,
  'the order is attached and its chat is the customer''s existing conversation');
select pg_temp.ok((select owner_user_id = :cu from store_order_snapshots where order_number = 'BW-UNI001'),
  'the order now belongs to the customer');
select pg_temp.ok(
  (select count(*) = 1 and bool_and(kind = 'slip' and sender_role = 'customer' and order_ref = 'BW-UNI001' and body = 'SLIP ONE')
     from store_order_messages where order_number = :'gi' and kind = 'slip'),
  'the slip is posted once in the conversation, tagged with the order');
select pg_temp.ok(not exists (select 1 from store_order_messages where order_number = 'BW-UNI001')
  and not exists (select 1 from store_order_conversations where order_number = 'BW-UNI001'),
  'no separate order chat or inbox row is created');
select pg_temp.ok((select home_key = :'gi' from store_chat_threads where key = 'BW-UNI001'),
  'the order thread points at the customer conversation');
select pg_temp.ok(
  exists (select 1 from realtime.messages where topic = 'admin:inbox' and event = 'message' and payload ->> 'order_number' = :'gi')
  and exists (select 1 from realtime.messages where topic = 'customer:' || :cu and event = 'message'),
  'admins and the customer hear about the new slip on the conversation');

select store_attach_order_to_customer('BW-UNI001', :cu, 'SLIP ONE', 'Uni Customer', null) as att1b \gset
select pg_temp.ok(:'att1b'::jsonb ->> 'chat_key' = :'gi'
  and (select count(*) from store_order_messages where order_number = :'gi' and kind = 'slip') = 1,
  'a replayed checkout returns the same conversation and posts no second slip');
select pg_temp.ok(not (store_attach_order_to_customer('BW-UNI001', :cv, 'X', 'Other', null) ->> 'attached')::boolean
  and (select owner_user_id = :cu from store_order_snapshots where order_number = 'BW-UNI001'),
  'another account can never take the order (owner unchanged)');

\echo '--- a later order lands in the same conversation (0033)'
update store_order_conversations set state = 'done', done_at = now(), done_by = :robert where order_number = :'gi';
select pg_temp.new_order('BW-UNI002', 320, :game2, :pass2);
select store_attach_order_to_customer('BW-UNI002', :cu, 'SLIP TWO', 'Uni Customer', null) ->> 'chat_key' as key2 \gset
select pg_temp.ok(:'key2' = :'gi'
  and (select count(*) from store_order_messages where order_number = :'gi' and kind = 'slip') = 2
  and (select count(distinct order_ref) from store_order_messages where order_number = :'gi' and kind = 'slip') = 2,
  'the second order is a second, distinguishable slip in the same conversation');
select pg_temp.ok((select state = 'active' from store_order_conversations where order_number = :'gi'),
  'a new order reopens a Done conversation for the team');
select pg_temp.ok(
  (select count(*) = 1 from store_admin_inbox(:robert, 'all', 'uniRBX', null, null, 100, null)
     where customer_user_id = :cu)
  and (select order_count = 2 and latest_order_number = 'BW-UNI002' and total_amount = 320
          and buyer_roblox_username = 'uniRBX' and order_status = 'pending'
     from store_admin_inbox(:robert, 'all', null, null, null, 100, :'gi')),
  'the inbox has ONE row for the customer, carrying both orders (latest shown)');
select pg_temp.ok(
  exists (select 1 from store_admin_inbox(:robert, 'all', 'BW-UNI001', null, null, 100, null) where order_number = :'gi')
  and exists (select 1 from store_admin_inbox(:robert, 'all', 'uniRBX', null, null, 100, null) where order_number = :'gi'),
  'searching an order number or Roblox username finds the customer conversation');
select pg_temp.ok(
  exists (select 1 from store_admin_inbox(:robert, 'all', null, null, null, 100, null, array[:game2]::uuid[], false)
           where order_number = :'gi')
  and not exists (select 1 from store_admin_inbox(:robert, 'all', null, null, null, 100, null,
                     array['33333333-0000-0000-0000-000000000000']::uuid[], false) where order_number = :'gi')
  and (select game_ids @> array[:game1, :game2]::uuid[]
         from store_admin_inbox(:robert, 'all', null, null, null, 100, :'gi')),
  'game filters see the games of every order in the conversation');
select pg_temp.ok(exists (select 1 from store_admin_inbox(:robert, 'under_review', null, null, null, 100, null) where order_number = :'gi'),
  'Under review includes a conversation with a pending linked order');

\echo '--- a customer without an inquiry gets one on their first order (0033)'
select pg_temp.new_order('BW-UNIV01', 99, :game1, :pass1);
select store_attach_order_to_customer('BW-UNIV01', :cv, 'SLIP V', 'Vee', null) ->> 'chat_key' as gv \gset
select pg_temp.ok(:'gv' ~ '^GI-[0-9A-F]{8}$' and :'gv' <> :'gi'
  and (select owner_user_id = :cv and kind = 'inquiry' from store_chat_threads where key = :'gv'),
  'a new conversation is created for that customer (never someone else''s)');

\echo '--- guards (0033)'
select pg_temp.raises(format($q$select store_post_message('BW-UNI001', 'customer', %L, 'text', 'hi', null, null, gen_random_uuid())$q$, :cu),
  'BW030', 'nothing can be posted into a linked order''s own chat');
select pg_temp.raises(format($q$insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, payload, order_ref)
    values (%L, 'admin', %L, 'payment', 'x', '{"amount": 1, "provider": "gcash"}', 'BW-UNIV01')$q$, :'gi', :robert),
  'BW031', 'a message can never point at another customer''s order');
select pg_temp.raises(format($q$insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, order_ref)
    values (%L, 'customer', %L, 'text', 'x', 'BW-UNI001')$q$, :'gi', :cu),
  '23514', 'only slips and payment cards carry an order');
select pg_temp.raises(format($q$insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, payload)
    values (%L, 'customer', %L, 'product', 'x', '{"type": "game"}')$q$, :'gi', :cu),
  '23514', 'customers cannot post product cards');

\echo '--- product cards (0033)'
select gen_random_uuid() as rcid \gset
select store_send_recommendation(:'gi', :robert,
  jsonb_build_object('type', 'product', 'game_id', :game1, 'game_slug', 'blox-fruits', 'game_name', 'Blox Fruits',
                     'gamepass_id', :pass1, 'product_name', 'Dragon', 'price', 150, 'robux_amount', 2500), :'rcid') as rec1 \gset
select pg_temp.ok(
  (select kind = 'product' and sender_role = 'admin' and payload ->> 'gamepass_id' = :pass1 and body like 'Recommended: Dragon%'
     from store_order_messages where id = :'rec1')
  and (select last_message_kind = 'product' and last_message_preview = 'Recommended: Dragon'
     from store_order_conversations where order_number = :'gi'),
  'an admin sends a product card; the inbox preview names it');
select pg_temp.ok(store_send_recommendation(:'gi', :robert,
  jsonb_build_object('type', 'product', 'game_id', :game1, 'game_slug', 'blox-fruits', 'game_name', 'Blox Fruits',
                     'gamepass_id', :pass1, 'product_name', 'Dragon', 'price', 150, 'robux_amount', 2500), :'rcid') = :'rec1',
  'a retry returns the same card');
select pg_temp.raises(format($q$select store_send_recommendation(%L, %L, jsonb_build_object('type', 'product', 'game_id', %L,
    'game_slug', 'blox-fruits', 'game_name', 'Blox Fruits', 'gamepass_id', %L, 'product_name', 'Other', 'price', 1), %L)$q$,
    :'gi', :robert, :game1, :pass2, :'rcid'),
  'BW010', 'the same client id for another product is refused');
select pg_temp.raises(format($q$select store_send_recommendation(%L, %L, jsonb_build_object('type', 'game', 'game_id', %L,
    'game_slug', 'blox-fruits', 'game_name', 'Blox Fruits'), gen_random_uuid())$q$, :'gi', :cu, :game1),
  '42501', 'a customer cannot send a product card');
select pg_temp.raises(format($q$select store_send_recommendation(%L, %L, jsonb_build_object('type', 'game', 'game_id', %L,
    'game_slug', 'blox-fruits', 'game_name', 'Blox Fruits', 'url', 'https://evil.test'), gen_random_uuid())$q$, :'gi', :robert, :game1),
  '22023', 'no URL (or any unknown field) is accepted');
select pg_temp.raises(format($q$select store_send_recommendation(%L, %L, jsonb_build_object('type', 'game', 'game_id', %L,
    'game_slug', '../../evil', 'game_name', 'Blox Fruits'), gen_random_uuid())$q$, :'gi', :robert, :game1),
  '22023', 'the game slug must be a plain catalog slug');
select pg_temp.raises(format($q$select store_send_recommendation(%L, %L, jsonb_build_object('type', 'product', 'game_id', %L,
    'game_slug', 'blox-fruits', 'game_name', 'Blox Fruits', 'gamepass_id', %L, 'product_name', 'X', 'price', '150'), gen_random_uuid())$q$,
    :'gi', :robert, :game1, :pass1),
  '22023', 'a product card needs a numeric price');
select store_send_recommendation(:'gi', :robert,
  jsonb_build_object('type', 'game', 'game_id', :game2, 'game_slug', 'pet-sim', 'game_name', 'Pet Sim'), gen_random_uuid()) as recg \gset
select store_send_recommendation(:'gv', :robert,
  jsonb_build_object('type', 'product', 'game_id', :game1, 'game_slug', 'blox-fruits', 'game_name', 'Blox Fruits',
                     'gamepass_id', :pass1, 'product_name', 'Dragon', 'price', 150), gen_random_uuid()) as recv \gset
select pg_temp.ok((select last_message_preview = 'Pricelist: Pet Sim' from store_order_conversations where order_number = :'gi'),
  'a pricelist card previews as the game');

select pg_temp.new_order('BW-UNI003', 150, :game1, :pass1);
select store_attach_order_to_customer('BW-UNI003', :cu, 'SLIP THREE', 'Uni Customer', :'rec1') as att3 \gset
select pg_temp.ok(:'att3'::jsonb ->> 'recommendation_id' = :'rec1'
  and exists (select 1 from store_order_recommendations where order_number = 'BW-UNI003' and message_id = :'rec1'),
  'an order containing the recommended product is linked to that card');
select pg_temp.new_order('BW-UNI004', 320, :game2, :pass2);
select store_attach_order_to_customer('BW-UNI004', :cu, 'SLIP FOUR', 'Uni Customer', :'rec1') as att4 \gset
select pg_temp.ok(:'att4'::jsonb ->> 'recommendation_id' is null
  and not exists (select 1 from store_order_recommendations where order_number = 'BW-UNI004'),
  'an order WITHOUT the recommended product is not linked (no fake "Order placed")');
select pg_temp.new_order('BW-UNI005', 320, :game2, :pass2);
select pg_temp.ok((store_attach_order_to_customer('BW-UNI005', :cu, 'SLIP FIVE', 'Uni Customer', :'recg') ->> 'recommendation_id') = :'recg',
  'an order with a product of the recommended game is linked to the pricelist card');
select pg_temp.new_order('BW-UNI006', 150, :game1, :pass1);
select pg_temp.ok((store_attach_order_to_customer('BW-UNI006', :cu, 'SLIP SIX', 'Uni Customer', :'recv') ->> 'recommendation_id') is null,
  'a card from another customer''s conversation never links');

\echo '--- payments stay per order / per quote (0033)'
select gen_random_uuid() as ca1 \gset
select store_send_payment_details('BW-UNI001', :robert, :'method', :'ca1') as a1 \gset
select pg_temp.ok(
  (select order_number = :'gi' and order_ref = 'BW-UNI001' and (payload ->> 'amount')::numeric = 150
          and payload ->> 'order_number' = 'BW-UNI001' and body like '%for order BW-UNI001%'
     from store_order_messages where id = :'a1'),
  'an order''s card goes into the conversation, tagged with that order and its total');
select store_send_payment_details('BW-UNI002', :robert, :'method', gen_random_uuid()) as b1 \gset
select store_send_inquiry_payment_details(:'gi', :robert, :'method', 77, gen_random_uuid()) as q1 \gset
select store_send_payment_details('BW-UNI002', :robert, :'method', gen_random_uuid()) as b2 \gset
select pg_temp.ok(
  (select order_ref = 'BW-UNI002' and (payload ->> 'amount')::numeric = 320 from store_order_messages where id = :'b2')
  and (select order_ref is null and (payload ->> 'amount')::numeric = 77 from store_order_messages where id = :'q1'),
  'each card keeps its own order (or none, for a quote) and amount');
select pg_temp.raises(format($q$select store_send_payment_details('BW-UNI002', %L, %L, %L)$q$, :robert, :'method', :'ca1'),
  'BW010', 'a client id reused for another order''s card is refused');
select pg_temp.raises(format($q$select store_confirm_payment(%L, %L, %L)$q$, :'gi', :'b1', :robert),
  'BW020', 'an order''s older card is superseded by ITS newer card');
select pg_temp.ok((store_confirm_payment(:'gi', :'a1', :robert) ->> 'created')::boolean,
  'order 1''s card can be confirmed although newer cards exist for other things');
select pg_temp.ok(
  (select payment_received_message_id = :'a1' and payment_request_message_id = :'b2'
     from store_order_conversations where order_number = :'gi'),
  'the conversation still awaits the newest unpaid card (no false "Paid")');
select pg_temp.ok((store_confirm_payment('BW-UNI002', :'b2', :robert) ->> 'created')::boolean,
  'a linked order''s number resolves to its conversation');
select pg_temp.ok((store_confirm_payment(:'gi', :'q1', :andre) ->> 'created')::boolean, 'the quote is confirmed separately');
select pg_temp.ok((select payment_received_message_id = :'q1' and payment_request_message_id = :'q1'
         from store_order_conversations where order_number = :'gi'),
  'with every card confirmed the conversation reads Paid');
select pg_temp.ok(
  (select order_ref = 'BW-UNI001' and amount = 150 from store_payment_confirmations where message_id = :'a1')
  and (select order_ref = 'BW-UNI002' and amount = 320 from store_payment_confirmations where message_id = :'b2')
  and (select order_ref is null and amount = 77 from store_payment_confirmations where message_id = :'q1')
  and not exists (select 1 from store_payment_confirmations where message_id = :'b1'),
  'confirmations record exactly which order (or quote) and amount they were for');
select pg_temp.ok(
  (select count(*) = 3 from store_chat_audit_log where action = 'payment.confirmed' and order_number = :'gi')
  and exists (select 1 from store_chat_audit_log where action = 'payment.confirmed' and subject_id = :'a1'
                and details ->> 'order_ref' = 'BW-UNI001'),
  'each confirmation is audited with its order');

\echo '--- an older order (own chat) next to the same customer''s conversation (0033)'
-- Placed on the pre-0033 flow: owner + slip in its own chat.
select pg_temp.new_order('BW-UNILEG', 210, :game1, :pass1);
update store_order_snapshots set owner_user_id = :cu where order_number = 'BW-UNILEG';
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
  values ('BW-UNILEG', 'customer', :cu, 'slip', 'LEGACY SLIP');
create temp table gi_pay_before as
  select payment_request_message_id, payment_received_message_id from store_order_conversations where order_number = :'gi';
select store_send_payment_details('BW-UNILEG', :robert, :'method', gen_random_uuid()) as leg1 \gset
select pg_temp.ok(
  (select order_number = 'BW-UNILEG' and order_ref is null and (payload ->> 'amount')::numeric = 210 and not payload ? 'order_number'
     from store_order_messages where id = :'leg1'),
  'an older order''s card stays in its own chat, untagged, with its own total');
select pg_temp.ok((store_confirm_payment('BW-UNILEG', :'leg1', :robert) ->> 'created')::boolean, 'and is confirmed there');
select pg_temp.ok(
  (select c.payment_request_message_id is not distinct from b.payment_request_message_id
          and c.payment_received_message_id is not distinct from b.payment_received_message_id
     from store_order_conversations c, gi_pay_before b where c.order_number = :'gi')
  and (select payment_received_message_id = :'leg1' from store_order_conversations where order_number = 'BW-UNILEG'),
  'the customer conversation''s payment state is untouched by the older order''s payment');
select pg_temp.raises(format($q$insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, payload, order_ref)
    values (%L, 'admin', %L, 'payment', 'x', '{"amount": 1, "provider": "gcash"}', 'BW-UNILEG')$q$, :'gi', :robert),
  'BW031', 'an older order''s card can never be posted into the conversation');
select pg_temp.raises(format($q$select store_confirm_payment(%L, %L, %L)$q$, :'gi', :'leg1', :robert),
  'P0002', 'a card is only confirmable from the chat it is in');

\echo '--- fulfillment and My Orders (0033)'
truncate realtime.messages;
select store_set_fulfillment_detail('BW-UNI001', null, null, 'account_notes', 'please deliver fast', null, :cu, 'customer');
select pg_temp.ok(
  exists (select 1 from realtime.messages r join store_order_conversations c on r.topic = 'chat:' || c.id::text
           where c.order_number = :'gi' and r.event = 'fulfillment')
  and exists (select 1 from realtime.messages where topic = 'admin:inbox' and event = 'fulfillment'
                and payload ->> 'order_number' = :'gi' and payload ->> 'order_ref' = 'BW-UNI001'),
  'fulfillment changes are announced on the customer conversation');
select pg_temp.ok(
  (select count(*) = 6 and bool_and(t.home_key = :'gi') and bool_and(o.unread_count = 0)
     from store_customer_orders(:cu, 'open') o join store_chat_threads t on t.key = o.order_number
    where o.order_number like 'BW-UNI00%'),
  'My Orders lists every order (each still its own order) opening the one conversation');
select pg_temp.ok(
  (select payment_details_sent_at is not null from store_customer_orders(:cu, 'open') where order_number = 'BW-UNI001')
  and (select payment_details_sent_at is null from store_customer_orders(:cu, 'open') where order_number = 'BW-UNI003'),
  'each order on My Orders shows whether ITS payment details were sent');
select pg_temp.ok((select count(*) filter (where order_number like 'GI-%') = 1 and count(*) = 2 from store_customer_conversations(:cu)),
  'all new orders share one conversation; only the older order keeps its own chat');

\echo '--- recovery switch (0033)'
update store_chat_settings set unified_order_chat = false;
select pg_temp.new_order('BW-UNIOFF', 50, :game1, :pass1);
select store_attach_order_to_customer('BW-UNIOFF', :cu, 'SLIP OFF', 'Uni Customer', null) as attoff \gset
select pg_temp.ok(:'attoff'::jsonb ->> 'chat_key' = 'BW-UNIOFF' and not (:'attoff'::jsonb ->> 'unified')::boolean
  and (select home_key is null from store_chat_threads where key = 'BW-UNIOFF')
  and (select count(*) = 1 from store_order_messages where order_number = 'BW-UNIOFF' and kind = 'slip' and order_ref is null),
  'switch off: a new order gets its own chat with its slip, exactly as before 0033');
select pg_temp.ok((store_attach_order_to_customer('BW-UNIOFF', :cu, 'SLIP OFF', 'Uni Customer', null) ->> 'chat_key') = 'BW-UNIOFF'
  and (select count(*) = 1 from store_order_messages where order_number = 'BW-UNIOFF' and kind = 'slip'),
  'switch off: a replay posts no second slip');
select pg_temp.ok(store_post_message(:'gi', 'customer', :cu, 'text', 'still here', null, null, gen_random_uuid()) is not null
  and (store_attach_order_to_customer('BW-UNI001', :cu, 'SLIP ONE', 'Uni Customer', null) ->> 'chat_key') = :'gi',
  'switch off: the existing conversation and its linked orders keep working');
update store_chat_settings set unified_order_chat = true;
select pg_temp.ok((store_attach_order_to_customer('BW-UNIOFF', :cu, 'SLIP OFF', 'Uni Customer', null) ->> 'chat_key') = 'BW-UNIOFF',
  'switch back on: an order that already has its own chat never moves');

\echo '--- older chats and XOB are untouched (0033)'
select pg_temp.ok((store_attach_order_to_customer('BW-AAAAAA', '00000000-0000-0000-0000-0000000000c1', 'x', null, null) ->> 'chat_key') = 'BW-AAAAAA',
  'an order placed before 0033 keeps its own chat');
select pg_temp.ok(
  (select count(*) from legacy_msgs_before_0033 b join store_order_messages m using (id)
     where m.order_number = b.order_number and m.body = b.body) = (select count(*) from legacy_msgs_before_0033),
  'every earlier message is still where it was');
select pg_temp.ok(
  (select count(*) from orders o join xob_before_0033 b on b.id = o.id where o.status is distinct from b.status) = 0,
  'XOB order statuses are never written');

\echo 'ALL 0033 DATABASE TESTS PASSED'
