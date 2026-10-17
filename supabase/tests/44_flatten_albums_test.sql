-- After rollback/0024_flatten_albums.sql.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;
\echo '--- albums flattened'
select pg_temp.ok(
  (select count(*) from store_order_messages where kind = 'album') = 0
  and (select count(*) from store_order_message_attachments) = 0
  and (select count(*) from store_order_messages) = (select messages_before from flatten_check) - 2 + 5,
  'every album became one image message per photo (2 albums -> 5 photos)');
select pg_temp.ok(
  (select array_agg(attachment_path || '|' || attachment_mime || '|' || body order by created_at, id)
     from store_order_messages where kind = 'image' and attachment_path like '%/aaaaaaaa-1111%')
  = array['BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/aaaaaaaa-1111-1111-1111-111111111111/0.jpg|image/jpeg|GCash receipt po',
          'BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/aaaaaaaa-1111-1111-1111-111111111111/1.png|image/png|'],
  'customer receipt album: same files, same order, caption on the first photo, still the customer''s');
select pg_temp.ok(
  (select array_agg(body order by created_at, id) from store_order_messages where attachment_path like '%/bbbbbbbb-2222%')
    = array['Proof of delivery', '', '']
  and (select bool_and(sender_role = 'admin' and sender_user_id = '00000000-0000-0000-0000-0000000000a1')
         from store_order_messages where attachment_path like '%/bbbbbbbb-2222%'),
  'proof album: three photos from the same admin, first one labelled "Proof of delivery"');
select pg_temp.ok(
  (select c.last_message_kind = 'image' and c.last_message_id = m.id
          and c.customer_read_message_id = m.id and c.admin_read_message_id = m.id
     from store_order_conversations c
     join lateral (select id from store_order_messages where attachment_path like '%/bbbbbbbb-2222%/2.jpg') m on true
    where c.order_number = 'BW-AAAAAA')
  and (select r.last_read_message_id = m.id from store_conversation_reads r
         join lateral (select id from store_order_messages where attachment_path like '%/bbbbbbbb-2222%/2.jpg') m on true
        where r.order_number = 'BW-AAAAAA' and r.admin_user_id = '00000000-0000-0000-0000-0000000000a1'),
  'last message and every read position move to the album''s last photo (nothing becomes unread)');
select pg_temp.ok(
  (select state = 'done' from store_order_conversations where order_number = 'BW-AAAAAA')
  and (select count(*) from store_chat_audit_log) = (select audit_rows from flatten_check)
  and (select count(*) from realtime.messages) = 0,
  'flattening is silent: the Done chat stays Done, no audit entry, no realtime ping');
select pg_temp.ok(
  (select bool_and(tgenabled = 'O') from pg_trigger
    where tgname in ('store_order_messages_after_insert', 'store_order_conversations_after_update')),
  'both triggers are enabled again');
drop table public.flatten_check;
\echo 'ALL FLATTEN TESTS PASSED'
