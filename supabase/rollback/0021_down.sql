-- Rollback for 0021_store_shared_admin_inbox.sql.
--
-- Only valid BEFORE the cleanup migration (0023) has run. Restores the exact
-- 0020 shape. Data that exists only in 0021's tables (assignments, per-admin
-- read cursors, quick replies, payment accounts, audit log) is discarded.
--
-- Refuses to run if any structured payment message exists, because 0020's
-- kind constraint cannot hold one. Decide what to do with those rows first.

begin;

do $$
begin
  if exists (select 1 from public.store_order_messages where kind = 'payment') then
    raise exception 'rollback refused: payment messages exist (kind = payment)';
  end if;
end $$;

drop policy if exists "store chat: receive authorised topics" on realtime.messages;

drop trigger if exists store_order_messages_after_insert on public.store_order_messages;
drop trigger if exists store_order_messages_legacy_read_sync on public.store_order_messages;

drop function if exists public.store_realtime_topic_allowed(text);
drop function if exists public.store_chat_messages_page(text, uuid, uuid, integer);
drop function if exists public.store_post_message(text, text, uuid, text, text, text, text, uuid);
drop function if exists public.store_send_payment_details(text, uuid, uuid, uuid);
drop function if exists public.store_save_payment_method(uuid, uuid, text, text, text, text, boolean, integer);
drop function if exists public.store_save_quick_reply(uuid, uuid, text, text, text, boolean);
drop function if exists public.store_assign_conversation(text, uuid, uuid);
drop function if exists public.store_mark_customer_read(text, uuid);
drop function if exists public.store_mark_admin_read(text, uuid, uuid);
drop function if exists public.store_customer_conversations(uuid);
drop function if exists public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text);

drop table if exists public.store_chat_audit_log;
drop table if exists public.store_payment_methods;
drop table if exists public.store_quick_replies;
drop table if exists public.store_conversation_reads;
drop table if exists public.store_order_conversations;

drop function if exists public.store_order_messages_legacy_read_sync();
drop function if exists public.store_quick_replies_after_change();
drop function if exists public.store_order_conversations_after_update();
drop function if exists public.store_order_messages_after_insert();
drop function if exists public.store_chat_send(text, text, jsonb);
drop function if exists public.store_chat_preview(text, text);

alter table public.store_order_messages
  drop constraint if exists store_order_messages_payload_size,
  drop constraint if exists store_order_messages_payload_only_payment,
  drop constraint if exists store_order_messages_payment_shape,
  drop constraint if exists store_order_messages_kind_valid;
alter table public.store_order_messages
  add constraint store_order_messages_kind_valid
  check (kind in ('slip', 'text', 'image'));

drop index if exists public.store_order_messages_customer_cursor_idx;
drop index if exists public.store_order_messages_order_cursor_idx;
drop index if exists public.store_order_messages_sender_client_id_idx;

alter table public.store_order_messages
  drop column if exists payload,
  drop column if exists client_message_id;

alter table public.admin_users
  drop constraint if exists admin_users_display_name_valid,
  drop column if exists unread_since,
  drop column if exists display_name;

-- The QR bucket is removed only if empty; uploaded QR images are kept
-- otherwise (delete them in Storage first if you really want it gone).
delete from storage.buckets b
 where b.id = 'store-payment-qr'
   and not exists (select 1 from storage.objects o where o.bucket_id = b.id);

notify pgrst, 'reload schema';

commit;
