-- Tests for 0027 (Payment Received). Runs after 0026 + 0027.
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
\set custa  '''00000000-0000-0000-0000-0000000000c1'''

\echo '--- setup: an order chat, a payment account (0027)'
insert into store_order_snapshots (order_number, idempotency_key, request_fingerprint, view_token_hash,
  buyer_name, buyer_roblox_username, total_amount, owner_user_id)
values ('BW-PAY027', 'idem-pay-0027-000000000', repeat('e', 64), repeat('e', 64), 'Pay Buyer', 'payRBX', 250, :custa);
insert into orders (order_number, buyer_name, buyer_roblox_username, status)
values ('BW-PAY027', 'Pay Buyer', 'payRBX', 'pending');
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
values ('BW-PAY027', 'customer', :custa, 'slip', 'ORDER SLIP PAY');
select (store_save_payment_method(:robert, null, 'GCash', 'B W Store', '09170000027', null, true)).id as method \gset
create temp table xob_before_0027 as select id, status from orders;
select id as conv from store_order_conversations where order_number = 'BW-PAY027' \gset

select pg_temp.ok(
  (select payment_request_message_id is null and payment_received_message_id is null
     from store_order_conversations where order_number = 'BW-PAY027'),
  'a chat without payment details has nothing to confirm');
select pg_temp.ok(
  (select count(*) from store_order_conversations c
     where c.payment_request_message_id is distinct from (
       select m.id from store_order_messages m where m.order_number = c.order_number and m.kind = 'payment'
        order by m.created_at desc, m.id desc limit 1)) = 0,
  'existing chats were backfilled with their latest payment card');

\echo '--- refusals'
select pg_temp.raises(format($q$select store_confirm_payment('BW-PAY027', gen_random_uuid(), %L)$q$, :robert), 'P0002',
  'confirming before payment details were sent is refused');
select store_send_payment_details('BW-PAY027', :robert, :'method', gen_random_uuid()) as pay1 \gset
select pg_temp.ok((select payment_request_message_id = :'pay1' from store_order_conversations where order_number = 'BW-PAY027'),
  'the payment card becomes the one awaiting confirmation');
select pg_temp.raises(format($q$select store_confirm_payment('BW-PAY027', %L, %L)$q$, :'pay1', :custa), '42501',
  'a customer cannot confirm a payment');
select pg_temp.raises(format($q$select store_confirm_payment('BW-PAY027', %L, null)$q$, :'pay1'), '42501',
  'a missing actor cannot confirm a payment');
select pg_temp.raises(format($q$select store_confirm_payment('BW-AAAAAA', %L, %L)$q$, :'pay1', :robert), 'P0002',
  'a payment card cannot be confirmed through another order');
select pg_temp.raises(format($q$select store_confirm_payment('GI-00000000', %L, %L)$q$, :'pay1', :robert), 'P0002',
  'General Inquiry chats have no payment confirmation');
select (store_post_message('BW-PAY027', 'customer', :custa, 'image', 'my receipt', 'BW-PAY027/x/receipt.jpg', 'image/jpeg', gen_random_uuid())
        -> 'message' ->> 'id') as receipt \gset
select pg_temp.raises(format($q$select store_confirm_payment('BW-PAY027', %L, %L)$q$, :'receipt', :robert), 'P0002',
  'a customer receipt can never be confirmed as a payment');
select pg_temp.ok((select count(*) from store_payment_confirmations where order_number = 'BW-PAY027') = 0
  and (select payment_received_message_id is null from store_order_conversations where order_number = 'BW-PAY027'),
  'uploading a receipt does not mark the payment received');

\echo '--- several payment cards: only the latest can be confirmed'
select store_send_payment_details('BW-PAY027', :robert, :'method', gen_random_uuid()) as pay2 \gset
select pg_temp.ok((select payment_request_message_id = :'pay2' from store_order_conversations where order_number = 'BW-PAY027'),
  'newer payment details replace the card awaiting confirmation');
select pg_temp.raises(format($q$select store_confirm_payment('BW-PAY027', %L, %L)$q$, :'pay1', :robert), 'BW020',
  'an older (replaced) payment card cannot be confirmed');

\echo '--- confirm'
truncate realtime.messages;
select store_confirm_payment('BW-PAY027', :'pay2', :robert) as first \gset
select pg_temp.ok((:'first'::jsonb ->> 'created')::boolean
  and (:'first'::jsonb -> 'confirmation' ->> 'confirmed_by') = :robert
  and (:'first'::jsonb -> 'confirmation' ->> 'amount')::numeric = 250,
  'the admin confirms the latest card, with the order amount');
select pg_temp.ok(
  (select payment_received_message_id = :'pay2' and payment_received_by = :robert and payment_received_at is not null
     and state = 'active'
     from store_order_conversations where order_number = 'BW-PAY027'),
  'the conversation records which card, who and when');
select pg_temp.ok(
  (select count(*) = 1 and bool_and(actor_user_id = :robert and subject_id = :'pay2'
                                    and (details ->> 'amount')::numeric = 250)
     from store_chat_audit_log where action = 'payment.confirmed' and order_number = 'BW-PAY027'),
  'one audit row names the admin, the card and the amount');
select pg_temp.ok(
  (select count(*) from orders o join xob_before_0027 b on b.id = o.id where o.status is distinct from b.status) = 0
  and (select status from orders where order_number = 'BW-PAY027') = 'pending',
  'XOB orders.status is untouched');
select pg_temp.ok(
  exists (select 1 from realtime.messages where topic = 'chat:' || :'conv' and event = 'payment' and payload = '{}'::jsonb)
  and exists (select 1 from realtime.messages where topic = 'admin:inbox' and event = 'conversation'
                and payload ->> 'payment_received_message_id' = :'pay2'
                and payload ->> 'payment_received_by' = :robert),
  'the customer gets an empty ping; admins get the confirmed state live');
select pg_temp.ok(
  not exists (select 1 from realtime.messages where event = 'message')
  and not exists (select 1 from realtime.messages where topic like 'chat:%' and payload::text like '%' || :robert || '%'),
  'no new message (unread counts unchanged) and no admin id on the customer topic');
select pg_temp.ok(
  (select payment_request_message_id = :'pay2' and payment_received_message_id = :'pay2' and payment_received_by = :robert
     from store_admin_inbox(:andre, p_order_number => 'BW-PAY027')),
  'every admin''s inbox row shows the confirmed payment');

\echo '--- idempotent'
truncate realtime.messages;
select store_confirm_payment('BW-PAY027', :'pay2', :andre) as again \gset
select pg_temp.ok(not (:'again'::jsonb ->> 'created')::boolean
  and (:'again'::jsonb -> 'confirmation' ->> 'confirmed_by') = :robert,
  'a second confirmation (another admin, a retry) returns the first one');
select pg_temp.ok(
  (select count(*) from store_payment_confirmations where message_id = :'pay2') = 1
  and (select count(*) from store_chat_audit_log where action = 'payment.confirmed' and order_number = 'BW-PAY027') = 1
  and (select payment_received_by = :robert from store_order_conversations where order_number = 'BW-PAY027')
  and not exists (select 1 from realtime.messages),
  'no duplicate row, audit entry or realtime event');
select pg_temp.raises(format($q$insert into store_payment_confirmations (message_id, order_number, amount, provider, account_number) values (%L, 'BW-PAY027', 1, 'gcash', 'x')$q$, :'pay2'),
  '23505', 'the database itself allows one confirmation per card');

\echo '--- after confirmation'
select store_post_message('BW-PAY027', 'customer', :custa, 'text', 'thanks!', null, null, gen_random_uuid());
select store_send_payment_details('BW-PAY027', :robert, :'method', gen_random_uuid()) as pay3 \gset
select pg_temp.ok(
  (select payment_request_message_id = :'pay3' and payment_received_message_id = :'pay2'
     from store_order_conversations where order_number = 'BW-PAY027')
  and exists (select 1 from store_payment_confirmations where message_id = :'pay2'),
  'new payment details after a confirmation read as unpaid; the earlier confirmation stays');
select store_set_conversation_state('BW-PAY027', :robert, 'done',
  (select id from store_order_messages where order_number = 'BW-PAY027' order by created_at desc, id desc limit 1));
select store_set_conversation_state('BW-PAY027', :robert, 'active', null);
select pg_temp.ok(
  (select state = 'active' and payment_received_message_id = :'pay2' from store_order_conversations where order_number = 'BW-PAY027'),
  'Done / Reopen keep the payment state');

\echo '--- browsers'
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
select pg_temp.raises(format($q$select store_confirm_payment('BW-PAY027', %L, %L)$q$, :'pay3', :robert), '42501',
  'browsers cannot call store_confirm_payment, even as an admin');
select pg_temp.raises($q$select * from store_payment_confirmations$q$, '42501',
  'browsers cannot read confirmations');
select set_config('request.jwt.claim.sub', '', false);
reset role;

\echo 'PASSED 29_payment_received_test'
