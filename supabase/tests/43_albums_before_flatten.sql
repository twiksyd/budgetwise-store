-- Setup for the album flattening test (0024 applied): two real albums, a
-- Done conversation, read positions that point at an album.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;
\echo '--- albums to flatten'
insert into storage.buckets (id, name, public) values ('order-chat-attachments', 'order-chat-attachments', false) on conflict (id) do nothing;
insert into storage.objects (bucket_id, name)
select 'order-chat-attachments', f from (values
  ('BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/aaaaaaaa-1111-1111-1111-111111111111/0.jpg'),
  ('BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/aaaaaaaa-1111-1111-1111-111111111111/0.thumb.webp'),
  ('BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/aaaaaaaa-1111-1111-1111-111111111111/1.png'),
  ('BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/aaaaaaaa-1111-1111-1111-111111111111/1.thumb.webp'),
  ('BW-AAAAAA/00000000-0000-0000-0000-0000000000a1/bbbbbbbb-2222-2222-2222-222222222222/0.webp'),
  ('BW-AAAAAA/00000000-0000-0000-0000-0000000000a1/bbbbbbbb-2222-2222-2222-222222222222/0.thumb.webp'),
  ('BW-AAAAAA/00000000-0000-0000-0000-0000000000a1/bbbbbbbb-2222-2222-2222-222222222222/1.jpg'),
  ('BW-AAAAAA/00000000-0000-0000-0000-0000000000a1/bbbbbbbb-2222-2222-2222-222222222222/1.thumb.webp'),
  ('BW-AAAAAA/00000000-0000-0000-0000-0000000000a1/bbbbbbbb-2222-2222-2222-222222222222/2.jpg'),
  ('BW-AAAAAA/00000000-0000-0000-0000-0000000000a1/bbbbbbbb-2222-2222-2222-222222222222/2.thumb.webp')) v(f);
select store_post_album('BW-AAAAAA', 'customer', '00000000-0000-0000-0000-0000000000c1', 'GCash receipt po', null,
  '[{"position":0,"path":"BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/aaaaaaaa-1111-1111-1111-111111111111/0.jpg","mime":"image/jpeg","size":10,"thumb_path":"BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/aaaaaaaa-1111-1111-1111-111111111111/0.thumb.webp","thumb_mime":"image/webp"},
    {"position":1,"path":"BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/aaaaaaaa-1111-1111-1111-111111111111/1.png","mime":"image/png","size":10,"thumb_path":"BW-AAAAAA/00000000-0000-0000-0000-0000000000c1/aaaaaaaa-1111-1111-1111-111111111111/1.thumb.webp","thumb_mime":"image/webp"}]',
  'aaaaaaaa-1111-1111-1111-111111111111');
select store_post_album('BW-AAAAAA', 'admin', '00000000-0000-0000-0000-0000000000a1', '', 'proof_of_delivery',
  '[{"position":0,"path":"BW-AAAAAA/00000000-0000-0000-0000-0000000000a1/bbbbbbbb-2222-2222-2222-222222222222/0.webp","mime":"image/webp","size":10,"thumb_path":"BW-AAAAAA/00000000-0000-0000-0000-0000000000a1/bbbbbbbb-2222-2222-2222-222222222222/0.thumb.webp","thumb_mime":"image/webp"},
    {"position":1,"path":"BW-AAAAAA/00000000-0000-0000-0000-0000000000a1/bbbbbbbb-2222-2222-2222-222222222222/1.jpg","mime":"image/jpeg","size":10,"thumb_path":"BW-AAAAAA/00000000-0000-0000-0000-0000000000a1/bbbbbbbb-2222-2222-2222-222222222222/1.thumb.webp","thumb_mime":"image/webp"},
    {"position":2,"path":"BW-AAAAAA/00000000-0000-0000-0000-0000000000a1/bbbbbbbb-2222-2222-2222-222222222222/2.jpg","mime":"image/jpeg","size":10,"thumb_path":"BW-AAAAAA/00000000-0000-0000-0000-0000000000a1/bbbbbbbb-2222-2222-2222-222222222222/2.thumb.webp","thumb_mime":"image/webp"}]',
  'bbbbbbbb-2222-2222-2222-222222222222');
-- The proof album is the newest message; both sides have read up to it; the chat is Done.
select id as proof_id from store_order_messages where client_message_id = 'bbbbbbbb-2222-2222-2222-222222222222' \gset
update store_order_conversations set customer_read_at = now(), customer_read_message_id = :'proof_id',
       admin_read_at = now(), admin_read_message_id = :'proof_id' where order_number = 'BW-AAAAAA';
insert into store_conversation_reads (order_number, admin_user_id, last_read_at, last_read_message_id)
values ('BW-AAAAAA', '00000000-0000-0000-0000-0000000000a1', now(), :'proof_id')
on conflict (order_number, admin_user_id) do update set last_read_message_id = excluded.last_read_message_id;
select store_set_conversation_state('BW-AAAAAA', '00000000-0000-0000-0000-0000000000a1', 'done', :'proof_id');
create table public.flatten_check as select (select count(*) from store_chat_audit_log) as audit_rows,
  (select count(*) from store_order_messages) as messages_before;
truncate realtime.messages;
select pg_temp.ok(
  (select count(*) from store_order_messages where kind = 'album') = 2
  and (select count(*) from store_order_message_attachments) = 5
  and (select last_message_kind = 'album' and state = 'done' from store_order_conversations where order_number = 'BW-AAAAAA'),
  'setup: 2 albums (5 photos), the proof album is the last message, chat is Done');
