-- BudgetWise Store: conversation workflow (Active / Done) and image albums.
--
-- STATUS: PROPOSED — NOT APPLIED. Requires 0021 and 0022. Independent of
-- 0023 (works before or after it).
--
-- 1. Workflow state per conversation: 'active' | 'done'.
--    * BudgetWise's own inbox/conversation state. It is NOT orders.status
--      (XOB) and never reads or writes it.
--    * Existing conversations become 'active' (column default — no rewrite).
--    * Admins mark Done / Reopen through store_set_conversation_state (who
--      and when are audited). A NEW CUSTOMER MESSAGE automatically reopens
--      a Done conversation (audited with cause 'customer_message').
--    * Marking Done is refused if a customer message newer than the one the
--      admin last saw has arrived (two people acting at once).
--    * Indexed (state, last_message_at) so the Active queue never scans
--      history, however many Done conversations accumulate.
--
-- 2. Image albums: one message, up to 10 images.
--    * New message kind 'album'; its images live in a new child table
--      store_order_message_attachments (message -> many attachments), each
--      with a full image and a small thumbnail in the existing private
--      bucket. Existing single-image messages ('image', attachment_path on
--      the message row) are unchanged and keep working.
--    * Optional album label, admin only: 'proof_of_delivery'.
--
-- 3. Realtime: a private per-customer topic customer:<auth uid>, receivable
--    only by that signed-in user, carrying compact "something changed" pings
--    (no message content) so the floating message button and My Orders stay
--    in sync across all of the customer's orders.
--
-- Additive and re-runnable. Old application code keeps working against it
-- (extra columns are ignored; it never produces 'album' messages or 'done'
-- state), so this migration can be applied BEFORE the new code is deployed.

begin;

-- ===========================================================================
-- 1. Workflow state columns
-- ===========================================================================
alter table public.store_order_conversations
  add column if not exists state text not null default 'active',
  add column if not exists done_at timestamptz,
  add column if not exists done_by uuid references auth.users (id) on delete set null,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by uuid references auth.users (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_conversations_state_valid'
       and conrelid = 'public.store_order_conversations'::regclass
  ) then
    alter table public.store_order_conversations
      add constraint store_order_conversations_state_valid
      check (state in ('active', 'done'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_conversations_done_consistent'
       and conrelid = 'public.store_order_conversations'::regclass
  ) then
    alter table public.store_order_conversations
      add constraint store_order_conversations_done_consistent
      check ((state = 'done') = (done_at is not null));
  end if;
end $$;

-- The Active / Done queues: newest activity first, keyset-paginated.
create index if not exists store_order_conversations_state_activity_idx
  on public.store_order_conversations (state, last_message_at desc, order_number desc);

-- ===========================================================================
-- 2. Album messages
-- ===========================================================================
do $$
begin
  -- Message kinds: + 'album'.
  if exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_kind_valid'
       and conrelid = 'public.store_order_messages'::regclass
       and pg_get_constraintdef(oid) not like '%album%'
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
      check (kind in ('slip', 'text', 'image', 'payment', 'album')) not valid;
  end if;

  -- Payload: payment card, or an album's (optional) label.
  if exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_payload_only_payment'
       and conrelid = 'public.store_order_messages'::regclass
       and pg_get_constraintdef(oid) not like '%album%'
  ) then
    alter table public.store_order_messages drop constraint store_order_messages_payload_only_payment;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_payload_only_payment'
       and conrelid = 'public.store_order_messages'::regclass
  ) then
    alter table public.store_order_messages
      add constraint store_order_messages_payload_only_payment
      check (payload is null or kind in ('payment', 'album')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_album_shape'
       and conrelid = 'public.store_order_messages'::regclass
  ) then
    alter table public.store_order_messages
      add constraint store_order_messages_album_shape
      check (
        kind <> 'album'
        or payload is null
        or (jsonb_typeof(payload) = 'object'
            and payload ->> 'label' = 'proof_of_delivery'
            and sender_role = 'admin')
      ) not valid;
  end if;

  -- Conversation's "last message" kind: + 'album'.
  if exists (
    select 1 from pg_constraint
     where conname = 'store_order_conversations_last_kind_valid'
       and conrelid = 'public.store_order_conversations'::regclass
       and pg_get_constraintdef(oid) not like '%album%'
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
      check (last_message_kind in ('slip', 'text', 'image', 'payment', 'album')) not valid;
  end if;
end $$;

-- Existing rows already satisfy the widened checks; VALIDATE does not block
-- reads or inserts.
alter table public.store_order_messages validate constraint store_order_messages_kind_valid;
alter table public.store_order_messages validate constraint store_order_messages_payload_only_payment;
alter table public.store_order_messages validate constraint store_order_messages_album_shape;
alter table public.store_order_conversations validate constraint store_order_conversations_last_kind_valid;

create table if not exists public.store_order_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null
    references public.store_order_messages (id) on delete cascade,
  -- Same as the message's; kept here so the file route can authorise
  -- without a second lookup.
  order_number text not null,
  position smallint not null,
  storage_path text not null,
  mime text not null,
  byte_size integer not null,
  thumb_path text not null,
  thumb_mime text not null,
  -- Display hints (aspect ratio); never trusted for anything else.
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  constraint store_order_message_attachments_position_valid
    check (position between 0 and 9),
  constraint store_order_message_attachments_mime_valid
    check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  constraint store_order_message_attachments_thumb_mime_valid
    check (thumb_mime in ('image/jpeg', 'image/png', 'image/webp')),
  constraint store_order_message_attachments_size_valid
    check (byte_size between 1 and 4194304),
  constraint store_order_message_attachments_dims_valid
    check ((width is null or width between 1 and 20000)
           and (height is null or height between 1 and 20000)),
  constraint store_order_message_attachments_slot_key unique (message_id, position)
);

alter table public.store_order_message_attachments enable row level security;
revoke all on public.store_order_message_attachments from anon, authenticated;

-- ===========================================================================
-- 3. Audit actions: + done / reopened (keeps everything 0021/0022 allow)
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'store_chat_audit_log_action_valid'
       and conrelid = 'public.store_chat_audit_log'::regclass
       and pg_get_constraintdef(oid) like '%conversation.reopened%'
  ) then
    alter table public.store_chat_audit_log
      drop constraint if exists store_chat_audit_log_action_valid;
    alter table public.store_chat_audit_log
      add constraint store_chat_audit_log_action_valid
      check (action in (
        'conversation.assigned',
        'conversation.unassigned',
        'conversation.done',
        'conversation.reopened',
        'quick_reply.created',
        'quick_reply.updated',
        'payment_method.created',
        'payment_method.updated',
        'fulfillment_detail.submitted',
        'fulfillment_detail.corrected'
      ));
  end if;
end $$;

-- ===========================================================================
-- 4. Previews (album aware)
-- ===========================================================================
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
    else public.store_chat_preview(p_kind, p_body)
  end;
$$;

-- ===========================================================================
-- 5. Message trigger: + album preview, + auto-reopen, + customer topic
-- ===========================================================================
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

-- ===========================================================================
-- 6. Conversation trigger: + state changes, + customer topic
-- ===========================================================================
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
    or old.state is distinct from new.state
  )
  execute function public.store_order_conversations_after_update();

-- ===========================================================================
-- 7. Mark Done / Reopen (admins, through server code)
-- ===========================================================================
-- p_last_seen_message_id: the newest message the admin had on screen when
-- they clicked Done. If a customer message newer than that exists, Done is
-- refused (BW011) — nobody marks a chat Done over a reply they never saw.
create or replace function public.store_set_conversation_state(
  p_order_number text,
  p_actor uuid,
  p_state text,
  p_last_seen_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.store_order_conversations;
  v_seen_at timestamptz;
  v_seen_id uuid;
begin
  if not exists (select 1 from public.admin_users where user_id = p_actor) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if p_state not in ('active', 'done') then
    raise exception 'invalid state' using errcode = '22023';
  end if;

  select * into v_row from public.store_order_conversations
   where order_number = p_order_number
   for update;
  if not found then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;

  if v_row.state = p_state then
    return to_jsonb(v_row) - 'admin_read_at' - 'admin_read_message_id';
  end if;

  if p_state = 'done' then
    if p_last_seen_message_id is null then
      raise exception 'last seen message required' using errcode = '22023';
    end if;
    select m.created_at, m.id into v_seen_at, v_seen_id
      from public.store_order_messages m
     where m.id = p_last_seen_message_id and m.order_number = p_order_number;
    if not found then
      raise exception 'message not in this conversation' using errcode = 'P0002';
    end if;
    if exists (
      select 1 from public.store_order_messages m
       where m.order_number = p_order_number
         and m.sender_role = 'customer'
         and (m.created_at, m.id) > (v_seen_at, v_seen_id)
    ) then
      raise exception 'NEW_CUSTOMER_MESSAGE' using errcode = 'BW011';
    end if;

    update public.store_order_conversations
       set state = 'done', done_at = now(), done_by = p_actor, updated_at = now()
     where order_number = p_order_number
    returning * into v_row;

    insert into public.store_chat_audit_log (actor_user_id, action, order_number, subject_id, details)
    values (p_actor, 'conversation.done', p_order_number, v_row.id, jsonb_build_object('cause', 'admin'));
  else
    update public.store_order_conversations
       set state = 'active', done_at = null, done_by = null,
           reopened_at = now(), reopened_by = p_actor, updated_at = now()
     where order_number = p_order_number
    returning * into v_row;

    insert into public.store_chat_audit_log (actor_user_id, action, order_number, subject_id, details)
    values (p_actor, 'conversation.reopened', p_order_number, v_row.id, jsonb_build_object('cause', 'admin'));
  end if;

  return to_jsonb(v_row) - 'admin_read_at' - 'admin_read_message_id';
end;
$$;

-- ===========================================================================
-- 8. Album posting (server code only; it uploaded and validated the files)
-- ===========================================================================
-- p_attachments: [{position, path, mime, size, thumb_path, thumb_mime,
--                  width, height}], 1..10 items, positions 0..n-1.
-- Paths must be the sender's own deterministic paths for this message:
--   <order>/<sender>/<client message id>/<position>.<ext>
--   <order>/<sender>/<client message id>/<position>.thumb.<ext>
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

-- ===========================================================================
-- 9. Admin inbox: + state, + Active / Done filters
-- ===========================================================================
-- Same arguments as 0021, so callers are unchanged; the return type gains
-- columns, which requires drop + create (in this transaction, atomically).
--   active (default queue) / done / all
--   unread, unassigned, mine — within the Active queue
--   under_review (kept for compatibility) — XOB status 'pending', any state
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
  done_by uuid
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
  where me.user_id = p_admin
    and (p_order_number is null or c.order_number = p_order_number)
    and (
      p_search is null
      or s.order_number ilike '%' || p_search || '%'
      or s.buyer_name ilike '%' || p_search || '%'
      or s.buyer_roblox_username ilike '%' || p_search || '%'
    )
    and (
      p_order_number is not null
      or p_filter = 'all'
      or (p_filter = 'active' and c.state = 'active')
      or (p_filter = 'done' and c.state = 'done')
      or (p_filter = 'unread' and c.state = 'active' and coalesce(u.n, 0) > 0)
      or (p_filter = 'unassigned' and c.state = 'active' and c.assigned_admin_id is null)
      or (p_filter = 'mine' and c.state = 'active' and c.assigned_admin_id = me.user_id)
      or (p_filter = 'under_review' and st.status = 'pending')
    )
    and (
      p_before_at is null
      or (c.last_message_at, c.order_number) < (p_before_at, p_before_order)
    )
  order by c.last_message_at desc, c.order_number desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- ===========================================================================
-- 10. Customer side: conversations (+ state) and paginated My Orders
-- ===========================================================================
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

-- p_section:
--   'open'      — orders still in progress (state active, or no chat yet),
--                 newest activity first, at most 100
--   'completed' — Done orders, most recently completed first, keyset pages
--                 (p_before_at / p_before_order = the last row's done_at /
--                 order_number)
create or replace function public.store_customer_orders(
  p_user uuid,
  p_section text,
  p_before_at timestamptz default null,
  p_before_order text default null,
  p_limit integer default 20
)
returns table (
  order_number text,
  total_amount numeric,
  created_at timestamptz,
  buyer_roblox_username text,
  conversation_id uuid,
  state text,
  done_at timestamptz,
  last_message_at timestamptz,
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
    s.order_number, s.total_amount, s.created_at, s.buyer_roblox_username,
    c.id, coalesce(c.state, 'active'), c.done_at,
    c.last_message_at, c.last_message_preview, c.last_sender_role,
    c.payment_details_sent_at,
    coalesce(u.n, 0)
  from public.store_order_snapshots s
  left join public.store_order_conversations c on c.order_number = s.order_number
  left join lateral (
    select count(*)::integer as n
      from public.store_order_messages m
     where c.order_number is not null
       and m.order_number = c.order_number
       and m.sender_role = 'admin'
       and (c.customer_read_at is null
            or (m.created_at, m.id) > (c.customer_read_at, c.customer_read_message_id))
  ) u on true
  where s.owner_user_id = p_user
    and (
      (p_section = 'open' and coalesce(c.state, 'active') = 'active')
      or (p_section = 'completed' and c.state = 'done'
          and (p_before_at is null or (c.done_at, s.order_number) < (p_before_at, p_before_order)))
    )
  order by
    case when p_section = 'open' then coalesce(c.last_message_at, s.created_at) end desc,
    case when p_section = 'completed' then c.done_at end desc,
    s.order_number desc
  limit case when p_section = 'open' then 100
             else least(greatest(coalesce(p_limit, 20), 1), 50) end;
$$;

-- ===========================================================================
-- 11. Realtime: + customer:<auth uid>
-- ===========================================================================
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

-- ===========================================================================
-- 12. Privileges: service role only (topic check stays callable by
--     authenticated users for the realtime policy, as in 0021)
-- ===========================================================================
revoke all on function public.store_chat_preview(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.store_set_conversation_state(text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.store_post_album(text, text, uuid, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text) from public, anon, authenticated;
revoke all on function public.store_customer_conversations(uuid) from public, anon, authenticated;
revoke all on function public.store_customer_orders(uuid, text, timestamptz, text, integer) from public, anon, authenticated;
revoke all on function public.store_realtime_topic_allowed(text) from public, anon;

grant execute on function public.store_set_conversation_state(text, uuid, text, uuid) to service_role;
grant execute on function public.store_post_album(text, text, uuid, text, text, jsonb, uuid) to service_role;
grant execute on function public.store_admin_inbox(uuid, text, text, timestamptz, text, integer, text) to service_role;
grant execute on function public.store_customer_conversations(uuid) to service_role;
grant execute on function public.store_customer_orders(uuid, text, timestamptz, text, integer) to service_role;
grant execute on function public.store_realtime_topic_allowed(text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
