-- Rollback of 0030: store_admin_inbox() exactly as 0029 defined it.
-- Roll the application back FIRST (its two new tabs would come back empty).

begin;

create or replace function public.store_admin_inbox(
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

notify pgrst, 'reload schema';

commit;
