-- 0029: payment details auto-assign, per-admin game filters, customer
-- identity for inbox avatars.
--
-- NOT APPLIED. Review, then apply by hand. Do not run 0023 as part of this.
-- Production sequence: 0021, 0022, 0024, 0025, 0026, 0027, 0028, then this.
-- Tested on a throwaway local PostgreSQL (scripts/test-db.mjs).
--
-- 1. store_send_payment_details(): 0021's body verbatim, plus: when the
--    payment card is newly created and the conversation is Unassigned, it
--    is assigned to the sending admin in the same transaction, with a
--    'conversation.assigned' audit row (cause 'payment_details'). An
--    existing assignment is never changed. Plain text messages never
--    assign. The conditional UPDATE runs after the message insert, whose
--    trigger already holds the conversation's row lock, so a concurrent
--    manual assignment or another admin's payment card is serialized:
--    whoever commits first owns it, and the other sees it assigned.
--    The realtime trigger already broadcasts assignment changes.
--
-- 2. store_admin_inbox_preferences: one row per admin (service role only):
--    game_ids null = All games; include_inquiries = show General Inquiry.
--
-- 3. store_admin_inbox(): 0028's body plus
--      p_games uuid[] / p_include_inquiries  game filter (orders containing
--        ANY chosen game, mixed-game orders included; null = all games),
--        combined with every existing filter; single-row fetches
--        (p_order_number) ignore it so the browser decides;
--      customer_user_id, customer_photo_url  the order owner / inquiry
--        customer and their Google profile photo from auth.users metadata
--        (server-side only: the app turns the id into an opaque avatar seed
--        and allow-lists the photo URL; neither id nor metadata reaches the
--        browser);
--      game_ids, game_names  the order's games (one indexed lookup per row).
--    The signature changes, so it is dropped and recreated.
--
-- 4. store_admin_inbox_outside_count(): Active chats needing a reply that
--    the admin's game filter hides ("3 chats need a reply in other games").
--
-- XOB orders.status is not read for any of this. Customers see nothing new.
-- Deploy order: apply BEFORE deploying the app.
-- Rollback: supabase/rollback/0029_down.sql.

begin;

-- ===========================================================================
-- 1. Payment details assign an Unassigned chat to the sender
-- ===========================================================================
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
  v_created boolean := false;
  v_conv uuid;
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

  v_created := v_id is not null;

  if v_id is null then
    select m.id into v_id from public.store_order_messages m
     where m.order_number = p_order_number
       and m.sender_user_id = p_actor
       and m.client_message_id = p_client_message_id;
  end if;

  -- 0029: an Unassigned chat becomes the sender's. Only for a newly sent
  -- card (a retry of the same card never re-assigns), never over an
  -- existing assignment.
  if v_created then
    update public.store_order_conversations c
       set assigned_admin_id = p_actor,
           assigned_by = p_actor,
           assigned_at = now(),
           updated_at = now()
     where c.order_number = p_order_number
       and c.assigned_admin_id is null
    returning c.id into v_conv;

    if v_conv is not null then
      insert into public.store_chat_audit_log (actor_user_id, action, order_number, subject_id, details)
      values (
        p_actor, 'conversation.assigned', p_order_number, v_conv,
        jsonb_build_object('from', null, 'to', p_actor, 'cause', 'payment_details', 'message_id', v_id)
      );
    end if;
  end if;

  return v_id;
end;
$$;

-- ===========================================================================
-- 2. Per-admin inbox preferences
-- ===========================================================================
create table if not exists public.store_admin_inbox_preferences (
  admin_user_id uuid primary key
    references public.admin_users (user_id) on delete cascade,
  -- null = All games; otherwise orders containing any of these games.
  game_ids uuid[],
  include_inquiries boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint store_admin_inbox_preferences_games_size
    check (game_ids is null or cardinality(game_ids) <= 200)
);

alter table public.store_admin_inbox_preferences enable row level security;
revoke all on public.store_admin_inbox_preferences from public, anon, authenticated;

-- ===========================================================================
-- 3. Inbox rows: 0028's body + game filter, customer identity, games
-- ===========================================================================
drop function if exists public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text);
drop function if exists public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text, uuid[], boolean);
create function public.store_admin_inbox(
  p_admin uuid,
  p_filter text default 'all',
  p_search text default null,
  p_before_at timestamptz default null,
  p_before_order text default null,
  p_limit integer default 30,
  p_order_number text default null,
  p_games uuid[] default null,
  p_include_inquiries boolean default true
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
  viewed_by uuid[],
  customer_user_id uuid,
  customer_photo_url text,
  game_ids uuid[],
  game_names text[]
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

  -- The photo and game lookups run only for the returned page (outer query),
  -- never for every candidate row the filter scans.
  return query execute format($q$
    select x.*,
      nullif(coalesce(au.raw_user_meta_data ->> 'avatar_url', au.raw_user_meta_data ->> 'picture'), ''),
      coalesce(g.ids, '{}'::uuid[]),
      coalesce(g.names, '{}'::text[])
    from (
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
      coalesce(v.ids, '{}'::uuid[]),
      coalesce(s.owner_user_id, t.owner_user_id) as customer_user_id
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
      and (
        $7::text is not null
        or $8::uuid[] is null
        or (t.key is not null and coalesce($9::boolean, true))
        or (t.key is null and exists (
              select 1 from public.store_order_line_snapshots gl
               where gl.order_number = c.order_number and gl.game_id = any($8::uuid[])))
      )
      and (%s)
      and ($4::timestamptz is null or (c.last_message_at, c.order_number) < ($4, $5::text))
    order by c.last_message_at desc, c.order_number desc
    limit least(greatest(coalesce($6::integer, 30), 1), 100)
    ) x
    left join auth.users au on au.id = x.customer_user_id
    left join lateral (
      select array_agg(distinct l.game_id) filter (where l.game_id is not null) as ids,
             array_agg(distinct l.game_name) as names
        from public.store_order_line_snapshots l
       where l.order_number = x.order_number
    ) g on true
    order by x.last_message_at desc, x.order_number desc
  $q$, v_where)
  using p_admin, v_filter, p_search, p_before_at, p_before_order, p_limit, p_order_number,
        p_games, p_include_inquiries;
end;
$fn$;

-- ===========================================================================
-- 4. Urgent chats the game filter hides
-- ===========================================================================
create or replace function public.store_admin_inbox_outside_count(
  p_admin uuid,
  p_games uuid[],
  p_include_inquiries boolean default true
)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case when p_games is null
              or not exists (select 1 from public.admin_users where user_id = p_admin) then 0
         else (
    select count(*)::integer
      from public.store_order_conversations c
      left join public.store_chat_threads t on t.key = c.order_number and t.kind = 'inquiry'
     where c.state = 'active'
       and c.last_customer_message_id is not null
       and (c.last_admin_reply_id is null
            or (c.last_admin_reply_at, c.last_admin_reply_id)
               < (c.last_customer_message_at, c.last_customer_message_id))
       and not (
         (t.key is not null and coalesce(p_include_inquiries, true))
         or (t.key is null and exists (
               select 1 from public.store_order_line_snapshots gl
                where gl.order_number = c.order_number and gl.game_id = any(p_games)))
       )
  ) end;
$$;

-- ===========================================================================
-- 5. Privileges: service role only
-- ===========================================================================
revoke all on function public.store_send_payment_details(text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text, uuid[], boolean) from public, anon, authenticated;
revoke all on function public.store_admin_inbox_outside_count(uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.store_send_payment_details(text, uuid, uuid, uuid) to service_role;
grant execute on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text, uuid[], boolean) to service_role;
grant execute on function public.store_admin_inbox_outside_count(uuid, uuid[], boolean) to service_role;
grant select, insert, update, delete on public.store_admin_inbox_preferences to service_role;

notify pgrst, 'reload schema';

commit;
