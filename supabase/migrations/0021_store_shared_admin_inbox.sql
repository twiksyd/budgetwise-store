-- BudgetWise Store: shared admin inbox foundation.
--
-- STATUS: PROPOSED — NOT APPLIED ANYWHERE. Review before running.
--
-- Adds: per-conversation inbox state, per-admin read cursors, assignment,
-- quick replies, payment accounts, structured payment messages, idempotent
-- client message ids, an audit log, and private realtime broadcast topics.
--
-- Properties (verified by supabase/tests, see scripts/test-db.sh):
--   * Additive. No existing table, column, function or policy is dropped.
--     The currently deployed site keeps working unchanged after this runs.
--   * Re-runnable. Every statement is guarded; a second run is a no-op.
--   * Existing data: no message, order or snapshot row is modified, except
--     that admin_users rows get two new column values (see section 1).
--   * XOB-owned `orders` / `order_items` are only ever READ (status).
--   * Browsers get no table access to anything new. Realtime events reach
--     them only through private topics authorised below, and carry ids and
--     timestamps — never message bodies, admin ids or storage paths
--     (customer topic) — so content always flows through authorised APIs.

begin;

-- Hold new message writes (reads continue) until COMMIT, so no message can
-- slip in between the backfill below and the trigger that takes over from
-- it. Checkout/chat sends wait for the second or so this migration takes.
lock table public.store_order_messages in share row exclusive mode;

-- ===========================================================================
-- 1. Admin identity
--
-- display_name: the trusted name shown to other admins ("Robert is typing").
-- unread_since: an admin added in future does not inherit the entire
--   historical backlog as "unread". Existing admins get -infinity, so their
--   unread counts are exactly what they are today.
-- ===========================================================================
alter table public.admin_users
  add column if not exists display_name text,
  add column if not exists unread_since timestamptz;

update public.admin_users
   set unread_since = '-infinity'
 where unread_since is null;

alter table public.admin_users
  alter column unread_since set default now(),
  alter column unread_since set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'admin_users_display_name_valid'
       and conrelid = 'public.admin_users'::regclass
  ) then
    alter table public.admin_users
      add constraint admin_users_display_name_valid
      check (
        display_name is null
        or (char_length(btrim(display_name)) between 1 and 40
            and display_name !~ '[[:cntrl:]]')
      ) not valid;
  end if;
end $$;

alter table public.admin_users
  validate constraint admin_users_display_name_valid;

-- ===========================================================================
-- 2. Messages: idempotency key + structured payment messages
-- ===========================================================================
alter table public.store_order_messages
  add column if not exists client_message_id uuid,
  add column if not exists payload jsonb;

-- One intended message = one row. Scoped to the sender, so one person's
-- client id can never collide with, or suppress, anyone else's message.
create unique index if not exists store_order_messages_sender_client_id_idx
  on public.store_order_messages (order_number, sender_user_id, client_message_id)
  where client_message_id is not null;

-- Stable total order for pagination and read cursors: (created_at, id).
create index if not exists store_order_messages_order_cursor_idx
  on public.store_order_messages (order_number, created_at, id);

-- Per-admin unread counting only walks customer messages.
create index if not exists store_order_messages_customer_cursor_idx
  on public.store_order_messages (order_number, created_at, id)
  where sender_role = 'customer';

do $$
begin
  -- Widen the kind list to include 'payment'.
  if exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_kind_valid'
       and conrelid = 'public.store_order_messages'::regclass
       and pg_get_constraintdef(oid) not like '%payment%'
  ) then
    alter table public.store_order_messages
      drop constraint store_order_messages_kind_valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_kind_valid'
       and conrelid = 'public.store_order_messages'::regclass
  ) then
    alter table public.store_order_messages
      add constraint store_order_messages_kind_valid
      check (kind in ('slip', 'text', 'image', 'payment')) not valid;
  end if;

  -- Payment details only ever come from an admin, as a JSON object.
  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_payment_shape'
       and conrelid = 'public.store_order_messages'::regclass
  ) then
    alter table public.store_order_messages
      add constraint store_order_messages_payment_shape
      check (
        kind <> 'payment'
        or (sender_role = 'admin'
            and payload is not null
            and jsonb_typeof(payload) = 'object')
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_payload_only_payment'
       and conrelid = 'public.store_order_messages'::regclass
  ) then
    alter table public.store_order_messages
      add constraint store_order_messages_payload_only_payment
      check (payload is null or kind = 'payment') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_payload_size'
       and conrelid = 'public.store_order_messages'::regclass
  ) then
    alter table public.store_order_messages
      add constraint store_order_messages_payload_size
      check (payload is null or pg_column_size(payload) <= 4096) not valid;
  end if;
end $$;

-- VALIDATE takes a lock that does not block reads or inserts.
alter table public.store_order_messages validate constraint store_order_messages_kind_valid;
alter table public.store_order_messages validate constraint store_order_messages_payment_shape;
alter table public.store_order_messages validate constraint store_order_messages_payload_only_payment;
alter table public.store_order_messages validate constraint store_order_messages_payload_size;

-- ===========================================================================
-- 3. Conversations — one row per order chat
--
-- id is an opaque random UUID used as the realtime topic (chat:<id>), so
-- order numbers never appear in channel names. Read cursors are
-- (timestamp, message id) pairs: an exact position in the thread.
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

create table if not exists public.store_order_conversations (
  order_number text primary key
    references public.store_order_snapshots (order_number) on delete cascade,
  id uuid not null default gen_random_uuid(),
  assigned_admin_id uuid
    references public.admin_users (user_id) on delete set null,
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_at timestamptz,
  last_message_id uuid not null,
  last_message_at timestamptz not null,
  last_message_kind text not null,
  last_message_preview text not null default '',
  last_sender_role text not null,
  -- Customer has read admin messages up to this position.
  customer_read_at timestamptz,
  customer_read_message_id uuid,
  -- Furthest position ANY admin has read to: drives the customer's "Seen".
  -- Each admin's own unread state is in store_conversation_reads.
  admin_read_at timestamptz,
  admin_read_message_id uuid,
  -- Structured payment state, set by the first 'payment' message.
  payment_details_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_order_conversations_id_key unique (id),
  constraint store_order_conversations_last_kind_valid
    check (last_message_kind in ('slip', 'text', 'image', 'payment')),
  constraint store_order_conversations_last_sender_valid
    check (last_sender_role in ('customer', 'admin')),
  constraint store_order_conversations_preview_length
    check (char_length(last_message_preview) <= 200),
  constraint store_order_conversations_customer_cursor_pair
    check ((customer_read_at is null) = (customer_read_message_id is null)),
  constraint store_order_conversations_admin_cursor_pair
    check ((admin_read_at is null) = (admin_read_message_id is null))
);

create index if not exists store_order_conversations_activity_idx
  on public.store_order_conversations (last_message_at desc, order_number desc);

create index if not exists store_order_conversations_assignee_idx
  on public.store_order_conversations (assigned_admin_id, last_message_at desc)
  where assigned_admin_id is not null;

-- Backfill: one row per order that already has messages. The old shared
-- messages.read_at becomes the side-level cursors:
--   admin cursor    = newest CUSTOMER message that has read_at set
--   customer cursor = newest ADMIN message that has read_at set
-- Old code always marked every unread message at once, so "read" messages
-- are always a prefix of the thread; the cursor reproduces it exactly.
insert into public.store_order_conversations (
  order_number, last_message_id, last_message_at, last_message_kind,
  last_message_preview, last_sender_role,
  customer_read_at, customer_read_message_id,
  admin_read_at, admin_read_message_id,
  created_at
)
select
  l.order_number, l.id, l.created_at, l.kind,
  public.store_chat_preview(l.kind, l.body), l.sender_role,
  cr.created_at, cr.id,
  ar.created_at, ar.id,
  f.first_at
from (
  select distinct on (m.order_number)
    m.order_number, m.id, m.created_at, m.kind, m.body, m.sender_role
  from public.store_order_messages m
  order by m.order_number, m.created_at desc, m.id desc
) l
left join lateral (
  select m.created_at, m.id from public.store_order_messages m
   where m.order_number = l.order_number
     and m.sender_role = 'admin' and m.read_at is not null
   order by m.created_at desc, m.id desc limit 1
) cr on true
left join lateral (
  select m.created_at, m.id from public.store_order_messages m
   where m.order_number = l.order_number
     and m.sender_role = 'customer' and m.read_at is not null
   order by m.created_at desc, m.id desc limit 1
) ar on true
left join lateral (
  select min(m.created_at) as first_at from public.store_order_messages m
   where m.order_number = l.order_number
) f on true
on conflict (order_number) do nothing;

-- ===========================================================================
-- 4. Per-admin read cursors — one row per (admin, conversation)
--
-- unread(admin, chat) = customer messages positioned after the admin's
-- cursor (or after admin_users.unread_since if the admin never opened it).
-- ===========================================================================
create table if not exists public.store_conversation_reads (
  admin_user_id uuid not null
    references public.admin_users (user_id) on delete cascade,
  order_number text not null
    references public.store_order_conversations (order_number) on delete cascade,
  last_read_at timestamptz not null,
  last_read_message_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (admin_user_id, order_number)
);

create index if not exists store_conversation_reads_order_idx
  on public.store_conversation_reads (order_number);

-- Each existing admin inherits the shared read position, so chats that are
-- handled today stay handled for everyone.
insert into public.store_conversation_reads (
  admin_user_id, order_number, last_read_at, last_read_message_id
)
select a.user_id, c.order_number, c.admin_read_at, c.admin_read_message_id
  from public.store_order_conversations c
 cross join public.admin_users a
 where c.admin_read_at is not null
on conflict (admin_user_id, order_number) do nothing;

-- ===========================================================================
-- 5. Quick replies
--
-- Shortcuts are stored lowercase only (the format check rejects capitals),
-- so /was, /WAS and /Was are the same shortcut and uniqueness is enforced
-- by the database. Written only through store_save_quick_reply().
-- ===========================================================================
create table if not exists public.store_quick_replies (
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

create unique index if not exists store_quick_replies_shortcut_idx
  on public.store_quick_replies (shortcut);

-- ===========================================================================
-- 6. Official payment accounts + private QR bucket
--
-- QR files are written once under a new random name and never overwritten,
-- so payment messages already sent keep showing the QR they were sent with.
-- ===========================================================================
create table if not exists public.store_payment_methods (
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
    check (char_length(btrim(label)) between 1 and 40 and label !~ '[[:cntrl:]]'),
  constraint store_payment_methods_account_name_valid
    check (char_length(btrim(account_name)) between 1 and 80
           and account_name !~ '[[:cntrl:]]'),
  constraint store_payment_methods_account_number_valid
    check (account_number ~ '^09[0-9]{9}$'),
  constraint store_payment_methods_qr_path_valid
    check (
      qr_storage_path is null
      or qr_storage_path ~ '^qr/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$'
    )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-payment-qr', 'store-payment-qr', false, 2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ===========================================================================
-- 7. Audit log (small on purpose). Messages are attributed by
--    store_order_messages.sender_user_id; everything else lands here.
-- ===========================================================================
create table if not exists public.store_chat_audit_log (
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
      'payment_method.created',
      'payment_method.updated'
    ))
);

create index if not exists store_chat_audit_log_created_idx
  on public.store_chat_audit_log (created_at desc);
create index if not exists store_chat_audit_log_order_idx
  on public.store_chat_audit_log (order_number, created_at desc)
  where order_number is not null;

-- ===========================================================================
-- 8. Browser access to the new tables: none. Server code (service role)
--    reads/writes after deriving identity from the session.
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
-- 9. Realtime broadcast from the database
--
-- Topics:
--   admin:inbox  — admins only. Compact inbox events (ids, timestamps, a
--                  160-char preview for the list row, assignment, cursors).
--                  Typing/viewing signals are also published here, but ONLY
--                  by the server (see section 11: browsers cannot publish).
--   chat:<uuid>  — that order's customer only. "Something changed" pings:
--                  message id + timestamp, seen cursor. No content.
-- realtime.send() delivers after COMMIT, so rolled-back work is never sent.
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
  -- A realtime problem must never roll back a customer's message; clients
  -- recover anything missed with their delta fetch on reconnect.
  raise warning 'store_chat_send(%) failed: %', p_topic, sqlerrm;
end;
$$;

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

drop trigger if exists store_order_messages_after_insert on public.store_order_messages;
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

-- Assignment and read-cursor changes only. New messages also touch the row,
-- but those are already broadcast by the message trigger.
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

create or replace function public.store_quick_replies_after_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- "List changed" ping; admin tabs refetch the small list.
  perform public.store_chat_send('admin:inbox', 'quick_replies', '{}'::jsonb);
  return null;
end;
$$;

drop trigger if exists store_quick_replies_after_change on public.store_quick_replies;
create trigger store_quick_replies_after_change
  after insert or update or delete on public.store_quick_replies
  for each statement execute function public.store_quick_replies_after_change();

-- Transition only (removed by the cleanup migration): the currently deployed
-- code marks messages read by setting messages.read_at, which is shared by
-- every admin. Mirror those writes into the new cursors so nothing handled
-- between applying this migration and deploying the new code reappears as
-- unread afterwards.
create or replace function public.store_order_messages_legacy_read_sync()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.sender_role = 'customer' then
    insert into public.store_conversation_reads as r (
      admin_user_id, order_number, last_read_at, last_read_message_id
    )
    select a.user_id, new.order_number, new.created_at, new.id
      from public.admin_users a
    on conflict (admin_user_id, order_number) do update
      set last_read_at = excluded.last_read_at,
          last_read_message_id = excluded.last_read_message_id,
          updated_at = now()
      where (r.last_read_at, r.last_read_message_id)
            < (excluded.last_read_at, excluded.last_read_message_id);

    update public.store_order_conversations c
       set admin_read_at = new.created_at,
           admin_read_message_id = new.id,
           updated_at = now()
     where c.order_number = new.order_number
       and (c.admin_read_at is null
            or (c.admin_read_at, c.admin_read_message_id) < (new.created_at, new.id));
  else
    update public.store_order_conversations c
       set customer_read_at = new.created_at,
           customer_read_message_id = new.id,
           updated_at = now()
     where c.order_number = new.order_number
       and (c.customer_read_at is null
            or (c.customer_read_at, c.customer_read_message_id) < (new.created_at, new.id));
  end if;
  return null;
end;
$$;

drop trigger if exists store_order_messages_legacy_read_sync on public.store_order_messages;
create trigger store_order_messages_legacy_read_sync
  after update of read_at on public.store_order_messages
  for each row
  when (old.read_at is null and new.read_at is not null)
  execute function public.store_order_messages_legacy_read_sync();

-- ===========================================================================
-- 10. Server-only functions
--
-- Callable by the service role only. Every function that acts for an admin
-- takes that admin's id from the caller (server code, which derived it from
-- the verified session) and re-checks it against admin_users.
-- ===========================================================================

-- Inbox page / single row. p_search must arrive with LIKE wildcards escaped.
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

-- The signed-in customer's own chats (My Orders).
create or replace function public.store_customer_conversations(p_user uuid)
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

-- Moves one admin's cursor forward to a message they were shown. Never
-- backwards, never another admin's row, never a message from another chat.
create or replace function public.store_mark_admin_read(
  p_order_number text, p_admin uuid, p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_at timestamptz;
  v_id uuid;
begin
  if not exists (select 1 from public.admin_users where user_id = p_admin) then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  select m.created_at, m.id into v_at, v_id
    from public.store_order_messages m
   where m.id = p_message_id and m.order_number = p_order_number;
  if not found then
    raise exception 'message not in this conversation' using errcode = 'P0002';
  end if;

  insert into public.store_conversation_reads as r (
    admin_user_id, order_number, last_read_at, last_read_message_id
  )
  values (p_admin, p_order_number, v_at, v_id)
  on conflict (admin_user_id, order_number) do update
    set last_read_at = excluded.last_read_at,
        last_read_message_id = excluded.last_read_message_id,
        updated_at = now()
    where (r.last_read_at, r.last_read_message_id)
          < (excluded.last_read_at, excluded.last_read_message_id);

  select r.last_read_at, r.last_read_message_id into v_at, v_id
    from public.store_conversation_reads r
   where r.admin_user_id = p_admin and r.order_number = p_order_number;

  update public.store_order_conversations c
     set admin_read_at = v_at, admin_read_message_id = v_id, updated_at = now()
   where c.order_number = p_order_number
     and (c.admin_read_at is null
          or (c.admin_read_at, c.admin_read_message_id) < (v_at, v_id));

  -- Lets the same admin's other tabs/devices clear the badge.
  perform public.store_chat_send(
    'admin:inbox', 'read',
    jsonb_build_object(
      'order_number', p_order_number,
      'admin_user_id', p_admin,
      'last_read_at', v_at,
      'last_read_message_id', v_id
    )
  );

  return jsonb_build_object('last_read_at', v_at, 'last_read_message_id', v_id);
end;
$$;

-- Server verifies the caller owns the order before calling this.
create or replace function public.store_mark_customer_read(
  p_order_number text, p_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_at timestamptz;
  v_id uuid;
begin
  select m.created_at, m.id into v_at, v_id
    from public.store_order_messages m
   where m.id = p_message_id and m.order_number = p_order_number;
  if not found then
    raise exception 'message not in this conversation' using errcode = 'P0002';
  end if;

  update public.store_order_conversations c
     set customer_read_at = v_at, customer_read_message_id = v_id, updated_at = now()
   where c.order_number = p_order_number
     and (c.customer_read_at is null
          or (c.customer_read_at, c.customer_read_message_id) < (v_at, v_id));

  return (
    select jsonb_build_object(
      'customer_read_at', c.customer_read_at,
      'customer_read_message_id', c.customer_read_message_id)
      from public.store_order_conversations c
     where c.order_number = p_order_number
  );
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
  v_row public.store_order_conversations;
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

  select * into v_row from public.store_order_conversations
   where order_number = p_order_number;

  return jsonb_build_object(
    'conversation_id', v_row.id,
    'order_number', v_row.order_number,
    'assigned_admin_id', v_row.assigned_admin_id,
    'assigned_by', v_row.assigned_by,
    'assigned_at', v_row.assigned_at
  );
end;
$$;

-- Create (p_id null) or edit a quick reply. created_by / updated_by come
-- from p_actor — never from the browser — and every change is audited in
-- the same transaction.
create or replace function public.store_save_quick_reply(
  p_actor uuid,
  p_id uuid,
  p_shortcut text,
  p_title text,
  p_body text,
  p_is_enabled boolean
)
returns public.store_quick_replies
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before public.store_quick_replies;
  v_after public.store_quick_replies;
  v_shortcut text := lower(btrim(coalesce(p_shortcut, '')));
begin
  if not exists (select 1 from public.admin_users where user_id = p_actor) then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.store_quick_replies (
      shortcut, title, body, is_enabled, created_by, updated_by
    )
    values (
      v_shortcut, btrim(p_title), p_body, coalesce(p_is_enabled, true),
      p_actor, p_actor
    )
    returning * into v_after;

    insert into public.store_chat_audit_log (actor_user_id, action, subject_id, details)
    values (p_actor, 'quick_reply.created', v_after.id,
            jsonb_build_object('shortcut', v_after.shortcut, 'title', v_after.title,
                               'is_enabled', v_after.is_enabled));
  else
    select * into v_before from public.store_quick_replies
     where id = p_id for update;
    if not found then
      raise exception 'quick reply not found' using errcode = 'P0002';
    end if;

    update public.store_quick_replies
       set shortcut = v_shortcut,
           title = btrim(p_title),
           body = p_body,
           is_enabled = coalesce(p_is_enabled, v_before.is_enabled),
           updated_by = p_actor,
           updated_at = now()
     where id = p_id
    returning * into v_after;

    insert into public.store_chat_audit_log (actor_user_id, action, subject_id, details)
    values (p_actor, 'quick_reply.updated', v_after.id,
            jsonb_build_object(
              'before', jsonb_build_object('shortcut', v_before.shortcut, 'title', v_before.title,
                                           'body', v_before.body, 'is_enabled', v_before.is_enabled),
              'after', jsonb_build_object('shortcut', v_after.shortcut, 'title', v_after.title,
                                          'body', v_after.body, 'is_enabled', v_after.is_enabled)));
  end if;

  return v_after;
end;
$$;

-- Create (p_id null) or edit a payment account, audited with before/after.
create or replace function public.store_save_payment_method(
  p_actor uuid,
  p_id uuid,
  p_label text,
  p_account_name text,
  p_account_number text,
  p_qr_storage_path text,
  p_is_active boolean,
  p_sort_order integer default 0
)
returns public.store_payment_methods
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before public.store_payment_methods;
  v_after public.store_payment_methods;
begin
  if not exists (select 1 from public.admin_users where user_id = p_actor) then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.store_payment_methods (
      label, account_name, account_number, qr_storage_path, is_active,
      sort_order, created_by, updated_by
    )
    values (
      btrim(p_label), btrim(p_account_name), p_account_number, p_qr_storage_path,
      coalesce(p_is_active, true), coalesce(p_sort_order, 0), p_actor, p_actor
    )
    returning * into v_after;

    insert into public.store_chat_audit_log (actor_user_id, action, subject_id, details)
    values (p_actor, 'payment_method.created', v_after.id,
            jsonb_build_object('after', to_jsonb(v_after)
              - 'created_by' - 'updated_by' - 'created_at' - 'updated_at'));
  else
    select * into v_before from public.store_payment_methods
     where id = p_id for update;
    if not found then
      raise exception 'payment method not found' using errcode = 'P0002';
    end if;

    update public.store_payment_methods
       set label = btrim(p_label),
           account_name = btrim(p_account_name),
           account_number = p_account_number,
           qr_storage_path = p_qr_storage_path,
           is_active = coalesce(p_is_active, v_before.is_active),
           sort_order = coalesce(p_sort_order, v_before.sort_order),
           updated_by = p_actor,
           updated_at = now()
     where id = p_id
    returning * into v_after;

    insert into public.store_chat_audit_log (actor_user_id, action, subject_id, details)
    values (p_actor, 'payment_method.updated', v_after.id,
            jsonb_build_object(
              'before', to_jsonb(v_before) - 'created_by' - 'updated_by' - 'created_at' - 'updated_at',
              'after', to_jsonb(v_after) - 'created_by' - 'updated_by' - 'created_at' - 'updated_at'));
  end if;

  return v_after;
end;
$$;

-- Builds the payment message entirely from database values: the amount is
-- the order's snapshot total and the account is a stored payment method.
-- Server code cannot pass a different amount or number even by mistake.
-- Idempotent per (order, admin, client message id).
create or replace function public.store_send_payment_details(
  p_order_number text,
  p_actor uuid,
  p_method_id uuid,
  p_client_message_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_method public.store_payment_methods;
  v_total numeric;
  v_id uuid;
begin
  if not exists (select 1 from public.admin_users where user_id = p_actor) then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  select * into v_method from public.store_payment_methods
   where id = p_method_id and is_active;
  if not found then
    raise exception 'payment method not available' using errcode = 'P0002';
  end if;

  select s.total_amount into v_total from public.store_order_snapshots s
   where s.order_number = p_order_number;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  insert into public.store_order_messages (
    order_number, sender_role, sender_user_id, kind, body, payload, client_message_id
  )
  values (
    p_order_number, 'admin', p_actor, 'payment',
    format('%s payment details. Amount: PHP %s. Account: %s (%s).',
           v_method.label, to_char(v_total, 'FM999,999,990.00'),
           v_method.account_name, v_method.account_number),
    jsonb_build_object(
      'method_id', v_method.id,
      'provider', v_method.provider,
      'label', v_method.label,
      'account_name', v_method.account_name,
      'account_number', v_method.account_number,
      'amount', v_total,
      'currency', 'PHP',
      'has_qr', v_method.qr_storage_path is not null,
      'qr_path', v_method.qr_storage_path
    ),
    p_client_message_id
  )
  on conflict (order_number, sender_user_id, client_message_id)
    where client_message_id is not null
    do nothing
  returning id into v_id;

  if v_id is null then
    select m.id into v_id from public.store_order_messages m
     where m.order_number = p_order_number
       and m.sender_user_id = p_actor
       and m.client_message_id = p_client_message_id;
  end if;

  return v_id;
end;
$$;

-- The one write path for chat text/image messages. Idempotent per
-- (order, sender, client message id): a retry returns the original row; the
-- same id reused for DIFFERENT content is refused (BW010) instead of being
-- silently merged. Re-checks that the sender may post in this chat.
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
    if not exists (
      select 1 from public.store_order_snapshots
       where order_number = p_order_number and owner_user_id = p_sender
    ) then
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

-- Keyset pages over the exact (created_at, id) order. Always returned oldest
-- first. Newest page by default; older than / newer than a message id
-- otherwise. A cursor from another chat is refused.
create or replace function public.store_chat_messages_page(
  p_order_number text,
  p_before_message_id uuid default null,
  p_after_message_id uuid default null,
  p_limit integer default 50
)
returns setof public.store_order_messages
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_at timestamptz;
  v_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if p_after_message_id is not null then
    select m.created_at, m.id into v_at, v_id from public.store_order_messages m
     where m.id = p_after_message_id and m.order_number = p_order_number;
    if not found then
      raise exception 'cursor not in this conversation' using errcode = 'P0002';
    end if;
    return query
      select m.* from public.store_order_messages m
       where m.order_number = p_order_number and (m.created_at, m.id) > (v_at, v_id)
       order by m.created_at, m.id
       limit v_limit;
    return;
  end if;

  if p_before_message_id is not null then
    select m.created_at, m.id into v_at, v_id from public.store_order_messages m
     where m.id = p_before_message_id and m.order_number = p_order_number;
    if not found then
      raise exception 'cursor not in this conversation' using errcode = 'P0002';
    end if;
  end if;

  return query
    select x.* from (
      select m.* from public.store_order_messages m
       where m.order_number = p_order_number
         and (p_before_message_id is null or (m.created_at, m.id) < (v_at, v_id))
       order by m.created_at desc, m.id desc
       limit v_limit
    ) x
    order by x.created_at, x.id;
end;
$$;

-- Used by the realtime policy below. Answers only "may the CURRENT user
-- receive this topic?" — it reveals nothing else.
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

-- Function privileges: service role only, except the topic check (which
-- the realtime policy evaluates as the connecting user).
revoke all on function public.store_chat_preview(text, text) from public, anon, authenticated;
revoke all on function public.store_chat_send(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.store_order_messages_after_insert() from public, anon, authenticated;
revoke all on function public.store_order_conversations_after_update() from public, anon, authenticated;
revoke all on function public.store_quick_replies_after_change() from public, anon, authenticated;
revoke all on function public.store_order_messages_legacy_read_sync() from public, anon, authenticated;
revoke all on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text) from public, anon, authenticated;
revoke all on function public.store_customer_conversations(uuid) from public, anon, authenticated;
revoke all on function public.store_mark_admin_read(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.store_mark_customer_read(text, uuid) from public, anon, authenticated;
revoke all on function public.store_assign_conversation(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.store_save_quick_reply(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.store_save_payment_method(uuid, uuid, text, text, text, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.store_send_payment_details(text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.store_post_message(text, text, uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.store_chat_messages_page(text, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.store_realtime_topic_allowed(text) from public, anon;

grant execute on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text) to service_role;
grant execute on function public.store_customer_conversations(uuid) to service_role;
grant execute on function public.store_mark_admin_read(text, uuid, uuid) to service_role;
grant execute on function public.store_mark_customer_read(text, uuid) to service_role;
grant execute on function public.store_assign_conversation(text, uuid, uuid) to service_role;
grant execute on function public.store_save_quick_reply(uuid, uuid, text, text, text, boolean) to service_role;
grant execute on function public.store_save_payment_method(uuid, uuid, text, text, text, text, boolean, integer) to service_role;
grant execute on function public.store_send_payment_details(text, uuid, uuid, uuid) to service_role;
grant execute on function public.store_post_message(text, text, uuid, text, text, text, text, uuid) to service_role;
grant execute on function public.store_chat_messages_page(text, uuid, uuid, integer) to service_role;
grant execute on function public.store_realtime_topic_allowed(text) to authenticated, service_role;

-- ===========================================================================
-- 11. Realtime authorization (RLS on realtime.messages)
--
-- RECEIVE only, broadcast only:
--   admin:inbox  — admins
--   chat:<uuid>  — the order's owner
-- There is deliberately NO insert policy: no browser — customer or admin —
-- can publish broadcast or presence on these topics. Typing/viewing signals
-- are published by the server with the identity from the session, which is
-- what makes them impossible to spoof.
-- ===========================================================================
drop policy if exists "store chat: receive authorised topics" on realtime.messages;
create policy "store chat: receive authorised topics"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.store_realtime_topic_allowed(realtime.topic())
  );

notify pgrst, 'reload schema';

commit;
