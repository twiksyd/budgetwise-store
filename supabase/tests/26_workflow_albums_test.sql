-- Tests for 0024 (conversation workflow Active/Done, image albums,
-- customer realtime topic).
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

-- What the upload route leaves in storage for an album (both files per image).
create or replace function pg_temp.put_files(items jsonb, age interval default interval '1 minute') returns void
language sql as $$
  insert into storage.objects (bucket_id, name, created_at)
  select 'order-chat-attachments', f, now() - age
    from jsonb_array_elements(items) a, lateral (values (a ->> 'path'), (a ->> 'thumb_path')) v(f)
$$;
insert into storage.buckets (id, name, public) values ('order-chat-attachments', 'order-chat-attachments', false)
  on conflict (id) do nothing;

\set robert '''00000000-0000-0000-0000-0000000000a1'''
\set andre  '''00000000-0000-0000-0000-0000000000a2'''
\set custa  '''00000000-0000-0000-0000-0000000000c1'''
\set custb  '''00000000-0000-0000-0000-0000000000c2'''

\echo '--- workflow state (0024)'
select pg_temp.ok(
  (select bool_and(state = 'active' and done_at is null) from store_order_conversations)
  and (select count(*) from store_order_conversations) > 0,
  'every existing conversation starts Active');
select pg_temp.ok(
  (select count(*) from orders where status is not null) = (select count(*) from orders),
  'precondition: XOB orders exist');
create temp table xob_before as select id, status from orders;

-- Mark Done needs the newest message the admin saw.
select m.id as last_a from store_order_messages m where order_number = 'BW-AAAAAA'
 order by created_at desc, id desc limit 1 \gset
truncate realtime.messages;
select store_set_conversation_state('BW-AAAAAA', :robert, 'done', :'last_a');
select pg_temp.ok(
  (select state = 'done' and done_by = :robert and done_at is not null from store_order_conversations where order_number = 'BW-AAAAAA'),
  'admin marks Done: state, who and when stored');
select pg_temp.ok(
  (select count(*) from store_chat_audit_log where action = 'conversation.done' and actor_user_id = :robert
     and order_number = 'BW-AAAAAA' and details->>'cause' = 'admin') = 1,
  'Done is audited with the admin');
select pg_temp.ok(
  (select count(*) from realtime.messages where topic = 'admin:inbox' and event = 'conversation' and payload->>'state' = 'done') = 1,
  'all admins get the state change in realtime');
select pg_temp.ok(
  (select count(*) from realtime.messages where topic like 'chat:%' and event = 'state' and payload->>'state' = 'done') = 1
  and (select count(*) from realtime.messages where topic = 'customer:' || :custa and event = 'conversation' and payload->>'state' = 'done') = 1,
  'the customer''s chat and customer topic get it too');
select pg_temp.ok(
  (select count(*) from realtime.messages where topic = 'customer:' || :custb) = 0,
  'another customer''s topic gets nothing');

-- Idempotent: a second admin clicking Done at the same time.
select store_set_conversation_state('BW-AAAAAA', :andre, 'done', :'last_a');
select pg_temp.ok(
  (select done_by = :robert from store_order_conversations where order_number = 'BW-AAAAAA')
  and (select count(*) from store_chat_audit_log where action = 'conversation.done') = 1,
  'Done twice is a no-op (first actor kept, one audit row)');

-- Filters.
select pg_temp.ok(
  (select count(*) from store_admin_inbox(:robert, 'active') where order_number = 'BW-AAAAAA') = 0
  and (select count(*) from store_admin_inbox(:robert, 'done') where order_number = 'BW-AAAAAA') = 1
  and (select count(*) from store_admin_inbox(:robert, 'all') where order_number = 'BW-AAAAAA') = 1,
  'Done leaves Active, appears in Done and All');
select pg_temp.ok(
  (select count(*) from store_admin_inbox(:robert, 'done', '%Juan%') where order_number = 'BW-AAAAAA') = 1,
  'Done conversations stay searchable');
select pg_temp.ok(
  (select state = 'done' from store_admin_inbox(:robert, 'all', null, null, null, 30, 'BW-AAAAAA')),
  'single-row lookup returns the state');
select pg_temp.ok(
  (select count(*) from store_order_messages where order_number = 'BW-AAAAAA') >= 3,
  'messages are kept');

-- Customer view.
select pg_temp.ok(
  (select state = 'done' from store_customer_conversations(:custa) where order_number = 'BW-AAAAAA'),
  'customer conversations carry the state (Completed)');
select pg_temp.ok(
  (select count(*) from store_customer_orders(:custa, 'completed') where order_number = 'BW-AAAAAA') = 1
  and (select count(*) from store_customer_orders(:custa, 'open') where order_number = 'BW-AAAAAA') = 0,
  'My Orders: the order moves to the Completed section');
select pg_temp.ok(
  (select count(*) from store_customer_orders(:custb, 'completed')) = 0,
  'customer B sees none of A''s orders');

-- A customer message reopens it automatically.
truncate realtime.messages;
select (store_post_message('BW-AAAAAA', 'customer', :custa, 'text', 'Hello po?', null, null, gen_random_uuid()) -> 'message' ->> 'id') as reopen_msg \gset
select pg_temp.ok(
  (select state = 'active' and done_at is null and done_by is null and reopened_by = :custa and reopened_at is not null
     from store_order_conversations where order_number = 'BW-AAAAAA'),
  'a customer message reopens a Done conversation');
select pg_temp.ok(
  (select count(*) from store_chat_audit_log where action = 'conversation.reopened'
     and details->>'cause' = 'customer_message' and details->>'message_id' = :'reopen_msg' and actor_user_id = :custa) = 1,
  'automatic reopen is audited as caused by the customer''s message');
select pg_temp.ok(
  (select count(*) from realtime.messages where topic = 'admin:inbox' and event = 'conversation' and payload->>'state' = 'active') = 1
  and (select count(*) from realtime.messages where topic = 'admin:inbox' and event = 'message' and payload->'row'->>'state' = 'active') = 1,
  'admins get the reopen and the new message in realtime');
select pg_temp.ok(
  (select unread_count > 0 from store_admin_inbox(:robert, 'active') where order_number = 'BW-AAAAAA'),
  'it is back in Active with unread for the admins');
select pg_temp.ok(
  (select count(*) from store_customer_orders(:custa, 'open') where order_number = 'BW-AAAAAA') = 1,
  'customer side: back In progress');

-- An admin message to a Done conversation does NOT reopen it.
select m.id as last_a from store_order_messages m where order_number = 'BW-AAAAAA'
 order by created_at desc, id desc limit 1 \gset
select store_set_conversation_state('BW-AAAAAA', :robert, 'done', :'last_a');
select store_post_message('BW-AAAAAA', 'admin', :robert, 'text', 'Thank you po!', null, null, gen_random_uuid());
select pg_temp.ok(
  (select state = 'done' from store_order_conversations where order_number = 'BW-AAAAAA'),
  'a BudgetWise message after Done keeps it Done');

-- Manual reopen.
select store_set_conversation_state('BW-AAAAAA', :andre, 'active', null);
select pg_temp.ok(
  (select state = 'active' and reopened_by = :andre from store_order_conversations where order_number = 'BW-AAAAAA')
  and (select count(*) from store_chat_audit_log where action = 'conversation.reopened' and actor_user_id = :andre
         and details->>'cause' = 'admin') = 1,
  'manual reopen: state, who, when, audited');

-- Simultaneous action: a customer message the admin never saw blocks Done.
select m.id as seen from store_order_messages m where order_number = 'BW-AAAAAA'
 order by created_at desc, id desc limit 1 \gset
select store_post_message('BW-AAAAAA', 'customer', :custa, 'text', 'one more thing', null, null, gen_random_uuid());
select pg_temp.raises(format($q$select store_set_conversation_state('BW-AAAAAA', %L, 'done', %L)$q$, :robert, :'seen'),
  'BW011', 'Done is refused when a newer customer message arrived');
select pg_temp.ok(
  (select state = 'active' from store_order_conversations where order_number = 'BW-AAAAAA'),
  '... and the conversation stays Active');

-- Only admins; nobody can choose arbitrary states.
select pg_temp.raises(format($q$select store_set_conversation_state('BW-AAAAAA', %L, 'done', %L)$q$, :custa, :'seen'),
  '42501', 'a customer cannot set Done');
select pg_temp.raises(format($q$select store_set_conversation_state('BW-AAAAAA', %L, 'active', null)$q$, :custb, null),
  '42501', 'a customer cannot reopen');
select pg_temp.raises(format($q$select store_set_conversation_state('BW-AAAAAA', %L, 'archived', null)$q$, :robert),
  '22023', 'unknown states are refused');
select pg_temp.raises(format($q$select store_set_conversation_state('BW-BBBBBB', %L, 'done', %L)$q$, :robert, :'seen'),
  'P0002', 'a message from another chat is not a valid "last seen"');
set role authenticated;
select pg_temp.raises($q$select store_set_conversation_state('BW-AAAAAA', '00000000-0000-0000-0000-0000000000a1', 'done', null)$q$,
  '42501', 'browsers cannot call the state function at all');
select pg_temp.raises($q$update store_order_conversations set state = 'done'$q$,
  '42501', 'browsers cannot write conversation state');
reset role;
select pg_temp.raises($q$update store_order_conversations set state = 'archived' where order_number = 'BW-AAAAAA'$q$,
  '23514', 'the table itself only allows active/done');
select pg_temp.raises($q$update store_order_conversations set state = 'done' where order_number = 'BW-AAAAAA'$q$,
  '23514', 'Done without a timestamp is impossible');

select pg_temp.ok(
  (select count(*) from orders o join xob_before b using (id) where o.status is distinct from b.status) = 0,
  'XOB orders.status untouched by every workflow action');

\echo '--- image albums (0024)'
select gen_random_uuid() as album_cid \gset
select set_config('bw.album_cid', :'album_cid', false);
\set prefix '''BW-AAAAAA/00000000-0000-0000-0000-0000000000a1/'''
select format('[%s]', string_agg(format(
  '{"position":%s,"path":"BW-AAAAAA/%s/%s/%s.jpg","mime":"image/jpeg","size":1000,"thumb_path":"BW-AAAAAA/%s/%s/%s.thumb.webp","thumb_mime":"image/webp","width":1080,"height":1920}',
  i, '00000000-0000-0000-0000-0000000000a1', :'album_cid', i, '00000000-0000-0000-0000-0000000000a1', :'album_cid', i), ','))
  as album_json from generate_series(0, 7) i \gset
select pg_temp.raises(format($q$select store_post_album('BW-AAAAAA', 'admin', %L, '', null, %L::jsonb, %L)$q$,
  :robert, :'album_json', :'album_cid'), 'BW012', 'an album whose files were never uploaded is refused');
select pg_temp.put_files(:'album_json'::jsonb);
truncate realtime.messages;
select (store_post_album('BW-AAAAAA', 'admin', :robert, '', 'proof_of_delivery', :'album_json'::jsonb, :'album_cid') -> 'message' ->> 'id') as album_id \gset
select pg_temp.ok(
  (select kind = 'album' and payload->>'label' = 'proof_of_delivery' and attachment_path is null
     from store_order_messages where id = :'album_id')
  and (select count(*) from store_order_message_attachments where message_id = :'album_id') = 8
  and (select array_agg(position order by position) from store_order_message_attachments where message_id = :'album_id') = array[0,1,2,3,4,5,6,7]::smallint[],
  'an 8-image proof album is ONE message with 8 ordered attachments');
select pg_temp.ok(
  (select last_message_kind = 'album' and last_message_preview = 'Proof of delivery'
     from store_order_conversations where order_number = 'BW-AAAAAA'),
  'inbox preview reads "Proof of delivery"');
select pg_temp.ok(
  (select count(*) from realtime.messages where topic = 'admin:inbox' and event = 'message') = 1
  and (select count(*) from realtime.messages where topic = 'customer:' || :custa and event = 'message') = 1
  and (select count(*) from realtime.messages where payload::text like '%.jpg%') = 0,
  'one realtime ping per album, no file paths in any event');

-- Retry with the same client id returns the same message, no duplicates.
select pg_temp.ok(
  (select (store_post_album('BW-AAAAAA', 'admin', :robert, '', 'proof_of_delivery', :'album_json'::jsonb, :'album_cid') ->> 'created')::boolean = false)
  and (select count(*) from store_order_messages where client_message_id = :'album_cid') = 1
  and (select count(*) from store_order_message_attachments where message_id = :'album_id') = 8,
  'album retry is idempotent');
select pg_temp.raises(format($q$select store_post_album('BW-AAAAAA', 'admin', %L, 'different', null, %L::jsonb, %L)$q$,
  :robert, :'album_json', :'album_cid'), 'BW010', 'reusing an album id for different content is refused');
-- Many simultaneous/late retries of the same Send: still one album.
do $$
declare i int;
begin
  for i in 1..5 loop
    perform store_post_album('BW-AAAAAA', 'admin', '00000000-0000-0000-0000-0000000000a1', '', 'proof_of_delivery',
      (select format('[%s]', string_agg(format(
        '{"position":%s,"path":"BW-AAAAAA/00000000-0000-0000-0000-0000000000a1/%s/%s.jpg","mime":"image/jpeg","size":1000,"thumb_path":"BW-AAAAAA/00000000-0000-0000-0000-0000000000a1/%s/%s.thumb.webp","thumb_mime":"image/webp","width":1080,"height":1920}',
        g, current_setting('bw.album_cid'), g, current_setting('bw.album_cid'), g), ','))::jsonb from generate_series(0, 7) g),
      current_setting('bw.album_cid')::uuid);
  end loop;
end $$;
select pg_temp.ok(
  (select count(*) from store_order_messages where client_message_id = :'album_cid') = 1
  and (select count(*) from store_order_message_attachments where message_id = :'album_id') = 8
  and (select count(*) from store_order_messages where order_number = 'BW-AAAAAA' and kind = 'album'
         and payload->>'label' = 'proof_of_delivery') = 1,
  'five more Send retries: one message, 8 attachment rows, one proof album');
-- A retry long after the files'' upload window still returns the same album.
update storage.objects set created_at = now() - interval '3 days'
 where name like 'BW-AAAAAA/%/' || :'album_cid' || '/%';
select pg_temp.ok(
  (select (store_post_album('BW-AAAAAA', 'admin', :robert, '', 'proof_of_delivery', :'album_json'::jsonb, :'album_cid') ->> 'created')::boolean = false),
  'a late retry of a posted album is still idempotent (no BW012)');
select pg_temp.raises(format($q$insert into store_order_message_attachments (message_id, order_number, position, storage_path, mime, byte_size, thumb_path, thumb_mime)
  select message_id, order_number, 9, storage_path, mime, byte_size, thumb_path || 'x', thumb_mime from store_order_message_attachments where message_id = %L and position = 0$q$, :'album_id'),
  '23505', 'one file can never belong to two attachments');

-- Customer albums: own paths only, no labels, max 10.
select gen_random_uuid() as cust_cid \gset
select format('[{"position":0,"path":"BW-AAAAAA/%1$s/%2$s/0.png","mime":"image/png","size":500,"thumb_path":"BW-AAAAAA/%1$s/%2$s/0.thumb.jpg","thumb_mime":"image/jpeg","width":10,"height":10}]',
  '00000000-0000-0000-0000-0000000000c1', :'cust_cid') as cust_json \gset
select pg_temp.put_files(:'cust_json'::jsonb, interval '7 hours');
select pg_temp.raises(format($q$select store_post_album('BW-AAAAAA', 'customer', %L, 'receipt po', null, %L::jsonb, %L)$q$,
  :custa, :'cust_json', :'cust_cid'), 'BW012', 'files uploaded more than 6 hours ago cannot be posted (cleanup window)');
update storage.objects set created_at = now() where name like 'BW-AAAAAA/%/' || :'cust_cid' || '/%';
select pg_temp.ok(
  (select (store_post_album('BW-AAAAAA', 'customer', :custa, 'receipt po', null, :'cust_json'::jsonb, :'cust_cid') ->> 'created')::boolean),
  'customer can send a 1-image album (receipt) to their own order');
select pg_temp.raises(format($q$select store_post_album('BW-AAAAAA', 'customer', %L, '', 'proof_of_delivery', %L::jsonb, gen_random_uuid())$q$,
  :custa, :'cust_json'), '42501', 'customers cannot label albums as proof of delivery');
select pg_temp.raises(format($q$select store_post_album('BW-AAAAAA', 'customer', %L, '', null, %L::jsonb, gen_random_uuid())$q$,
  :custb, :'cust_json'), '42501', 'customer B cannot post into A''s order');
select pg_temp.raises(format($q$select store_post_album('BW-AAAAAA', 'customer', %L, '', null, %L::jsonb, %L)$q$,
  :custa, replace(:'cust_json', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2'), gen_random_uuid()),
  '22023', 'paths outside the sender''s own folder are refused');
select pg_temp.raises(format($q$select store_post_album('BW-AAAAAA', 'customer', %L, '', null, %L::jsonb, %L)$q$,
  :custa, replace(:'cust_json', '0.png', '../x.png'), :'cust_cid'), '22023', 'path tricks are refused');
select pg_temp.raises(format($q$select store_post_album('BW-AAAAAA', 'admin', %L, '', null, '[]'::jsonb, gen_random_uuid())$q$,
  :robert), '22023', 'an empty album is refused');
select format('[%s]', string_agg(format(
  '{"position":%s,"path":"BW-AAAAAA/%s/%s/%s.jpg","mime":"image/jpeg","size":1,"thumb_path":"BW-AAAAAA/%s/%s/%s.thumb.jpg","thumb_mime":"image/jpeg"}',
  i, '00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', i, '00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', i), ','))
  as eleven from generate_series(0, 10) i \gset
select pg_temp.raises(format($q$select store_post_album('BW-AAAAAA', 'admin', %L, '', null, %L::jsonb, '11111111-1111-1111-1111-111111111111')$q$,
  :robert, :'eleven'), '22023', 'more than 10 images is refused');
select pg_temp.raises($q$insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, payload)
  values ('BW-AAAAAA', 'customer', '00000000-0000-0000-0000-0000000000c1', 'album', '', '{"label":"proof_of_delivery"}')$q$,
  '23514', 'the table refuses a customer-labelled album even outside the function');
set role authenticated;
select pg_temp.raises($q$select * from store_order_message_attachments$q$, '42501', 'browsers cannot read attachment rows');
reset role;

-- Old single-image messages are untouched.
select pg_temp.ok(
  (select count(*) from store_order_messages where kind = 'image' and attachment_path is null) = 0,
  'existing image messages still carry their single attachment');

\echo '--- what does NOT reopen a Done conversation (0024)'
select m.id as last_a from store_order_messages m where order_number = 'BW-AAAAAA'
 order by created_at desc, id desc limit 1 \gset
select store_set_conversation_state('BW-AAAAAA', :robert, 'active', null);
select store_set_conversation_state('BW-AAAAAA', :robert, 'done', :'last_a');
select done_at as done_mark from store_order_conversations where order_number = 'BW-AAAAAA' \gset
-- admin message, admin album, payment details, assignment, both read receipts, a pending upload
select store_post_message('BW-AAAAAA', 'admin', :robert, 'text', 'Salamat po', null, null, gen_random_uuid());
select gen_random_uuid() as pod_cid \gset
select format('[{"position":0,"path":"BW-AAAAAA/%1$s/%2$s/0.jpg","mime":"image/jpeg","size":9,"thumb_path":"BW-AAAAAA/%1$s/%2$s/0.thumb.jpg","thumb_mime":"image/jpeg"}]',
  '00000000-0000-0000-0000-0000000000a1', :'pod_cid') as pod_json \gset
select pg_temp.put_files(:'pod_json'::jsonb);
select store_post_album('BW-AAAAAA', 'admin', :robert, '', 'proof_of_delivery', :'pod_json'::jsonb, :'pod_cid');
update store_order_conversations set payment_details_sent_at = now() where order_number = 'BW-AAAAAA';
update store_order_conversations set assigned_admin_id = :andre, assigned_by = :robert, assigned_at = now() where order_number = 'BW-AAAAAA';
select m.id as newest from store_order_messages m where order_number = 'BW-AAAAAA'
 order by created_at desc, id desc limit 1 \gset
update store_order_conversations set admin_read_at = now(), admin_read_message_id = :'newest',
       customer_read_at = now(), customer_read_message_id = :'newest' where order_number = 'BW-AAAAAA';
insert into storage.objects (bucket_id, name) values ('order-chat-attachments', 'BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/' || gen_random_uuid() || '/0.jpg');
select pg_temp.ok(
  (select state = 'done' and done_at = :'done_mark' from store_order_conversations where order_number = 'BW-AAAAAA')
  and (select count(*) from store_chat_audit_log where action = 'conversation.reopened' and order_number = 'BW-AAAAAA'
         and details->>'cause' = 'customer_message' and created_at > :'done_mark') = 0,
  'admin message, proof album, payment details, assignment, read receipts and a pending upload all keep it Done');
-- Only a customer message reopens; typing/viewing never touch the database.
select store_post_message('BW-AAAAAA', 'customer', :custa, 'text', 'May isa pa po', null, null, gen_random_uuid());
select pg_temp.ok(
  (select state = 'active' from store_order_conversations where order_number = 'BW-AAAAAA'),
  '... and a customer message does reopen it');
select pg_temp.ok(
  (select count(*) from orders o join xob_before b using (id) where o.status is distinct from b.status) = 0,
  'XOB orders.status still untouched');

\echo '--- abandoned uploads (0024)'
insert into storage.buckets (id, name, public) values ('store-payment-qr', 'store-payment-qr', false) on conflict (id) do nothing;
insert into storage.objects (bucket_id, name, created_at) values
  ('order-chat-attachments', 'BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/aaaaaaaa-0000-0000-0000-000000000001/0.jpg', now() - interval '30 hours'),
  ('order-chat-attachments', 'BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/aaaaaaaa-0000-0000-0000-000000000001/0.thumb.webp', now() - interval '30 hours'),
  ('order-chat-attachments', 'BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/aaaaaaaa-0000-0000-0000-000000000002/0.jpg', now() - interval '13 hours'),
  ('order-chat-attachments', 'BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/aaaaaaaa-0000-0000-0000-000000000003/0.jpg', now() - interval '2 hours'),
  ('store-payment-qr', 'qr/old.png', now() - interval '90 days');
update storage.objects set created_at = now() - interval '30 hours'
 where name in (select storage_path from store_order_message_attachments union all select thumb_path from store_order_message_attachments
                union all select attachment_path from store_order_messages where attachment_path is not null);
insert into storage.objects (bucket_id, name, created_at)
select 'order-chat-attachments', attachment_path, now() - interval '30 hours' from store_order_messages
 where attachment_path is not null and attachment_path not in (select name from storage.objects);
select pg_temp.ok(
  (select array_agg(name order by name) from store_list_orphan_chat_uploads(24, 500))
    = array['BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/aaaaaaaa-0000-0000-0000-000000000001/0.jpg',
            'BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/aaaaaaaa-0000-0000-0000-000000000001/0.thumb.webp'],
  'orphans: only unreferenced chat files past the retention (24 h) are listed');
select pg_temp.ok(
  (select count(*) from store_list_orphan_chat_uploads(1, 500)) = 3
  and (select count(*) from store_list_orphan_chat_uploads(1, 500) where name like '%000000000003%') = 0,
  'a shorter retention is clamped to 12 h: an upload from 2 hours ago is never listed');
select pg_temp.ok(
  (select count(*) from store_list_orphan_chat_uploads(12, 500) where name in (
     select storage_path from store_order_message_attachments union all select thumb_path from store_order_message_attachments
     union all select attachment_path from store_order_messages where attachment_path is not null)) = 0
  and (select count(*) from store_list_orphan_chat_uploads(12, 500) where name like 'qr/%') = 0,
  'files of posted albums, legacy single images and other buckets are never listed');
select pg_temp.ok((select count(*) from store_list_orphan_chat_uploads(12, 1)) = 1, 'the listing is bounded');
set role authenticated;
select pg_temp.raises($q$select * from store_list_orphan_chat_uploads(12, 10)$q$, '42501', 'browsers cannot list uploads');
reset role;
delete from storage.objects where name like '%aaaaaaaa-0000-0000-0000-00000000000%';

\echo '--- customer realtime topic (0024)'
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select pg_temp.ok(store_realtime_topic_allowed('customer:' || :custa), 'a customer may receive their own topic');
select pg_temp.ok(not store_realtime_topic_allowed('customer:' || :custb), '... never another customer''s');
select pg_temp.ok(not store_realtime_topic_allowed('customer:not-a-uuid'), '... nor a malformed one');
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.ok(not store_realtime_topic_allowed('customer:' || :custa), 'signed out: nothing');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
select pg_temp.ok(not store_realtime_topic_allowed('customer:' || :custa), 'admins do not need (or get) customer topics');
select set_config('request.jwt.claim.sub', '', false);

\echo '--- long-term customer: 20 completed, 2 active, 1 unread'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c9', 'longterm@gmail.test');
insert into store_order_snapshots (order_number, idempotency_key, request_fingerprint, view_token_hash,
  buyer_name, buyer_roblox_username, total_amount, owner_user_id, created_at)
select 'BW-LT' || lpad(g::text, 4, '0'), 'idem-lt-' || lpad(g::text, 20, '0'), repeat('e', 64), repeat('e', 64),
  'Long Term', 'ltRBX', 100 + g, '00000000-0000-0000-0000-0000000000c9', now() - (30 - g) * interval '1 day'
  from generate_series(1, 23) g;
insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body, created_at)
select 'BW-LT' || lpad(g::text, 4, '0'), 'customer', '00000000-0000-0000-0000-0000000000c9', 'slip', 'slip',
  now() - (30 - g) * interval '1 day'
  from generate_series(1, 23) g;
do $$
declare r record;
begin
  for r in select c.order_number, c.last_message_id from store_order_conversations c
            where c.order_number between 'BW-LT0001' and 'BW-LT0020' loop
    perform store_set_conversation_state(r.order_number, '00000000-0000-0000-0000-0000000000a1', 'done', r.last_message_id);
  end loop;
end $$;
select store_post_message('BW-LT0022', 'admin', :robert, 'text', 'Reviewed po', null, null, gen_random_uuid());
select pg_temp.ok(
  (select count(*) from store_customer_orders('00000000-0000-0000-0000-0000000000c9', 'open')) = 3
  and (select order_number from store_customer_orders('00000000-0000-0000-0000-0000000000c9', 'open') where unread_count > 0) = 'BW-LT0022',
  'open section: 3 orders in progress, the one with the reply is marked unread');
select pg_temp.ok(
  (select count(*) from store_customer_orders('00000000-0000-0000-0000-0000000000c9', 'completed', null, null, 20)) = 20,
  'completed section: first page of 20');
select done_at as page_at, order_number as page_order from store_customer_orders('00000000-0000-0000-0000-0000000000c9', 'completed', null, null, 15)
 order by done_at, order_number limit 1 \gset
select pg_temp.ok(
  (select count(*) from store_customer_orders('00000000-0000-0000-0000-0000000000c9', 'completed', :'page_at', :'page_order', 15)) = 5,
  'completed section paginates by keyset (15 + 5, no overlap)');

\echo '--- Active queue performance (100,000 conversations)'
insert into store_order_snapshots (order_number, idempotency_key, request_fingerprint, view_token_hash,
  buyer_name, buyer_roblox_username, total_amount, created_at)
select 'BW-P' || lpad(g::text, 6, '0'), 'idem-perf-' || lpad(g::text, 16, '0'), repeat('f', 64), repeat('f', 64),
  'Perf', 'perf', 1, now() - interval '400 days'
  from generate_series(1, 100000) g;
-- Bulk rows go straight into the conversation table (no messages needed
-- for a plan check): 99,950 Done history + 50 Active.
insert into store_order_conversations (order_number, last_message_id, last_message_at, last_message_kind,
  last_message_preview, last_sender_role, state, done_at)
select 'BW-P' || lpad(g::text, 6, '0'), gen_random_uuid(), now() - (100000 - g) * interval '1 minute', 'text', 'x', 'admin',
  case when g > 99950 then 'active' else 'done' end,
  case when g > 99950 then null else now() end
  from generate_series(1, 100000) g;
analyze store_order_conversations;
create temp table plan_out (line text);
do $$
declare v text; l text := '';
begin
  for v in execute $q$explain select c.order_number from store_order_conversations c
             where c.state = 'active' order by c.last_message_at desc, c.order_number desc limit 30$q$ loop
    l := l || v || E'\n';
  end loop;
  insert into plan_out values (l);
end $$;
select pg_temp.ok(
  (select line like '%store_order_conversations_state_activity_idx%' and line not like '%Seq Scan%' from plan_out),
  'the Active queue uses the state index (no scan of Done history)');
do $$
declare t0 timestamptz := clock_timestamp(); n int;
begin
  select count(*) into n from store_admin_inbox('00000000-0000-0000-0000-0000000000a1', 'active');
  if clock_timestamp() - t0 > interval '500 ms' then
    raise exception 'FAIL: Active inbox took %', clock_timestamp() - t0;
  end if;
  raise notice 'ok - Active inbox over 100,000 conversations in % (% rows)', clock_timestamp() - t0, n;
end $$;
delete from store_order_conversations where order_number like 'BW-P%';
delete from store_order_snapshots where order_number like 'BW-P%';

\echo 'ALL 0024 DATABASE TESTS PASSED'
