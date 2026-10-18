-- Rollback of 0026 (General Inquiry conversations).
--
-- Refused while any General Inquiry thread exists: inquiries cannot be
-- represented without threads (nothing is deleted silently). Roll the
-- application back FIRST.
--
-- The function bodies below are the pre-0026 definitions, copied verbatim
-- from 0021 / 0024 / 0025.

begin;

do $$
begin
  if exists (select 1 from public.store_chat_threads where kind = 'inquiry') then
    raise exception 'General Inquiry threads exist; 0026 cannot be rolled back without losing them';
  end if;
end $$;

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

create or replace function public.store_post_album(
  p_order_number text,
  p_sender_role text,
  p_sender uuid,
  p_body text,
  p_label text,
  p_attachments jsonb,
  p_client_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.store_order_messages;
  v_count integer;
  v_item jsonb;
  v_prefix text;
  v_position integer;
begin
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
    if p_label is not null then
      raise exception 'labels are for BudgetWise only' using errcode = '42501';
    end if;
  else
    raise exception 'invalid sender role' using errcode = '22023';
  end if;

  if p_client_message_id is null then
    raise exception 'client message id required' using errcode = '22023';
  end if;
  if p_label is not null and p_label <> 'proof_of_delivery' then
    raise exception 'unknown album label' using errcode = '22023';
  end if;
  if jsonb_typeof(p_attachments) <> 'array' then
    raise exception 'attachments must be a list' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_attachments);
  if v_count < 1 or v_count > 10 then
    raise exception 'an album has 1 to 10 images' using errcode = '22023';
  end if;

  v_prefix := p_order_number || '/' || p_sender::text || '/' || p_client_message_id::text || '/';
  for v_position in 0 .. v_count - 1 loop
    v_item := p_attachments -> v_position;
    if (v_item ->> 'position')::integer is distinct from v_position
       or not starts_with(coalesce(v_item ->> 'path', ''), v_prefix)
       or not starts_with(coalesce(v_item ->> 'thumb_path', ''), v_prefix)
       or substr(v_item ->> 'path', length(v_prefix) + 1) !~ ('^' || v_position || '\.(jpg|png|webp)$')
       or substr(v_item ->> 'thumb_path', length(v_prefix) + 1) !~ ('^' || v_position || '\.thumb\.(jpg|png|webp)$')
    then
      raise exception 'invalid attachment %', v_position using errcode = '22023';
    end if;
  end loop;

  -- Not a retry of an album already posted: every file must really be in
  -- the private bucket, uploaded recently (an abandoned upload is past
  -- this window long before the cleanup may delete it).
  if not exists (
    select 1 from public.store_order_messages m
     where m.order_number = p_order_number
       and m.sender_user_id = p_sender
       and m.client_message_id = p_client_message_id
  ) then
    if (
      select count(*)
        from jsonb_array_elements(p_attachments) a
        join storage.objects o
          on o.bucket_id = 'order-chat-attachments'
         and o.name in (a ->> 'path', a ->> 'thumb_path')
         and o.created_at > now() - interval '6 hours'
    ) <> 2 * v_count then
      raise exception 'UPLOAD_EXPIRED_OR_MISSING' using errcode = 'BW012';
    end if;
  end if;

  insert into public.store_order_messages (
    order_number, sender_role, sender_user_id, kind, body, payload, client_message_id
  )
  values (
    p_order_number, p_sender_role, p_sender, 'album', coalesce(p_body, ''),
    case when p_label is null then null else jsonb_build_object('label', p_label) end,
    p_client_message_id
  )
  on conflict (order_number, sender_user_id, client_message_id)
    where client_message_id is not null
    do nothing
  returning * into v_row;

  if found then
    insert into public.store_order_message_attachments (
      message_id, order_number, position, storage_path, mime, byte_size,
      thumb_path, thumb_mime, width, height
    )
    select v_row.id, p_order_number, (a ->> 'position')::smallint, a ->> 'path', a ->> 'mime',
           (a ->> 'size')::integer, a ->> 'thumb_path', a ->> 'thumb_mime',
           nullif(a ->> 'width', '')::integer, nullif(a ->> 'height', '')::integer
      from jsonb_array_elements(p_attachments) a;
    return jsonb_build_object('created', true, 'message', to_jsonb(v_row));
  end if;

  -- A retry: same message, or the client id was reused for something else.
  select * into v_row from public.store_order_messages m
   where m.order_number = p_order_number
     and m.sender_user_id = p_sender
     and m.client_message_id = p_client_message_id;

  if v_row.kind is distinct from 'album'
     or v_row.body is distinct from coalesce(p_body, '')
     or (select count(*) from public.store_order_message_attachments x where x.message_id = v_row.id) <> v_count
  then
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'BW010';
  end if;

  return jsonb_build_object('created', false, 'message', to_jsonb(v_row));
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
  v_owner uuid;
  v_preview text := public.store_chat_preview(new.kind, new.body, new.payload);
begin
  insert into public.store_order_conversations (
    order_number, last_message_id, last_message_at, last_message_kind,
    last_message_preview, last_sender_role, payment_details_sent_at
  )
  values (
    new.order_number, new.id, new.created_at, new.kind,
    v_preview, new.sender_role,
    case when new.kind = 'payment' then new.created_at end
  )
  on conflict (order_number) do nothing
  returning id into v_new_id;

  if v_new_id is null then
    update public.store_order_conversations c
       set last_message_id = new.id,
           last_message_at = new.created_at,
           last_message_kind = new.kind,
           last_message_preview = v_preview,
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

    -- A customer writing into a Done conversation puts it back to work.
    if new.sender_role = 'customer' then
      with reopened as (
        update public.store_order_conversations c
           set state = 'active',
               done_at = null,
               done_by = null,
               reopened_at = now(),
               reopened_by = new.sender_user_id,
               updated_at = now()
         where c.order_number = new.order_number
           and c.state = 'done'
        returning c.id
      )
      insert into public.store_chat_audit_log (actor_user_id, action, order_number, subject_id, details)
      select new.sender_user_id, 'conversation.reopened', new.order_number, r.id,
             jsonb_build_object('cause', 'customer_message', 'message_id', new.id)
        from reopened r;
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
        'payment_details_sent_at', v_conv.payment_details_sent_at,
        'state', v_conv.state
      )
    )
  );

  -- The customer's own topic: their floating button / My Orders refresh.
  select s.owner_user_id into v_owner
    from public.store_order_snapshots s
   where s.order_number = new.order_number;
  if v_owner is not null then
    perform public.store_chat_send(
      'customer:' || v_owner::text,
      'message',
      jsonb_build_object(
        'conversation_id', v_conv.id,
        'order_number', new.order_number,
        'sender_role', new.sender_role,
        'created_at', new.created_at
      )
    );
  end if;

  return null;
end;
$$;

create or replace function public.store_order_conversations_after_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid;
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
      'admin_read_message_id', new.admin_read_message_id,
      'state', new.state,
      'done_at', new.done_at,
      'done_by', new.done_by
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

  if new.state is distinct from old.state then
    perform public.store_chat_send(
      'chat:' || new.id::text,
      'state',
      jsonb_build_object('state', new.state)
    );
  end if;

  if new.state is distinct from old.state
     or new.customer_read_message_id is distinct from old.customer_read_message_id then
    select s.owner_user_id into v_owner
      from public.store_order_snapshots s
     where s.order_number = new.order_number;
    if v_owner is not null then
      perform public.store_chat_send(
        'customer:' || v_owner::text,
        'conversation',
        jsonb_build_object(
          'conversation_id', new.id,
          'order_number', new.order_number,
          'state', new.state
        )
      );
    end if;
  end if;

  -- 0025: the customer's chat shows who is assisting. Tell it that the
  -- assignment changed; the payload carries no ids or names (the client
  -- re-reads the public username from the summary API).
  if new.assigned_admin_id is distinct from old.assigned_admin_id then
    perform public.store_chat_send('chat:' || new.id::text, 'assistant', '{}'::jsonb);
  end if;

  return null;
end;
$$;

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
  unread_count integer,
  state text,
  done_at timestamptz,
  done_by uuid
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
    else 'false'
  end;

  return query execute format($q$
    select
      c.id, c.order_number, s.buyer_name, s.buyer_roblox_username,
      s.total_amount, s.created_at, st.status,
      c.assigned_admin_id, c.assigned_at,
      c.last_message_id, c.last_message_at, c.last_message_kind,
      c.last_message_preview, c.last_sender_role,
      c.customer_read_at, c.customer_read_message_id,
      c.payment_details_sent_at,
      r.last_read_at, r.last_read_message_id,
      coalesce(u.n, 0),
      c.state, c.done_at, c.done_by
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
    where me.user_id = $1
      and ($7::text is null or c.order_number = $7)
      and (
        $3::text is null
        or s.order_number ilike '%%' || $3 || '%%'
        or s.buyer_name ilike '%%' || $3 || '%%'
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

create or replace function public.store_customer_conversations(p_user uuid)
returns table (
  conversation_id uuid,
  order_number text,
  last_message_at timestamptz,
  last_message_kind text,
  last_message_preview text,
  last_sender_role text,
  payment_details_sent_at timestamptz,
  unread_count integer,
  state text,
  done_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    c.id, c.order_number, c.last_message_at, c.last_message_kind,
    c.last_message_preview, c.last_sender_role, c.payment_details_sent_at,
    coalesce(u.n, 0), c.state, c.done_at
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
    when p_topic ~ '^customer:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      auth.uid() is not null and substr(p_topic, 10)::uuid = auth.uid()
    else false
  end;
$$;

alter table public.store_order_messages drop constraint if exists store_order_messages_thread_fkey;
alter table public.store_order_conversations drop constraint if exists store_order_conversations_thread_fkey;

alter table public.store_order_messages
  add constraint store_order_messages_order_number_fkey
  foreign key (order_number) references public.store_order_snapshots (order_number) on delete cascade;
alter table public.store_order_conversations
  add constraint store_order_conversations_order_number_fkey
  foreign key (order_number) references public.store_order_snapshots (order_number) on delete cascade;

drop trigger if exists store_order_snapshots_thread on public.store_order_snapshots;
drop function if exists public.store_order_snapshots_thread();
drop function if exists public.store_open_inquiry(uuid, text);
drop function if exists public.store_chat_owner(text);
drop table if exists public.store_chat_threads;

notify pgrst, 'reload schema';

commit;
