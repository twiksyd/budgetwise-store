-- 0028: Admin inbox clarity — "Needs reply", "Replied by", "Viewed by".
--
-- NOT APPLIED. Review, then apply by hand. Do not run 0023 as part of this.
-- Production sequence: 0021, 0022, 0024, 0025, 0026, 0027, then this.
-- Tested on a throwaway local PostgreSQL (scripts/test-db.mjs).
--
-- Until now the inbox only knew "unread by me", so a chat Akio already
-- answered still looked urgent to Zuno and Twicks. These are now separate,
-- database-derived facts:
--
--   Customer activity  the latest message a CUSTOMER sent, of any kind
--                      (text, photo, album, or the order slip that opens a
--                      new order).
--   Admin reply        the latest message an ADMIN sent that a person wrote:
--                      text, photo or album (a proof-of-delivery album
--                      counts). A payment-details card does NOT count: it is
--                      a generated card, not an answer to the customer.
--   Needs reply        customer activity exists and no admin reply comes
--                      after it (by (created_at, id), the chat's own order).
--   Replied by         the admin who sent that latest admin reply.
--   Viewed by          admins whose OWN read cursor in
--                      store_conversation_reads (0021, unchanged) has reached
--                      the latest customer activity. No new table and no new
--                      writes: the cursors already exist.
--
-- 1. store_order_conversations gains last_customer_message_at/_id and
--    last_admin_reply_at/_id/_by, kept current by a new AFTER INSERT trigger
--    on store_order_messages (existing rows are backfilled). That trigger's
--    UPDATE does not match the realtime trigger's WHEN clause, so it sends
--    no extra realtime traffic: clients apply the same rule to the existing
--    'message' events, and read cursors already arrive as 'read' events.
-- 2. store_admin_inbox(): 0027's body verbatim plus the five columns,
--    viewed_by (admin ids, one indexed lookup per returned row) and a
--    'needs_reply' filter (Active chats only). Return type changes, so it is
--    dropped and recreated.
--
-- Nothing here reaches customers: store_customer_conversations, the
-- customer summary API and the customer realtime topics are unchanged.
-- XOB orders.status is not read or written. Assignment is untouched.
--
-- Deploy order: apply this BEFORE deploying the app (the app also reads
-- the old shape: missing columns mean "no reply state yet").
-- Rollback: supabase/rollback/0028_down.sql.

begin;

-- ===========================================================================
-- 1. Reply state on the conversation
-- ===========================================================================
alter table public.store_order_conversations
  add column if not exists last_customer_message_at timestamptz,
  add column if not exists last_customer_message_id uuid,
  add column if not exists last_admin_reply_at timestamptz,
  add column if not exists last_admin_reply_id uuid,
  add column if not exists last_admin_reply_by uuid;

-- Backfill from the messages already there.
update public.store_order_conversations c
   set last_customer_message_at = x.created_at,
       last_customer_message_id = x.id
  from (
    select distinct on (m.order_number) m.order_number, m.created_at, m.id
      from public.store_order_messages m
     where m.sender_role = 'customer'
     order by m.order_number, m.created_at desc, m.id desc
  ) x
 where x.order_number = c.order_number
   and c.last_customer_message_id is distinct from x.id;

update public.store_order_conversations c
   set last_admin_reply_at = x.created_at,
       last_admin_reply_id = x.id,
       last_admin_reply_by = x.sender_user_id
  from (
    select distinct on (m.order_number) m.order_number, m.created_at, m.id, m.sender_user_id
      from public.store_order_messages m
     where m.sender_role = 'admin' and m.kind in ('text', 'image', 'album')
     order by m.order_number, m.created_at desc, m.id desc
  ) x
 where x.order_number = c.order_number
   and c.last_admin_reply_id is distinct from x.id;

-- Runs after store_order_messages_after_insert (triggers fire in name
-- order), so the conversation row already exists.
create or replace function public.store_order_messages_reply_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.sender_role = 'customer' then
    update public.store_order_conversations c
       set last_customer_message_at = new.created_at,
           last_customer_message_id = new.id
     where c.order_number = new.order_number
       and (c.last_customer_message_id is null
            or (c.last_customer_message_at, c.last_customer_message_id) < (new.created_at, new.id));
  elsif new.sender_role = 'admin' and new.kind in ('text', 'image', 'album') then
    update public.store_order_conversations c
       set last_admin_reply_at = new.created_at,
           last_admin_reply_id = new.id,
           last_admin_reply_by = new.sender_user_id
     where c.order_number = new.order_number
       and (c.last_admin_reply_id is null
            or (c.last_admin_reply_at, c.last_admin_reply_id) < (new.created_at, new.id));
  end if;
  return null;
end;
$$;

drop trigger if exists store_order_messages_reply_state on public.store_order_messages;
create trigger store_order_messages_reply_state
  after insert on public.store_order_messages
  for each row
  execute function public.store_order_messages_reply_state();

-- ===========================================================================
-- 2. Inbox rows (0027's body + reply state, viewed_by, 'needs_reply')
-- ===========================================================================
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
  unread_count integer,
  state text,
  done_at timestamptz,
  done_by uuid,
  payment_request_message_id uuid,
  payment_received_message_id uuid,
  payment_received_at timestamptz,
  payment_received_by uuid,
  last_customer_message_at timestamptz,
  last_customer_message_id uuid,
  last_admin_reply_at timestamptz,
  last_admin_reply_id uuid,
  last_admin_reply_by uuid,
  viewed_by uuid[]
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_filter text := case when p_order_number is not null then 'all' else coalesce(p_filter, 'all') end;
  v_where text;
begin
  v_where := case v_filter
    when 'all' then 'true'
    when 'active' then $w$c.state = 'active'$w$
    when 'done' then $w$c.state = 'done'$w$
    when 'unread' then $w$c.state = 'active' and coalesce(u.n, 0) > 0$w$
    when 'unassigned' then $w$c.state = 'active' and c.assigned_admin_id is null$w$
    when 'mine' then $w$c.state = 'active' and c.assigned_admin_id = $1$w$
    when 'under_review' then $w$st.status = 'pending'$w$
    when 'needs_reply' then $w$c.state = 'active'
      and c.last_customer_message_id is not null
      and (c.last_admin_reply_id is null
           or (c.last_admin_reply_at, c.last_admin_reply_id)
              < (c.last_customer_message_at, c.last_customer_message_id))$w$
    else 'false'
  end;

  return query execute format($q$
    select
      c.id, c.order_number, coalesce(s.buyer_name, t.customer_name), s.buyer_roblox_username,
      s.total_amount, coalesce(s.created_at, t.created_at), st.status,
      c.assigned_admin_id, c.assigned_at,
      c.last_message_id, c.last_message_at, c.last_message_kind,
      c.last_message_preview, c.last_sender_role,
      c.customer_read_at, c.customer_read_message_id,
      c.payment_details_sent_at,
      r.last_read_at, r.last_read_message_id,
      coalesce(u.n, 0),
      c.state, c.done_at, c.done_by,
      c.payment_request_message_id, c.payment_received_message_id,
      c.payment_received_at, c.payment_received_by,
      c.last_customer_message_at, c.last_customer_message_id,
      c.last_admin_reply_at, c.last_admin_reply_id, c.last_admin_reply_by,
      coalesce(v.ids, '{}'::uuid[])
    from public.admin_users me
    join public.store_order_conversations c on true
    left join public.store_order_snapshots s on s.order_number = c.order_number
    left join public.store_chat_threads t on t.key = c.order_number and t.kind = 'inquiry'
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
    left join lateral (
      select array_agg(rv.admin_user_id order by rv.last_read_at, rv.admin_user_id) as ids
        from public.store_conversation_reads rv
       where rv.order_number = c.order_number
         and c.last_customer_message_id is not null
         and (rv.last_read_at, rv.last_read_message_id)
             >= (c.last_customer_message_at, c.last_customer_message_id)
    ) v on true
    where me.user_id = $1
      and ($7::text is null or c.order_number = $7)
      and (
        $3::text is null
        or c.order_number ilike '%%' || $3 || '%%'
        or s.buyer_name ilike '%%' || $3 || '%%'
        or t.customer_name ilike '%%' || $3 || '%%'
        or s.buyer_roblox_username ilike '%%' || $3 || '%%'
      )
      and (%s)
      and ($4::timestamptz is null or (c.last_message_at, c.order_number) < ($4, $5::text))
    order by c.last_message_at desc, c.order_number desc
    limit least(greatest(coalesce($6::integer, 30), 1), 100)
  $q$, v_where)
  using p_admin, v_filter, p_search, p_before_at, p_before_order, p_limit, p_order_number;
end;
$fn$;

-- ===========================================================================
-- 3. Privileges: service role only
-- ===========================================================================
revoke all on function public.store_order_messages_reply_state() from public, anon, authenticated;
revoke all on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text) from public, anon, authenticated;
grant execute on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text) to service_role;

notify pgrst, 'reload schema';

commit;
