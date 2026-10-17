-- BudgetWise Store: turn image albums back into single-image messages.
--
-- ONLY for a full database rollback of 0024 after albums were sent (0024_down
-- refuses while any album exists). Run it AFTER the application has been
-- rolled back to a build without albums, then run 0024_down.sql.
--
-- Every album becomes one ordinary 'image' message per photo, in order,
-- right after the album's own time, pointing at the SAME stored file (no file
-- is copied, moved or deleted). The caption goes on the first photo; a proof
-- album's first photo reads "Proof of delivery". Thumbnails stay in storage,
-- unused. The album rows and their attachment rows are then removed.
--
-- Old builds show these like any other photo (attachments route, owner or
-- admin only, short-lived signed URL). Re-runnable: does nothing when no
-- album is left.

begin;

-- Moving existing photos is not a new message: no auto-reopen, no audit
-- entry, no realtime ping. (Only for this transaction; restored below.)
alter table public.store_order_messages disable trigger store_order_messages_after_insert;
alter table public.store_order_conversations disable trigger store_order_conversations_after_update;

create temp table flatten_plan on commit drop as
select m.id as album_id, m.order_number, m.sender_role, m.sender_user_id, m.created_at,
       x.position, x.storage_path, x.mime,
       case when x.position = 0 then
         concat_ws(E'\n',
           case when m.payload ->> 'label' = 'proof_of_delivery' then 'Proof of delivery' end,
           nullif(btrim(m.body), ''))
       else '' end as body
  from public.store_order_messages m
  join public.store_order_message_attachments x on x.message_id = m.id
 where m.kind = 'album';

insert into public.store_order_messages (
  order_number, sender_role, sender_user_id, kind, body, attachment_path, attachment_mime, created_at
)
select order_number, sender_role, sender_user_id, 'image', coalesce(body, ''), storage_path, mime,
       created_at + (position + 1) * interval '1 microsecond'
  from flatten_plan
 order by album_id, position;

-- An album without attachment rows (cannot normally exist) keeps its caption.
insert into public.store_order_messages (order_number, sender_role, sender_user_id, kind, body, created_at)
select m.order_number, m.sender_role, m.sender_user_id, 'text',
       coalesce(nullif(btrim(m.body), ''), 'Photos'), m.created_at + interval '1 microsecond'
  from public.store_order_messages m
 where m.kind = 'album'
   and not exists (select 1 from public.store_order_message_attachments x where x.message_id = m.id);

-- The conversation's "last message" must not point at a removed album.
update public.store_order_conversations c
   set (last_message_id, last_message_at, last_message_kind, last_message_preview, last_sender_role) = (
     select m.id, m.created_at, m.kind, public.store_chat_preview(m.kind, m.body), m.sender_role
       from public.store_order_messages m
      where m.order_number = c.order_number and m.kind <> 'album'
      order by m.created_at desc, m.id desc limit 1)
 where c.last_message_kind = 'album';

-- Read positions that pointed at an album now point at its last photo.
update public.store_order_conversations c
   set customer_read_message_id = p.id
  from public.store_order_messages a
  join lateral (
    select m.id from public.store_order_messages m
     where m.order_number = a.order_number and m.kind = 'image'
       and m.created_at > a.created_at and m.created_at <= a.created_at + interval '11 microseconds'
     order by m.created_at desc limit 1
  ) p on true
 where a.kind = 'album' and c.customer_read_message_id = a.id;
update public.store_order_conversations c
   set admin_read_message_id = p.id
  from public.store_order_messages a
  join lateral (
    select m.id from public.store_order_messages m
     where m.order_number = a.order_number and m.kind = 'image'
       and m.created_at > a.created_at and m.created_at <= a.created_at + interval '11 microseconds'
     order by m.created_at desc limit 1
  ) p on true
 where a.kind = 'album' and c.admin_read_message_id = a.id;
update public.store_conversation_reads r
   set last_read_message_id = p.id
  from public.store_order_messages a
  join lateral (
    select m.id from public.store_order_messages m
     where m.order_number = a.order_number and m.kind = 'image'
       and m.created_at > a.created_at and m.created_at <= a.created_at + interval '11 microseconds'
     order by m.created_at desc limit 1
  ) p on true
 where a.kind = 'album' and r.last_read_message_id = a.id;

delete from public.store_order_messages where kind = 'album';  -- attachment rows go with them (cascade)

alter table public.store_order_messages enable trigger store_order_messages_after_insert;
alter table public.store_order_conversations enable trigger store_order_conversations_after_update;

do $$
begin
  if exists (select 1 from public.store_order_messages where kind = 'album')
     or exists (select 1 from public.store_order_conversations where last_message_kind = 'album') then
    raise exception 'albums remain; nothing was changed';
  end if;
end $$;

commit;
