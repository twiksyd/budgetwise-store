-- Tests for 0031 (GCash payment details in General Inquiry). After 0030 + 0031.
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
\set custq   '''00000000-0000-0000-0000-0000000000d1'''

insert into auth.users (id, email) values (:custq, 'custq@gmail.test') on conflict do nothing;
select store_open_inquiry(:custq, 'Quote Customer') as gi \gset
select store_post_message(:'gi', 'customer', :custq, 'text', 'How much for 1000 Robux in Some New Game?', null, null, gen_random_uuid());
insert into storage.objects (bucket_id, name) select 'store-payment-qr', 'qr/inq-0031.png'
 where exists (select 1 from storage.buckets where id = 'store-payment-qr');
select (store_save_payment_method(:robert, null, 'GCash', 'B W Store', '09170000031', null, true)).id as method \gset
create temp table snapshots_before_0031 as select order_number from store_order_snapshots;
create temp table xob_before_0031 as select id, status from orders;

\echo '--- refusals (0031)'
select pg_temp.raises(format($q$select store_send_inquiry_payment_details(%L, '00000000-0000-0000-0000-0000000000d1', %L, 100, gen_random_uuid())$q$, :'gi', :'method'),
  '42501', 'a customer cannot send payment details');
select pg_temp.raises(format($q$select store_send_inquiry_payment_details('BW-AAAAAA', %L, %L, 100, gen_random_uuid())$q$, :robert, :'method'),
  'P0002', 'the inquiry function never targets an order chat');
select pg_temp.raises(format($q$select store_send_payment_details(%L, %L, %L, gen_random_uuid())$q$, :'gi', :robert, :'method'),
  'P0002', 'the order function still refuses an inquiry (no order total to derive)');
select pg_temp.raises(format($q$select store_send_inquiry_payment_details(%L, %L, %L, %s, gen_random_uuid())$q$, :'gi', :robert, :'method', v), '22023',
  'amount ' || v || ' is refused')
  from unnest(array['0', '-5', '1000000.01', '10.005', 'null']) v;
select pg_temp.raises(format($q$select store_send_inquiry_payment_details(%L, %L, %L, 100, null)$q$, :'gi', :robert, :'method'),
  '22023', 'a client message id is required');

\echo '--- send a quote (0031)'
truncate realtime.messages;
select gen_random_uuid() as cid1 \gset
select store_send_inquiry_payment_details(:'gi', :robert, :'method', 499.5, :'cid1') as pay1 \gset
select pg_temp.ok(
  (select kind = 'payment' and sender_role = 'admin' and sender_user_id = :robert
          and (payload ->> 'amount')::numeric = 499.50 and payload ->> 'amount_source' = 'admin_quote'
          and payload ->> 'account_number' = '09170000031' and payload ->> 'currency' = 'PHP'
          and body like '%PHP 499.50%'
     from store_order_messages where id = :'pay1'),
  'the card carries exactly the amount the admin entered, and the saved account');
select pg_temp.ok(
  (select payment_details_sent_at is not null and payment_request_message_id = :'pay1' and assigned_admin_id = :robert
     from store_order_conversations where order_number = :'gi'),
  'payment request recorded; the Unassigned inquiry is now the sender''s');
select pg_temp.ok(
  (select count(*) = 1 and bool_and(details ->> 'cause' = 'payment_details' and actor_user_id = :robert)
     from store_chat_audit_log where order_number = :'gi' and action = 'conversation.assigned'),
  'the auto-assignment is audited');
select pg_temp.ok(
  exists (select 1 from realtime.messages where topic = 'admin:inbox' and event = 'message' and payload ->> 'order_number' = :'gi')
  and exists (select 1 from realtime.messages where topic = 'admin:inbox' and event = 'conversation'
                and payload ->> 'order_number' = :'gi' and payload ->> 'assigned_admin_id' = :robert)
  and exists (select 1 from realtime.messages where topic like 'chat:%' and event = 'message')
  and not exists (select 1 from realtime.messages where topic like 'chat:%' and payload::text like '%qr_path%'),
  'admins and the customer get it live; no QR path on the wire');
select pg_temp.ok(store_send_inquiry_payment_details(:'gi', :robert, :'method', 499.5, :'cid1') = :'pay1'
  and (select count(*) from store_order_messages where order_number = :'gi' and kind = 'payment') = 1,
  'a retry with the same client id returns the same card (no duplicate)');
select pg_temp.raises(format($q$select store_send_inquiry_payment_details(%L, %L, %L, 500, %L)$q$, :'gi', :robert, :'method', :'cid1'),
  'BW010', 'the same client id with a different amount is refused');
select pg_temp.ok(
  (select count(*) from store_order_snapshots) = (select count(*) from snapshots_before_0031)
  and not exists (select 1 from store_order_snapshots where order_number = :'gi')
  and (select count(*) from orders o join xob_before_0031 b on b.id = o.id where o.status is distinct from b.status) = 0
  and (select count(*) from orders) = (select count(*) from xob_before_0031),
  'no order or order snapshot is created; XOB orders untouched');

\echo '--- newer quote, receipts, Payment Received (0031)'
select store_send_inquiry_payment_details(:'gi', :andre, :'method', 520, gen_random_uuid()) as pay2 \gset
select pg_temp.ok((select assigned_admin_id = :robert and payment_request_message_id = :'pay2'
                     from store_order_conversations where order_number = :'gi'),
  'a second quote by another admin keeps the assignment and becomes the card to confirm');
select (store_post_message(:'gi', 'customer', :custq, 'image', 'receipt', :'gi' || '/x/receipt.jpg', 'image/jpeg', gen_random_uuid())
        -> 'message' ->> 'id') as receipt \gset
select pg_temp.ok((select payment_received_message_id is null from store_order_conversations where order_number = :'gi')
  and not exists (select 1 from store_payment_confirmations where order_number = :'gi'),
  'a customer receipt never confirms anything');
select pg_temp.raises(format($q$select store_confirm_payment(%L, %L, %L)$q$, :'gi', :'receipt', :robert), 'P0002',
  'a receipt cannot be confirmed as a payment');
select pg_temp.raises(format($q$select store_confirm_payment(%L, %L, %L)$q$, :'gi', :'pay1', :robert), 'BW020',
  'the older quote cannot be confirmed once a newer one was sent');
select pg_temp.raises(format($q$select store_confirm_payment(%L, %L, '00000000-0000-0000-0000-0000000000d1')$q$, :'gi', :'pay2'), '42501',
  'a customer cannot confirm');
truncate realtime.messages;
select store_confirm_payment(:'gi', :'pay2', :andre) as confirmed \gset
select pg_temp.ok((:'confirmed'::jsonb ->> 'created')::boolean
  and (:'confirmed'::jsonb -> 'confirmation' ->> 'amount')::numeric = 520,
  'Payment Received for the inquiry quote, with the quoted amount');
select pg_temp.ok(
  (select payment_received_message_id = :'pay2' and payment_received_by = :andre from store_order_conversations where order_number = :'gi')
  and exists (select 1 from store_chat_audit_log where action = 'payment.confirmed' and order_number = :'gi' and subject_id = :'pay2')
  and exists (select 1 from realtime.messages where topic like 'chat:%' and event = 'payment' and payload = '{}'::jsonb),
  'recorded, audited, and the customer gets the empty payment ping');
select pg_temp.ok(not (store_confirm_payment(:'gi', :'pay2', :robert) ->> 'created')::boolean
  and (select count(*) from store_payment_confirmations where message_id = :'pay2') = 1,
  'confirming again returns the first confirmation');
select pg_temp.ok(
  (select payment_request_message_id = :'pay2' and payment_received_message_id = :'pay2'
     from store_admin_inbox(:robert, p_order_number => :'gi')),
  'the inbox row shows Paid for the inquiry');

\echo '--- order chats unchanged (0031)'
insert into store_order_snapshots (order_number, idempotency_key, request_fingerprint, view_token_hash,
  buyer_name, buyer_roblox_username, total_amount, owner_user_id)
values ('BW-ORD031', 'idem-ord-0031-000000000', repeat('6', 64), repeat('6', 64), 'Order Buyer', 'ordRBX', 275, :custq);
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
values ('BW-ORD031', 'customer', :custq, 'slip', 'SLIP');
select store_send_payment_details('BW-ORD031', :robert, :'method', gen_random_uuid()) as opay \gset
select pg_temp.ok((select (payload ->> 'amount')::numeric = 275 and payload ->> 'amount_source' is null
                     from store_order_messages where id = :'opay'),
  'order payment cards still use the order total');
select pg_temp.ok((store_confirm_payment('BW-ORD031', :'opay', :robert) ->> 'created')::boolean,
  'order payments are still confirmed as before');

\echo '--- browsers'
set role authenticated;
select pg_temp.raises(format($q$select store_send_inquiry_payment_details(%L, %L, %L, 1, gen_random_uuid())$q$, :'gi', :robert, :'method'),
  '42501', 'browsers cannot call the inquiry payment function');
reset role;

\echo 'PASSED 34_inquiry_payment_test'
