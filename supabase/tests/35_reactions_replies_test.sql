-- Tests for 0032 (message reactions, replies). Runs after 0031 + 0032.
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
\set custr   '''00000000-0000-0000-0000-0000000000e1'''
\set custx   '''00000000-0000-0000-0000-0000000000e2'''

insert into auth.users (id, email) values (:custr, 'custr@x.test'), (:custx, 'custx@x.test') on conflict do nothing;
insert into store_order_snapshots (order_number, idempotency_key, request_fingerprint, view_token_hash,
  buyer_name, buyer_roblox_username, total_amount, owner_user_id)
values ('BW-RCT032', 'idem-rct-0032-000000000', repeat('5', 64), repeat('5', 64), 'React Buyer', 'rctRBX', 99, :custr),
       ('BW-OTH032', 'idem-oth-0032-000000000', repeat('5', 64), repeat('5', 64), 'Other Buyer', 'othRBX', 99, :custx);
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
values ('BW-RCT032', 'customer', :custr, 'slip', 'SLIP'), ('BW-OTH032', 'customer', :custx, 'slip', 'SLIP');
select (store_post_message('BW-RCT032', 'admin', :robert, 'text', 'Hello! How can we help?', null, null, gen_random_uuid())
        -> 'message' ->> 'id') as hello \gset
select (store_post_message('BW-OTH032', 'customer', :custx, 'text', 'Other chat secret', null, null, gen_random_uuid())
        -> 'message' ->> 'id') as other \gset

\echo '--- replies (0032)'
select gen_random_uuid() as cid \gset
select (store_post_message('BW-RCT032', 'customer', :custr, 'text', 'How long is delivery?', null, null, :'cid', :'hello')
        -> 'message') as reply \gset
select pg_temp.ok((:'reply'::jsonb ->> 'reply_to_message_id') = :'hello', 'a customer reply stores the reference');
select pg_temp.ok((store_post_message('BW-RCT032', 'customer', :custr, 'text', 'How long is delivery?', null, null, :'cid', :'hello')
                   -> 'message' ->> 'id') = (:'reply'::jsonb ->> 'id'),
  'a retry with the same client id returns the same reply');
select pg_temp.raises(format($q$select store_post_message('BW-RCT032', 'customer', %L, 'text', 'How long is delivery?', null, null, %L, null)$q$, :custr, :'cid'),
  'BW010', 'the same client id with a different reply target is refused');
select pg_temp.raises(format($q$select store_post_message('BW-RCT032', 'customer', %L, 'text', 'peek', null, null, gen_random_uuid(), %L)$q$, :custr, :'other'),
  'P0002', 'a reply can never quote a message from another customer''s chat');
select pg_temp.raises(format($q$select store_post_message('BW-RCT032', 'customer', %L, 'text', 'ghost', null, null, gen_random_uuid(), gen_random_uuid())$q$, :custr),
  'P0002', 'a reply to a nonexistent message is refused');
select pg_temp.raises(format($q$insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, reply_to_message_id) values ('BW-RCT032', 'admin', %L, 'text', 'x', %L)$q$, :robert, :'other'),
  'P0002', 'even a direct insert cannot cross conversations (trigger)');
select pg_temp.ok(store_post_message('BW-RCT032', 'admin', :andre, 'text', 'Usually 5 minutes!', null, null, gen_random_uuid(), (:'reply'::jsonb ->> 'id')::uuid) is not null,
  'an admin can reply to the customer''s message');
select pg_temp.ok(
  (select last_admin_reply_by = :andre and last_customer_message_id = (:'reply'::jsonb ->> 'id')::uuid
     from store_order_conversations where order_number = 'BW-RCT032'),
  'replies follow the normal Needs reply / Replied by rules');
select pg_temp.ok(
  (select count(*) from store_chat_messages_page('BW-RCT032', null, null, 50) where reply_to_message_id is not null) = 2,
  'the chat page returns the reply references (survive refresh)');

\echo '--- reactions (0032)'
create temp table conv_before as
  select row_to_json(c)::jsonb - 'updated_at' as row from store_order_conversations c where order_number = 'BW-RCT032';
create temp table inbox_before as
  select unread_count, last_admin_reply_id, last_customer_message_id, viewed_by, state, assigned_admin_id
    from store_admin_inbox(:robert, p_order_number => 'BW-RCT032');
truncate realtime.messages;
select store_set_reaction('BW-RCT032', :'hello', :custr, 'customer', 'love') as s1 \gset
select pg_temp.ok((:'s1'::jsonb -> 'counts' ->> 'love')::int = 1 and :'s1'::jsonb ->> 'customer' = 'love',
  'the customer reacts with love');
select pg_temp.ok(
  exists (select 1 from realtime.messages where topic like 'chat:%' and event = 'reaction'
            and payload ->> 'message_id' = :'hello' and payload -> 'counts' ->> 'love' = '1')
  and exists (select 1 from realtime.messages where topic = 'admin:inbox' and event = 'reaction'),
  'customer and admins get the change live');
select store_set_reaction('BW-RCT032', :'hello', :custr, 'customer', 'haha') as s2 \gset
select pg_temp.ok(not (:'s2'::jsonb -> 'counts' ? 'love') and (:'s2'::jsonb -> 'counts' ->> 'haha')::int = 1,
  'changing it replaces the old reaction (one per person per message)');
select store_set_reaction('BW-RCT032', :'hello', :robert, 'admin', 'like');
select store_set_reaction('BW-RCT032', :'hello', :andre, 'admin', 'like') as s3 \gset
select pg_temp.ok((:'s3'::jsonb -> 'counts' ->> 'like')::int = 2
  and :'s3'::jsonb -> 'admins' ->> :robert = 'like' and :'s3'::jsonb -> 'admins' ->> :andre = 'like',
  'two admins react as themselves; counts aggregate');
select pg_temp.ok(
  not exists (select 1 from realtime.messages where topic like 'chat:%'
                and (payload::text like '%' || :robert || '%' or payload::text like '%' || :andre || '%')),
  'customers never receive admin ids');
truncate realtime.messages;
select store_set_reaction('BW-RCT032', :'hello', :andre, 'admin', 'like');
select pg_temp.ok(not exists (select 1 from realtime.messages), 'repeating the same reaction sends nothing');
select store_set_reaction('BW-RCT032', :'hello', :andre, 'admin', null) as s4 \gset
select pg_temp.ok((:'s4'::jsonb -> 'counts' ->> 'like')::int = 1 and not (:'s4'::jsonb -> 'admins' ? :andre),
  'tapping again (null) removes it');
select pg_temp.raises(format($q$select store_set_reaction('BW-RCT032', %L, %L, 'customer', 'love')$q$, :'hello', :custx),
  '42501', 'another customer cannot react in this chat');
select pg_temp.raises(format($q$select store_set_reaction('BW-RCT032', %L, %L, 'admin', 'love')$q$, :'hello', :custr),
  '42501', 'a customer cannot react as an admin');
select pg_temp.raises(format($q$select store_set_reaction('BW-RCT032', %L, %L, 'customer', 'love')$q$, :'other', :custr),
  'P0002', 'a reaction cannot target a message from another chat');
select pg_temp.raises(format($q$select store_set_reaction('BW-RCT032', %L, %L, 'customer', 'angry')$q$, :'hello', :custr),
  '22023', 'only the five reactions are allowed');
select pg_temp.raises(format($q$insert into store_message_reactions (message_id, order_number, actor_user_id, actor_role, reaction) values (%L, 'BW-RCT032', %L, 'customer', 'wow')$q$, :'hello', :custr),
  '23505', 'the database prevents a second reaction by the same person');
select pg_temp.ok(
  (select row_to_json(c)::jsonb - 'updated_at' from store_order_conversations c where order_number = 'BW-RCT032') = (select row from conv_before)
  and (select (unread_count, last_admin_reply_id, last_customer_message_id, viewed_by, state, assigned_admin_id)
         from store_admin_inbox(:robert, p_order_number => 'BW-RCT032'))
      = (select (unread_count, last_admin_reply_id, last_customer_message_id, viewed_by, state, assigned_admin_id) from inbox_before),
  'reactions change nothing on the conversation: unread, replied, viewed, assignment, Done');

\echo '--- General Inquiry (0032)'
select store_open_inquiry(:custx, 'Other') as gi \gset
select (store_post_message(:'gi', 'customer', :custx, 'text', 'Hi!', null, null, gen_random_uuid()) -> 'message' ->> 'id') as gimsg \gset
select pg_temp.ok((store_post_message(:'gi', 'admin', :robert, 'text', 'Hello!', null, null, gen_random_uuid(), :'gimsg')
                   -> 'message' ->> 'reply_to_message_id') = :'gimsg',
  'replies work in General Inquiry');
select pg_temp.ok((store_set_reaction(:'gi', :'gimsg', :robert, 'admin', 'wow') -> 'counts' ->> 'wow')::int = 1
  and (store_set_reaction(:'gi', :'gimsg', :custx, 'customer', 'love') ->> 'customer') = 'love',
  'reactions work in General Inquiry for both sides');

\echo '--- browsers'
set role authenticated;
select pg_temp.raises($q$select * from store_message_reactions$q$, '42501', 'browsers cannot read reactions');
select pg_temp.raises(format($q$select store_set_reaction('BW-RCT032', %L, %L, 'customer', 'love')$q$, :'hello', :custr),
  '42501', 'browsers cannot call store_set_reaction');
reset role;

\echo 'PASSED 35_reactions_replies_test'
