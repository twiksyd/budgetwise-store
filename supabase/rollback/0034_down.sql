-- Roll back 0034 only before a Vouch Request has been sent. Removing a sent
-- customer-visible message silently would be data loss, so refuse instead.
do $$
begin
  if exists (select 1 from public.store_order_messages where kind = 'vouch') then
    raise exception '0034 rollback refused: vouch request messages exist';
  end if;
end $$;

drop function if exists public.store_send_vouch_request(text, uuid);
drop index if exists public.store_order_messages_one_vouch_per_conversation_idx;
alter table public.store_order_messages drop constraint if exists store_order_messages_vouch_shape;

alter table public.store_order_messages drop constraint if exists store_order_messages_kind_valid;
alter table public.store_order_messages
  add constraint store_order_messages_kind_valid
  check (kind in ('slip', 'text', 'image', 'payment', 'album', 'product')) not valid;
alter table public.store_order_messages validate constraint store_order_messages_kind_valid;

alter table public.store_order_conversations drop constraint if exists store_order_conversations_last_kind_valid;
alter table public.store_order_conversations
  add constraint store_order_conversations_last_kind_valid
  check (last_message_kind in ('slip', 'text', 'image', 'payment', 'album', 'product')) not valid;
alter table public.store_order_conversations validate constraint store_order_conversations_last_kind_valid;

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
    else public.store_chat_preview(p_kind, p_body)
  end;
$$;

notify pgrst, 'reload schema';
