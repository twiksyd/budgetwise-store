-- BudgetWise Vouch Request
--
-- Adds one admin-authored structured vouch card per customer conversation.
-- The Facebook destination and display copy live in application code; the
-- database stores no editable URL. The partial unique index is the final
-- duplicate guard, including concurrent requests from different admins.

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_kind_valid'
       and conrelid = 'public.store_order_messages'::regclass
       and pg_get_constraintdef(oid) not like '%vouch%'
  ) then
    alter table public.store_order_messages drop constraint store_order_messages_kind_valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_kind_valid'
       and conrelid = 'public.store_order_messages'::regclass
  ) then
    alter table public.store_order_messages
      add constraint store_order_messages_kind_valid
      check (kind in ('slip', 'text', 'image', 'payment', 'album', 'product', 'vouch')) not valid;
  end if;

  if exists (
    select 1 from pg_constraint
     where conname = 'store_order_conversations_last_kind_valid'
       and conrelid = 'public.store_order_conversations'::regclass
       and pg_get_constraintdef(oid) not like '%vouch%'
  ) then
    alter table public.store_order_conversations drop constraint store_order_conversations_last_kind_valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_conversations_last_kind_valid'
       and conrelid = 'public.store_order_conversations'::regclass
  ) then
    alter table public.store_order_conversations
      add constraint store_order_conversations_last_kind_valid
      check (last_message_kind in ('slip', 'text', 'image', 'payment', 'album', 'product', 'vouch')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_vouch_shape'
       and conrelid = 'public.store_order_messages'::regclass
  ) then
    alter table public.store_order_messages
      add constraint store_order_messages_vouch_shape
      check (
        kind <> 'vouch'
        or (sender_role = 'admin' and payload is null and attachment_path is null
            and attachment_mime is null and order_ref is null)
      ) not valid;
  end if;
end $$;

alter table public.store_order_messages validate constraint store_order_messages_kind_valid;
alter table public.store_order_messages validate constraint store_order_messages_vouch_shape;
alter table public.store_order_conversations validate constraint store_order_conversations_last_kind_valid;

create unique index if not exists store_order_messages_one_vouch_per_conversation_idx
  on public.store_order_messages (order_number)
  where kind = 'vouch';

create or replace function public.store_send_vouch_request(p_key text, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_created boolean := false;
begin
  if p_actor is null or not exists (select 1 from public.admin_users where user_id = p_actor) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.store_chat_threads t where t.key = p_key) then
    raise exception 'chat not found' using errcode = 'P0002';
  end if;

  insert into public.store_order_messages (
    order_number, sender_role, sender_user_id, kind, body
  )
  values (
    p_key, 'admin', p_actor, 'vouch',
    'Would you vouch for BudgetWise? Your support helps more players shop with confidence.'
  )
  on conflict (order_number) where kind = 'vouch' do nothing
  returning id into v_id;

  if v_id is not null then
    v_created := true;
  else
    select m.id into v_id
      from public.store_order_messages m
     where m.order_number = p_key and m.kind = 'vouch'
     order by m.created_at, m.id
     limit 1;
  end if;

  return jsonb_build_object('created', v_created, 'message_id', v_id);
end;
$$;

create or replace function public.store_chat_preview(p_kind text, p_body text, p_payload jsonb)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when p_kind = 'album' then
      case
        when p_payload ->> 'label' = 'proof_of_delivery' then 'Proof of delivery'
        when length(btrim(coalesce(p_body, ''))) > 0
          then 'Photos: ' || left(regexp_replace(btrim(p_body), '\s+', ' ', 'g'), 150)
        else 'Photos'
      end
    when p_kind = 'product' then
      case when p_payload ->> 'type' = 'game'
        then 'Pricelist: ' || left(coalesce(p_payload ->> 'game_name', ''), 140)
        else 'Recommended: ' || left(coalesce(p_payload ->> 'product_name', ''), 140)
      end
    when p_kind = 'vouch' then 'Vouch request'
    else public.store_chat_preview(p_kind, p_body)
  end;
$$;

revoke all on function public.store_send_vouch_request(text, uuid) from public, anon, authenticated;
grant execute on function public.store_send_vouch_request(text, uuid) to service_role;

notify pgrst, 'reload schema';
