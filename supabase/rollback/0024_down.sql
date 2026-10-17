-- Rollback of 0024 (conversation workflow + image albums).
--
-- Emergency use only, and only while NO album messages exist: an album
-- cannot be represented in the 0021 schema, so this refuses to run if any
-- album has been sent (nothing is deleted silently).
-- Done/Active state is dropped: Done conversations simply reappear in the
-- inbox as ordinary conversations. The audit log keeps its rows and its
-- widened list of actions.
--
-- Roll the application code back FIRST (the 0024 code needs these objects;
-- the previous code does not).
--
-- The function bodies below are 0021's own text, copied verbatim (not
-- retyped); 45_rollback_0024_test.sql checks they behave like 0021.

begin;

do $$
begin
  if exists (select 1 from public.store_order_messages where kind = 'album')
     or exists (select 1 from public.store_order_conversations where last_message_kind = 'album') then
    raise exception 'album messages exist; 0024 cannot be rolled back without losing them';
  end if;
end $$;

-- ---- functions and triggers back to their 0021 definitions
create or replace function public.store_order_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_new_id uuid;
  v_conv public.store_order_conversations;
begin
  insert into public.store_order_conversations (
    order_number, last_message_id, last_message_at, last_message_kind,
    last_message_preview, last_sender_role, payment_details_sent_at
  )
  values (
    new.order_number, new.id, new.created_at, new.kind,
    public.store_chat_preview(new.kind, new.body), new.sender_role,
    case when new.kind = 'payment' then new.created_at end
  )
  on conflict (order_number) do nothing
  returning id into v_new_id;

  if v_new_id is null then
    update public.store_order_conversations c
       set last_message_id = new.id,
           last_message_at = new.created_at,
           last_message_kind = new.kind,
           last_message_preview = public.store_chat_preview(new.kind, new.body),
           last_sender_role = new.sender_role,
           updated_at = now()
     where c.order_number = new.order_number
       and (c.last_message_at, c.last_message_id) <= (new.created_at, new.id);

    if new.kind = 'payment' then
      update public.store_order_conversations c
         set payment_details_sent_at = coalesce(c.payment_details_sent_at, new.created_at),
             updated_at = now()
       where c.order_number = new.order_number;
    end if;
  end if;

  select * into v_conv
    from public.store_order_conversations
   where order_number = new.order_number;

  perform public.store_chat_send(
    'chat:' || v_conv.id::text,
    'message',
    jsonb_build_object('message_id', new.id, 'created_at', new.created_at)
  );

  perform public.store_chat_send(
    'admin:inbox',
    'message',
    jsonb_build_object(
      'conversation_id', v_conv.id,
      'order_number', new.order_number,
      'is_new_conversation', v_new_id is not null,
      'message', jsonb_build_object(
        'id', new.id,
        'sender_role', new.sender_role,
        'sender_user_id', new.sender_user_id,
        'kind', new.kind,
        'created_at', new.created_at,
        'client_message_id', new.client_message_id
      ),
      'row', jsonb_build_object(
        'last_message_id', v_conv.last_message_id,
        'last_message_at', v_conv.last_message_at,
        'last_message_kind', v_conv.last_message_kind,
        'last_message_preview', v_conv.last_message_preview,
        'last_sender_role', v_conv.last_sender_role,
        'payment_details_sent_at', v_conv.payment_details_sent_at
      )
    )
  );

  return null;
end;
$$;

create or replace function public.store_order_conversations_after_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.store_chat_send(
    'admin:inbox',
    'conversation',
    jsonb_build_object(
      'conversation_id', new.id,
      'order_number', new.order_number,
      'assigned_admin_id', new.assigned_admin_id,
      'assigned_by', new.assigned_by,
      'assigned_at', new.assigned_at,
      'customer_read_at', new.customer_read_at,
      'customer_read_message_id', new.customer_read_message_id,
      'admin_read_at', new.admin_read_at,
      'admin_read_message_id', new.admin_read_message_id
    )
  );

  if (new.admin_read_at, new.admin_read_message_id)
       is distinct from (old.admin_read_at, old.admin_read_message_id) then
    perform public.store_chat_send(
      'chat:' || new.id::text,
      'seen',
      jsonb_build_object(
        'admin_read_at', new.admin_read_at,
        'admin_read_message_id', new.admin_read_message_id
      )
    );
  end if;

  return null;
end;
$$;

drop trigger if exists store_order_conversations_after_update on public.store_order_conversations;
create trigger store_order_conversations_after_update
  after update on public.store_order_conversations
  for each row
  when (
    old.assigned_admin_id is distinct from new.assigned_admin_id
    or old.customer_read_message_id is distinct from new.customer_read_message_id
    or old.admin_read_message_id is distinct from new.admin_read_message_id
  )
  execute function public.store_order_conversations_after_update();

drop function if exists public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text);
create function public.store_admin_inbox(
  p_admin uuid,
  p_filter text default 'all',
  p_search text default null,
  p_before_at timestamptz default null,
  p_before_order text default null,
  p_limit integer default 30,
  p_order_number text default null
)
returns table (
  conversation_id uuid,
  order_number text,
  buyer_name text,
  buyer_roblox_username text,
  total_amount numeric,
  order_created_at timestamptz,
  order_status text,
  assigned_admin_id uuid,
  assigned_at timestamptz,
  last_message_id uuid,
  last_message_at timestamptz,
  last_message_kind text,
  last_message_preview text,
  last_sender_role text,
  customer_read_at timestamptz,
  customer_read_message_id uuid,
  payment_details_sent_at timestamptz,
  my_read_at timestamptz,
  my_read_message_id uuid,
  unread_count integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    c.id, c.order_number, s.buyer_name, s.buyer_roblox_username,
    s.total_amount, s.created_at, st.status,
    c.assigned_admin_id, c.assigned_at,
    c.last_message_id, c.last_message_at, c.last_message_kind,
    c.last_message_preview, c.last_sender_role,
    c.customer_read_at, c.customer_read_message_id,
    c.payment_details_sent_at,
    r.last_read_at, r.last_read_message_id,
    coalesce(u.n, 0)
  from public.admin_users me
  join public.store_order_conversations c on true
  join public.store_order_snapshots s on s.order_number = c.order_number
  left join public.store_conversation_reads r
    on r.order_number = c.order_number and r.admin_user_id = me.user_id
  left join lateral (
    select o.status from public.orders o
     where o.order_number = c.order_number limit 1
  ) st on true
  left join lateral (
    select count(*)::integer as n
      from public.store_order_messages m
     where m.order_number = c.order_number
       and m.sender_role = 'customer'
       and (m.created_at, m.id) > (
         coalesce(r.last_read_at, me.unread_since),
         coalesce(r.last_read_message_id, '00000000-0000-0000-0000-000000000000'::uuid)
       )
  ) u on true
  where me.user_id = p_admin
    and (p_order_number is null or c.order_number = p_order_number)
    and (
      p_search is null
      or s.order_number ilike '%' || p_search || '%'
      or s.buyer_name ilike '%' || p_search || '%'
      or s.buyer_roblox_username ilike '%' || p_search || '%'
    )
    and (
      p_filter = 'all'
      or (p_filter = 'unread' and coalesce(u.n, 0) > 0)
      or (p_filter = 'unassigned' and c.assigned_admin_id is null)
      or (p_filter = 'mine' and c.assigned_admin_id = me.user_id)
      or (p_filter = 'under_review' and st.status = 'pending')
    )
    and (
      p_before_at is null
      or (c.last_message_at, c.order_number) < (p_before_at, p_before_order)
    )
  order by c.last_message_at desc, c.order_number desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

drop function if exists public.store_customer_conversations(uuid);
create function public.store_customer_conversations(p_user uuid)
returns table (
  conversation_id uuid,
  order_number text,
  last_message_at timestamptz,
  last_message_kind text,
  last_message_preview text,
  last_sender_role text,
  payment_details_sent_at timestamptz,
  unread_count integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    c.id, c.order_number, c.last_message_at, c.last_message_kind,
    c.last_message_preview, c.last_sender_role, c.payment_details_sent_at,
    coalesce(u.n, 0)
  from public.store_order_conversations c
  join public.store_order_snapshots s
    on s.order_number = c.order_number and s.owner_user_id = p_user
  left join lateral (
    select count(*)::integer as n
      from public.store_order_messages m
     where m.order_number = c.order_number
       and m.sender_role = 'admin'
       and (c.customer_read_at is null
            or (m.created_at, m.id) > (c.customer_read_at, c.customer_read_message_id))
  ) u on true
  order by c.last_message_at desc
  limit 100;
$$;

create or replace function public.store_realtime_topic_allowed(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when p_topic = 'admin:inbox' then public.is_store_admin()
    when p_topic ~ '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      exists (
        select 1
          from public.store_order_conversations c
          join public.store_order_snapshots s on s.order_number = c.order_number
         where c.id = substr(p_topic, 6)::uuid
           and s.owner_user_id = auth.uid()
      )
    else false
  end;
$$;

drop function if exists public.store_customer_orders(uuid, text, timestamptz, text, integer);
drop function if exists public.store_set_conversation_state(text, uuid, text, uuid);
drop function if exists public.store_post_album(text, text, uuid, text, text, jsonb, uuid);
drop function if exists public.store_chat_preview(text, text, jsonb);

-- ---- albums
drop table if exists public.store_order_message_attachments;
alter table public.store_order_messages drop constraint if exists store_order_messages_album_shape;
alter table public.store_order_messages drop constraint if exists store_order_messages_kind_valid;
alter table public.store_order_messages
  add constraint store_order_messages_kind_valid check (kind in ('slip', 'text', 'image', 'payment'));
alter table public.store_order_messages drop constraint if exists store_order_messages_payload_only_payment;
alter table public.store_order_messages
  add constraint store_order_messages_payload_only_payment check (payload is null or kind = 'payment');
alter table public.store_order_conversations drop constraint if exists store_order_conversations_last_kind_valid;
alter table public.store_order_conversations
  add constraint store_order_conversations_last_kind_valid
  check (last_message_kind in ('slip', 'text', 'image', 'payment'));

-- ---- workflow state
drop index if exists public.store_order_conversations_state_activity_idx;
alter table public.store_order_conversations
  drop constraint if exists store_order_conversations_done_consistent,
  drop constraint if exists store_order_conversations_state_valid,
  drop column if exists reopened_by,
  drop column if exists reopened_at,
  drop column if exists done_by,
  drop column if exists done_at,
  drop column if exists state;

revoke all on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text) from public, anon, authenticated;
revoke all on function public.store_customer_conversations(uuid) from public, anon, authenticated;
revoke all on function public.store_realtime_topic_allowed(text) from public, anon;
grant execute on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text) to service_role;
grant execute on function public.store_customer_conversations(uuid) to service_role;
grant execute on function public.store_realtime_topic_allowed(text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
