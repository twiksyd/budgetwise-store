-- Rollback of 0032. Roll the application back FIRST.
-- Messages are kept. Reactions and reply links are dropped (the replies
-- themselves stay as ordinary messages). store_post_message below is 0026's.

begin;

drop function if exists public.store_set_reaction(text, uuid, uuid, text, text);
drop function if exists public.store_reaction_summary(uuid);
drop table if exists public.store_message_reactions;

drop function if exists public.store_post_message(text, text, uuid, text, text, text, text, uuid, uuid);
create or replace function public.store_post_message(
  p_order_number text,
  p_sender_role text,
  p_sender uuid,
  p_kind text,
  p_body text,
  p_attachment_path text,
  p_attachment_mime text,
  p_client_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.store_order_messages;
begin
  if p_kind not in ('text', 'image') then
    raise exception 'unsupported message kind' using errcode = '22023';
  end if;

  if p_sender_role = 'admin' then
    if not exists (select 1 from public.admin_users where user_id = p_sender) then
      raise exception 'not an admin' using errcode = '42501';
    end if;
  elsif p_sender_role = 'customer' then
    if public.store_chat_owner(p_order_number) is distinct from p_sender then
      raise exception 'not the order owner' using errcode = '42501';
    end if;
  else
    raise exception 'invalid sender role' using errcode = '22023';
  end if;

  insert into public.store_order_messages (
    order_number, sender_role, sender_user_id, kind, body,
    attachment_path, attachment_mime, client_message_id
  )
  values (
    p_order_number, p_sender_role, p_sender, p_kind, coalesce(p_body, ''),
    p_attachment_path, p_attachment_mime, p_client_message_id
  )
  on conflict (order_number, sender_user_id, client_message_id)
    where client_message_id is not null
    do nothing
  returning * into v_row;

  if found then
    return jsonb_build_object('created', true, 'message', to_jsonb(v_row));
  end if;

  select * into v_row from public.store_order_messages m
   where m.order_number = p_order_number
     and m.sender_user_id = p_sender
     and m.client_message_id = p_client_message_id;

  if v_row.kind is distinct from p_kind
     or v_row.body is distinct from coalesce(p_body, '')
     or v_row.attachment_path is distinct from p_attachment_path then
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'BW010';
  end if;

  return jsonb_build_object('created', false, 'message', to_jsonb(v_row));
end;
$$;

revoke all on function public.store_post_message(text, text, uuid, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.store_post_message(text, text, uuid, text, text, text, text, uuid) to service_role;

drop trigger if exists store_order_messages_reply_same_chat on public.store_order_messages;
drop function if exists public.store_order_messages_reply_same_chat();
alter table public.store_order_messages drop constraint if exists store_order_messages_reply_not_self;
alter table public.store_order_messages drop column if exists reply_to_message_id;

notify pgrst, 'reload schema';

commit;
