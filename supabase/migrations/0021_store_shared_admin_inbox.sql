-- BudgetWise Store: shared admin inbox (assignment, per-admin read state,
-- quick replies, structured payment details, realtime broadcast).
--
-- STATUS: PROPOSED — NOT YET APPLIED. Review before running.
--
-- Backwards-compatible and additive:
--   * Nothing existing is dropped. The 0020 functions/policies the currently
--     deployed site uses (store_admin_chat_inbox, store_order_chat_summaries,
--     the store_order_messages SELECT policies, messages.read_at) all keep
--     working, so this can be applied BEFORE the new code ships.
--   * XOB-owned `orders` / `order_items` are read only (status), never written.
--   * Old orders: conversations are backfilled from existing messages; orders
--     with no chat (pre-0020) are simply absent from the inbox, as today.
--
-- Writes still go through server code (service role) after it has derived
-- identity from the session. Browsers get no direct table access to anything
-- new; realtime reaches them through PRIVATE broadcast channels authorised by
-- RLS on realtime.messages.

begin;

-- ===========================================================================
-- 1. Admin display names ("Sent by Robert"). admin_users is Store-owned
--    (migration 0004). Nullable: the UI falls back to the email local-part.
-- ===========================================================================
alter table public.admin_users
  add column if not exists display_name text;

alter table public.admin_users
  add constraint admin_users_display_name_valid
    check (
      display_name is null
      or (char_length(btrim(display_name)) between 1 and 40
          and display_name !~ '[[:cntrl:]]')
    );

-- ===========================================================================
-- 2. Messages: idempotency + structured payment messages
-- ===========================================================================
alter table public.store_order_messages
  add column if not exists client_message_id uuid,
  add column if not exists payload jsonb;

-- A retried send carrying the same client id resolves to the first row
-- instead of creating a duplicate.
create unique index if not exists store_order_messages_client_id_idx
  on public.store_order_messages (order_number, client_message_id)
  where client_message_id is not null;

-- Per-admin unread counting walks only customer messages newer than a cursor.
create index if not exists store_order_messages_customer_created_idx
  on public.store_order_messages (order_number, created_at)
  where sender_role = 'customer';

alter table public.store_order_messages
  drop constraint store_order_messages_kind_valid;
alter table public.store_order_messages
  add constraint store_order_messages_kind_valid
    check (kind in ('slip', 'text', 'image', 'payment'));

-- 'payment' = official payment details, built server-side from
-- store_payment_methods + the order total. Never client-supplied values.
alter table public.store_order_messages
  add constraint store_order_messages_payment_shape
    check (
      kind <> 'payment'
      or (sender_role = 'admin'
          and payload is not null
          and jsonb_typeof(payload) = 'object')
    ),
  add constraint store_order_messages_payload_only_payment
    check (payload is null or kind = 'payment'),
  add constraint store_order_messages_payload_size
    check (payload is null or pg_column_size(payload) <= 4096);

-- ===========================================================================
-- 3. Conversations: one row per order chat. Holds the inbox summary
--    (maintained by trigger), assignment, and the read cursors that are
--    shared by a whole side (customer seen / any-admin seen).
-- ===========================================================================
create or replace function public.store_chat_preview(p_kind text, p_body text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_kind
    when 'slip' then 'Order slip'
    when 'payment' then 'Payment details sent'
    when 'image' then
      case when length(btrim(coalesce(p_body, ''))) > 0
        then 'Photo: ' || left(regexp_replace(btrim(p_body), '\s+', ' ', 'g'), 150)
        else 'Photo'
      end
    else left(regexp_replace(btrim(coalesce(p_body, '')), '\s+', ' ', 'g'), 160)
  end;
$$;

create table public.store_order_conversations (
  order_number text primary key
    references public.store_order_snapshots (order_number) on delete cascade,
  assigned_admin_id uuid
    references public.admin_users (user_id) on delete set null,
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_at timestamptz,
  last_message_id uuid,
  last_message_at timestamptz not null,
  last_message_kind text not null,
  last_message_preview text not null default '',
  last_sender_role text not null,
  -- Customer has seen admin messages up to here.
  customer_last_read_at timestamptz,
  -- Most recent point ANY admin has read to (drives the customer's "Seen").
  -- Each admin's own unread state lives in store_conversation_reads.
  admin_last_read_at timestamptz,
  -- Structured payment state; set by the first 'payment' message.
  payment_details_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_order_conversations_last_kind_valid
    check (last_message_kind in ('slip', 'text', 'image', 'payment')),
  constraint store_order_conversations_last_sender_valid
    check (last_sender_role in ('customer', 'admin')),
  constraint store_order_conversations_preview_length
    check (char_length(last_message_preview) <= 200)
);

-- Inbox ordering + keyset pagination.
create index store_order_conversations_activity_idx
  on public.store_order_conversations (last_message_at desc, order_number desc);

create index store_order_conversations_assignee_idx
  on public.store_order_conversations (assigned_admin_id, last_message_at desc)
  where assigned_admin_id is not null;

-- Backfill from existing chats. The old shared read_at is carried over as
-- the side-level cursors.
insert into public.store_order_conversations (
  order_number, last_message_id, last_message_at, last_message_kind,
  last_message_preview, last_sender_role, customer_last_read_at,
  admin_last_read_at, created_at
)
select
  l.order_number,
  l.id,
  l.created_at,
  l.kind,
  public.store_chat_preview(l.kind, l.body),
  l.sender_role,
  (select max(m.created_at) from public.store_order_messages m
    where m.order_number = l.order_number
      and m.sender_role = 'admin' and m.read_at is not null),
  (select max(m.created_at) from public.store_order_messages m
    where m.order_number = l.order_number
      and m.sender_role = 'customer' and m.read_at is not null),
  (select min(m.created_at) from public.store_order_messages m
    where m.order_number = l.order_number)
from (
  select distinct on (order_number) *
  from public.store_order_messages
  order by order_number, created_at desc, id desc
) l
on conflict (order_number) do nothing;

-- ===========================================================================
-- 4. Per-admin read state. One row per (admin, conversation): a cursor, not a
--    row per message, so reading a 500-message thread is one upsert.
--    Unread for an admin = customer messages with created_at > last_read_at.
-- ===========================================================================
create table public.store_conversation_reads (
  admin_user_id uuid not null
    references public.admin_users (user_id) on delete cascade,
  order_number text not null
    references public.store_order_conversations (order_number) on delete cascade,
  last_read_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (admin_user_id, order_number)
);

create index store_conversation_reads_order_idx
  on public.store_conversation_reads (order_number);

-- Every current admin starts with the read state the shared column had, so
-- nothing already handled lights up as unread after the upgrade.
insert into public.store_conversation_reads (admin_user_id, order_number, last_read_at)
select a.user_id, c.order_number, c.admin_last_read_at
from public.store_order_conversations c
cross join public.admin_users a
where c.admin_last_read_at is not null
on conflict do nothing;

-- ===========================================================================
-- 5. Quick replies (admin-managed, no redeploy needed)
-- ===========================================================================
create table public.store_quick_replies (
  id uuid primary key default gen_random_uuid(),
  shortcut text not null,
  title text not null,
  body text not null,
  is_enabled boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_quick_replies_shortcut_format
    check (shortcut ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  constraint store_quick_replies_title_valid
    check (char_length(btrim(title)) between 1 and 80 and title !~ '[[:cntrl:]]'),
  constraint store_quick_replies_body_valid
    check (char_length(btrim(body)) between 1 and 2000)
);

create unique index store_quick_replies_shortcut_idx
  on public.store_quick_replies (shortcut);

-- ===========================================================================
-- 6. Official payment accounts (admin-managed). QR images live in a private
--    bucket and are served through an access-checked route.
-- ===========================================================================
create table public.store_payment_methods (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'gcash',
  label text not null default 'GCash',
  account_name text not null,
  account_number text not null,
  qr_storage_path text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_payment_methods_provider_valid
    check (provider in ('gcash')),
  constraint store_payment_methods_label_valid
    check (char_length(btrim(label)) between 1 and 40),
  constraint store_payment_methods_account_name_valid
    check (char_length(btrim(account_name)) between 1 and 80
           and account_name !~ '[[:cntrl:]]'),
  -- PH mobile number as GCash shows it: 11 digits starting 09.
  constraint store_payment_methods_account_number_valid
    check (account_number ~ '^09[0-9]{9}$')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-payment-qr',
  'store-payment-qr',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ===========================================================================
-- 7. Small audit log: who assigned what, who changed quick replies or
--    payment accounts. Messages are already attributed via sender_user_id.
-- ===========================================================================
create table public.store_chat_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  order_number text,
  subject_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint store_chat_audit_log_action_valid
    check (action in (
      'conversation.assigned',
      'conversation.unassigned',
      'quick_reply.created',
      'quick_reply.updated',
      'quick_reply.enabled',
      'quick_reply.disabled',
      'payment_method.created',
      'payment_method.updated'
    ))
);

create index store_chat_audit_log_created_idx
  on public.store_chat_audit_log (created_at desc);
create index store_chat_audit_log_order_idx
  on public.store_chat_audit_log (order_number, created_at desc)
  where order_number is not null;

-- ===========================================================================
-- 8. Table access: closed to browsers. Server code uses the service role.
-- ===========================================================================
alter table public.store_order_conversations enable row level security;
alter table public.store_conversation_reads enable row level security;
alter table public.store_quick_replies enable row level security;
alter table public.store_payment_methods enable row level security;
alter table public.store_chat_audit_log enable row level security;

revoke all on public.store_order_conversations from anon, authenticated;
revoke all on public.store_conversation_reads from anon, authenticated;
revoke all on public.store_quick_replies from anon, authenticated;
revoke all on public.store_payment_methods from anon, authenticated;
revoke all on public.store_chat_audit_log from anon, authenticated;

-- ===========================================================================
-- 9. Realtime broadcast (database -> private channels)
--
-- Two topics only:
--   admin:inbox          every admin, one channel each: message + conversation
--                        events, plus client presence (viewing) and typing.
--   order:<order_number> that order's customer (and admins): customer-safe
--                        message events and "seen" updates.
--
-- Payloads are built here, so the customer topic never carries
-- sender_user_id, attachment paths, or QR storage paths.
-- ===========================================================================
create or replace function public.store_chat_send(
  p_topic text, p_event text, p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform realtime.send(p_payload, p_event, p_topic, true);
exception when others then
  -- A realtime hiccup must never roll back a customer's message. Clients
  -- recover anything missed through their delta fetch on reconnect.
  raise warning 'store_chat_send(%) failed: %', p_topic, sqlerrm;
end;
$$;

create or replace function public.store_chat_conversation_json(p_order_number text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'order_number', c.order_number,
    'buyer_name', s.buyer_name,
    'buyer_roblox_username', s.buyer_roblox_username,
    'total_amount', s.total_amount,
    'order_created_at', s.created_at,
    'assigned_admin_id', c.assigned_admin_id,
    'assigned_at', c.assigned_at,
    'last_message_id', c.last_message_id,
    'last_message_at', c.last_message_at,
    'last_message_kind', c.last_message_kind,
    'last_message_preview', c.last_message_preview,
    'last_sender_role', c.last_sender_role,
    'customer_last_read_at', c.customer_last_read_at,
    'payment_details_sent_at', c.payment_details_sent_at,
    'order_status', (
      select o.status from public.orders o
      where o.order_number = c.order_number limit 1
    )
  )
  from public.store_order_conversations c
  join public.store_order_snapshots s on s.order_number = c.order_number
  where c.order_number = p_order_number;
$$;

create or replace function public.store_order_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_public_payload jsonb := case
    when new.payload is null then null
    else new.payload - 'qr_path'
  end;
begin
  insert into public.store_order_conversations as c (
    order_number, last_message_id, last_message_at, last_message_kind,
    last_message_preview, last_sender_role, payment_details_sent_at
  )
  values (
    new.order_number, new.id, new.created_at, new.kind,
    public.store_chat_preview(new.kind, new.body), new.sender_role,
    case when new.kind = 'payment' then new.created_at end
  )
  on conflict (order_number) do update set
    last_message_id = excluded.last_message_id,
    last_message_at = excluded.last_message_at,
    last_message_kind = excluded.last_message_kind,
    last_message_preview = excluded.last_message_preview,
    last_sender_role = excluded.last_sender_role,
    payment_details_sent_at = coalesce(
      excluded.payment_details_sent_at, c.payment_details_sent_at
    ),
    updated_at = now()
  where excluded.last_message_at >= c.last_message_at;

  perform public.store_chat_send(
    'order:' || new.order_number,
    'message',
    jsonb_build_object('message', jsonb_build_object(
      'id', new.id,
      'order_number', new.order_number,
      'sender_role', new.sender_role,
      'kind', new.kind,
      'body', new.body,
      'has_attachment', new.attachment_path is not null,
      'payload', v_public_payload,
      'created_at', new.created_at,
      -- Lets the sending customer reconcile its optimistic bubble.
      'client_message_id',
        case when new.sender_role = 'customer' then new.client_message_id end
    ))
  );

  perform public.store_chat_send(
    'admin:inbox',
    'message',
    jsonb_build_object(
      'message', jsonb_build_object(
        'id', new.id,
        'order_number', new.order_number,
        'sender_role', new.sender_role,
        'sender_user_id', new.sender_user_id,
        'kind', new.kind,
        'body', new.body,
        'has_attachment', new.attachment_path is not null,
        'payload', v_public_payload,
        'created_at', new.created_at,
        'client_message_id', new.client_message_id
      ),
      'conversation', public.store_chat_conversation_json(new.order_number)
    )
  );

  return new;
end;
$$;

create trigger store_order_messages_after_insert
  after insert on public.store_order_messages
  for each row execute function public.store_order_messages_after_insert();

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
      'conversation', public.store_chat_conversation_json(new.order_number)
    )
  );

  if new.admin_last_read_at is distinct from old.admin_last_read_at then
    perform public.store_chat_send(
      'order:' || new.order_number,
      'seen',
      jsonb_build_object('admin_last_read_at', new.admin_last_read_at)
    );
  end if;

  return new;
end;
$$;

-- Fires for assignment and read-cursor changes only. A new message updates
-- the row too, but that event is already broadcast by the message trigger.
create trigger store_order_conversations_after_update
  after update on public.store_order_conversations
  for each row
  when (
    old.assigned_admin_id is distinct from new.assigned_admin_id
    or old.customer_last_read_at is distinct from new.customer_last_read_at
    or old.admin_last_read_at is distinct from new.admin_last_read_at
  )
  execute function public.store_order_conversations_after_update();

create or replace function public.store_quick_replies_after_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Tiny "something changed" ping; admin tabs refetch the (small) list.
  perform public.store_chat_send('admin:inbox', 'quick_replies', '{}'::jsonb);
  return null;
end;
$$;

create trigger store_quick_replies_after_change
  after insert or update or delete on public.store_quick_replies
  for each statement execute function public.store_quick_replies_after_change();

-- ===========================================================================
-- 10. Server-only RPCs. Every one takes the acting admin id from the CALLER
--     (server code, which derived it from the session) and re-checks it
--     against admin_users, so a bug upstream still cannot act as a non-admin.
-- ===========================================================================
create or replace function public.store_admin_inbox(
  p_admin uuid,
  p_filter text default 'all',
  p_search text default null,
  p_before_at timestamptz default null,
  p_before_order text default null,
  p_limit integer default 30,
  p_order_number text default null
)
returns table (
  order_number text,
  buyer_name text,
  buyer_roblox_username text,
  total_amount numeric,
  order_created_at timestamptz,
  assigned_admin_id uuid,
  assigned_at timestamptz,
  last_message_id uuid,
  last_message_at timestamptz,
  last_message_kind text,
  last_message_preview text,
  last_sender_role text,
  customer_last_read_at timestamptz,
  payment_details_sent_at timestamptz,
  order_status text,
  my_last_read_at timestamptz,
  unread_count integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    c.order_number,
    s.buyer_name,
    s.buyer_roblox_username,
    s.total_amount,
    s.created_at,
    c.assigned_admin_id,
    c.assigned_at,
    c.last_message_id,
    c.last_message_at,
    c.last_message_kind,
    c.last_message_preview,
    c.last_sender_role,
    c.customer_last_read_at,
    c.payment_details_sent_at,
    st.status,
    r.last_read_at,
    coalesce(u.n, 0)
  from public.store_order_conversations c
  join public.store_order_snapshots s on s.order_number = c.order_number
  left join public.store_conversation_reads r
    on r.order_number = c.order_number and r.admin_user_id = p_admin
  left join lateral (
    select o.status from public.orders o
    where o.order_number = c.order_number limit 1
  ) st on true
  left join lateral (
    select count(*)::integer as n
    from public.store_order_messages m
    where m.order_number = c.order_number
      and m.sender_role = 'customer'
      and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
  ) u on true
  where exists (select 1 from public.admin_users a where a.user_id = p_admin)
    and (p_order_number is null or c.order_number = p_order_number)
    -- p_search arrives with LIKE wildcards already escaped by the server.
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
      or (p_filter = 'mine' and c.assigned_admin_id = p_admin)
      or (p_filter = 'under_review' and st.status = 'pending')
    )
    and (
      p_before_at is null
      or (c.last_message_at, c.order_number) < (p_before_at, p_before_order)
    )
  order by c.last_message_at desc, c.order_number desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.store_mark_admin_read(
  p_order_number text, p_admin uuid, p_read_up_to timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_at timestamptz := least(coalesce(p_read_up_to, now()), now());
begin
  if not exists (select 1 from public.admin_users where user_id = p_admin) then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  insert into public.store_conversation_reads as r (admin_user_id, order_number, last_read_at)
  values (p_admin, p_order_number, v_at)
  on conflict (admin_user_id, order_number) do update
    set last_read_at = greatest(r.last_read_at, excluded.last_read_at),
        updated_at = now()
  returning last_read_at into v_at;

  update public.store_order_conversations
     set admin_last_read_at = v_at, updated_at = now()
   where order_number = p_order_number
     and (admin_last_read_at is null or admin_last_read_at < v_at);

  -- Only the reading admin's other tabs/devices act on this; other admins'
  -- unread counts are untouched.
  perform public.store_chat_send(
    'admin:inbox', 'read',
    jsonb_build_object(
      'order_number', p_order_number,
      'admin_user_id', p_admin,
      'last_read_at', v_at
    )
  );

  return v_at;
end;
$$;

create or replace function public.store_mark_customer_read(
  p_order_number text, p_read_up_to timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_at timestamptz := least(coalesce(p_read_up_to, now()), now());
begin
  update public.store_order_conversations
     set customer_last_read_at = v_at, updated_at = now()
   where order_number = p_order_number
     and (customer_last_read_at is null or customer_last_read_at < v_at);
  return v_at;
end;
$$;

create or replace function public.store_assign_conversation(
  p_order_number text, p_assignee uuid, p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_previous uuid;
begin
  if not exists (select 1 from public.admin_users where user_id = p_actor) then
    raise exception 'actor is not an admin' using errcode = '42501';
  end if;

  if p_assignee is not null
     and not exists (select 1 from public.admin_users where user_id = p_assignee)
  then
    raise exception 'assignee is not an admin' using errcode = '22023';
  end if;

  select assigned_admin_id into v_previous
    from public.store_order_conversations
   where order_number = p_order_number
   for update;

  if not found then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;

  if v_previous is distinct from p_assignee then
    update public.store_order_conversations
       set assigned_admin_id = p_assignee,
           assigned_by = p_actor,
           assigned_at = case when p_assignee is null then null else now() end,
           updated_at = now()
     where order_number = p_order_number;

    insert into public.store_chat_audit_log (actor_user_id, action, order_number, details)
    values (
      p_actor,
      case when p_assignee is null
        then 'conversation.unassigned' else 'conversation.assigned' end,
      p_order_number,
      jsonb_build_object('from', v_previous, 'to', p_assignee)
    );
  end if;

  return public.store_chat_conversation_json(p_order_number);
end;
$$;

revoke all on function public.store_chat_preview(text, text) from public, anon, authenticated;
revoke all on function public.store_chat_send(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.store_chat_conversation_json(text) from public, anon, authenticated;
revoke all on function public.store_order_messages_after_insert() from public, anon, authenticated;
revoke all on function public.store_order_conversations_after_update() from public, anon, authenticated;
revoke all on function public.store_quick_replies_after_change() from public, anon, authenticated;
revoke all on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text) from public, anon, authenticated;
revoke all on function public.store_mark_admin_read(text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.store_mark_customer_read(text, timestamptz) from public, anon, authenticated;
revoke all on function public.store_assign_conversation(text, uuid, uuid) from public, anon, authenticated;

grant execute on function public.store_chat_conversation_json(text) to service_role;
grant execute on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text) to service_role;
grant execute on function public.store_mark_admin_read(text, uuid, timestamptz) to service_role;
grant execute on function public.store_mark_customer_read(text, timestamptz) to service_role;
grant execute on function public.store_assign_conversation(text, uuid, uuid) to service_role;

-- ===========================================================================
-- 11. Realtime authorization (RLS on realtime.messages)
--
--   admin:inbox  — admins may receive AND send (presence + typing broadcast).
--   order:<n>    — the order's owner and admins may receive. Nobody may send:
--                  customers can't inject events or presence into a channel.
-- ===========================================================================
create policy "store chat: admins receive admin inbox"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() = 'admin:inbox'
    and public.is_store_admin()
  );

create policy "store chat: admins send presence and typing"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.topic() = 'admin:inbox'
    and realtime.messages.extension in ('broadcast', 'presence')
    and public.is_store_admin()
  );

create policy "store chat: owner or admin receives order topic"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() like 'order:%'
    and (
      public.is_store_admin()
      or exists (
        select 1
          from public.store_order_snapshots s
         where s.order_number = substr(realtime.topic(), 7)
           and s.owner_user_id = auth.uid()
      )
    )
  );

notify pgrst, 'reload schema';

commit;
