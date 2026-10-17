-- BudgetWise Store: customer accounts + on-site order chat.
--
-- Purely additive. Nothing here drops or rewrites an existing object, and the
-- XOB-owned `orders` / `order_items` shape is untouched.
--
--   * store_order_snapshots gains a nullable `owner_user_id`: the Supabase Auth
--     (Google) account that placed the order. Nullable on purpose — every
--     order created before this migration has no owner and stays reachable
--     through its original token link.
--   * store_order_messages holds the per-order conversation between the
--     customer and the BudgetWise team, including image attachments (GCash
--     receipts) stored in a private Storage bucket.
--
-- Writes go through server code (service role) after it has verified who the
-- caller is; the database only grants SELECT to signed-in users, scoped to the
-- orders they own (or to every order, for store admins).

begin;

-- ---------------------------------------------------------------------------
-- Order ownership
-- ---------------------------------------------------------------------------
alter table public.store_order_snapshots
  add column if not exists owner_user_id uuid
    references auth.users (id) on delete set null;

create index if not exists store_order_snapshots_owner_user_id_idx
  on public.store_order_snapshots (owner_user_id, created_at desc)
  where owner_user_id is not null;

-- ---------------------------------------------------------------------------
-- Admin check usable from RLS policies.
--
-- admin_users denies anon/authenticated outright, so a policy cannot read it
-- directly. This SECURITY DEFINER function answers one narrow question —
-- "is the calling user an admin?" — and nothing else.
-- ---------------------------------------------------------------------------
create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function public.is_store_admin() from public, anon;
grant execute on function public.is_store_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table public.store_order_messages (
  id uuid primary key default gen_random_uuid(),
  order_number text not null
    references public.store_order_snapshots (order_number) on delete cascade,
  sender_role text not null,
  sender_user_id uuid references auth.users (id) on delete set null,
  -- 'slip'  : the order slip, posted once when the order is created.
  -- 'text'  : an ordinary message.
  -- 'image' : a message carrying one attachment (body is an optional caption).
  kind text not null default 'text',
  body text not null default '',
  attachment_path text,
  attachment_mime text,
  created_at timestamptz not null default now(),
  -- Set when the OTHER party has opened the conversation after this message.
  read_at timestamptz,
  constraint store_order_messages_sender_role_valid
    check (sender_role in ('customer', 'admin')),
  constraint store_order_messages_kind_valid
    check (kind in ('slip', 'text', 'image')),
  constraint store_order_messages_body_length
    check (char_length(body) <= 4000),
  constraint store_order_messages_text_not_blank
    check (kind <> 'text' or length(btrim(body)) > 0),
  constraint store_order_messages_slip_is_customer
    check (kind <> 'slip' or sender_role = 'customer'),
  constraint store_order_messages_image_has_attachment
    check (
      (kind = 'image' and attachment_path is not null and attachment_mime is not null)
      or (kind <> 'image' and attachment_path is null and attachment_mime is null)
    )
);

create index store_order_messages_order_created_idx
  on public.store_order_messages (order_number, created_at);

-- Admin inbox: "which orders have customer messages nobody has read yet".
create index store_order_messages_unread_idx
  on public.store_order_messages (order_number, sender_role)
  where read_at is null;

-- One slip per order, however many times a checkout is replayed.
create unique index store_order_messages_one_slip_idx
  on public.store_order_messages (order_number)
  where kind = 'slip';

-- ---------------------------------------------------------------------------
-- Access control
--
-- SELECT only, and only for the order's owner or a store admin. This is what
-- Realtime evaluates before it delivers a new message to a browser, so a
-- customer's socket can never receive another customer's chat.
-- ---------------------------------------------------------------------------
alter table public.store_order_messages enable row level security;

revoke all on public.store_order_messages from anon, authenticated;
grant select on public.store_order_messages to authenticated;

create policy "owner can read own order messages"
  on public.store_order_messages
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.store_order_snapshots s
       where s.order_number = store_order_messages.order_number
         and s.owner_user_id = auth.uid()
    )
  );

create policy "admins can read all order messages"
  on public.store_order_messages
  for select
  to authenticated
  using (public.is_store_admin());

-- The owner policy joins to the snapshot table, which is otherwise closed to
-- signed-in users. Allow them to see only their own header rows — enough for
-- the policy above to evaluate, nothing more.
revoke all on public.store_order_snapshots from authenticated;
grant select (order_number, owner_user_id) on public.store_order_snapshots
  to authenticated;

create policy "owner can see own order header"
  on public.store_order_snapshots
  for select
  to authenticated
  using (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Inbox / list summaries (server-side only, service role).
--
-- Both return one row per order with its newest message and how many messages
-- the *other* party has not read yet. Doing this in SQL keeps the counts exact
-- no matter how long a thread grows.
-- ---------------------------------------------------------------------------
create or replace function public.store_order_chat_summaries(
  p_order_numbers text[]
)
returns table (
  order_number text,
  last_message_at timestamptz,
  last_message_kind text,
  last_message_body text,
  last_sender_role text,
  unread_for_customer integer,
  unread_for_admin integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    m.order_number,
    max(m.created_at),
    (array_agg(m.kind order by m.created_at desc))[1],
    (array_agg(m.body order by m.created_at desc))[1],
    (array_agg(m.sender_role order by m.created_at desc))[1],
    (count(*) filter (where m.sender_role = 'admin' and m.read_at is null))::integer,
    (count(*) filter (where m.sender_role = 'customer' and m.read_at is null))::integer
  from public.store_order_messages m
  where m.order_number = any (p_order_numbers)
  group by m.order_number;
$$;

create or replace function public.store_admin_chat_inbox(
  p_limit integer default 100
)
returns table (
  order_number text,
  buyer_name text,
  buyer_roblox_username text,
  total_amount numeric,
  created_at timestamptz,
  last_message_at timestamptz,
  last_message_kind text,
  last_message_body text,
  last_sender_role text,
  unread_for_admin integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with latest as (
    select distinct on (m.order_number)
      m.order_number, m.created_at, m.kind, m.body, m.sender_role
    from public.store_order_messages m
    order by m.order_number, m.created_at desc
  ),
  unread as (
    select m.order_number, (count(*))::integer as n
    from public.store_order_messages m
    where m.sender_role = 'customer' and m.read_at is null
    group by m.order_number
  )
  select
    s.order_number,
    s.buyer_name,
    s.buyer_roblox_username,
    s.total_amount,
    s.created_at,
    l.created_at,
    l.kind,
    l.body,
    l.sender_role,
    coalesce(u.n, 0)
  from public.store_order_snapshots s
  join latest l on l.order_number = s.order_number
  left join unread u on u.order_number = s.order_number
  order by l.created_at desc
  limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.store_order_chat_summaries(text[])
  from public, anon, authenticated;
revoke all on function public.store_admin_chat_inbox(integer)
  from public, anon, authenticated;
grant execute on function public.store_order_chat_summaries(text[])
  to service_role;
grant execute on function public.store_admin_chat_inbox(integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- Realtime: stream new messages to the people allowed to read them.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
         from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'store_order_messages'
     )
  then
    alter publication supabase_realtime add table public.store_order_messages;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private bucket for chat attachments (payment receipts and the like).
--
-- Not public, and no storage policies are added, so the only reader/writer is
-- server code using the service role, after it has checked the caller owns
-- the order. Files are served through /api/order-chat/attachments/<id>.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-chat-attachments',
  'order-chat-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

notify pgrst, 'reload schema';

commit;
