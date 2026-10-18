-- 0032: message reactions and replies to a specific message (Phase 3).
--
-- NOT APPLIED. Review, then apply by hand. Do not run 0023 as part of this.
-- Production sequence: 0021, 0022, 0024 ... 0031, then this.
-- Tested on a throwaway local PostgreSQL (scripts/test-db.mjs).
--
-- 1. Replies: store_order_messages.reply_to_message_id (nullable, same
--    conversation only — enforced by a trigger for EVERY write path; the
--    referenced message must exist; on delete the link is cleared).
--    store_post_message() gains p_reply_to (default null): 0026's body
--    verbatim plus the column, and a retry with the same client id must
--    name the same reply target (BW010 otherwise). Its argument list
--    changes, so the 8-argument version is dropped and recreated; callers
--    using named arguments keep working.
-- 2. Reactions: store_message_reactions — one row per (message, person):
--    love / haha / sad / wow / like. store_set_reaction() is the only write
--    path: the actor is re-checked (any admin, or the chat's owner), the
--    message must belong to that chat, and null removes the reaction. It
--    broadcasts the message's aggregated counts: customers get counts plus
--    their own choice (no admin ids); admins also get who reacted.
--    Reactions NEVER touch store_order_conversations: unread counts, Needs
--    reply / Replied by / Viewed by, assignment, Done and Payment Received
--    are unaffected (no message is created, no read cursor moves).
-- 3. Typing indicators need nothing here: they are server-published
--    realtime broadcasts only (no database writes).
--
-- XOB is not touched. Realtime access rules are unchanged.
-- Deploy order: apply BEFORE deploying the app.
-- Rollback: supabase/rollback/0032_down.sql.

begin;

-- ===========================================================================
-- 1. Replies
-- ===========================================================================
alter table public.store_order_messages
  add column if not exists reply_to_message_id uuid
    references public.store_order_messages (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'store_order_messages_reply_not_self'
       and conrelid = 'public.store_order_messages'::regclass
  ) then
    alter table public.store_order_messages
      add constraint store_order_messages_reply_not_self
      check (reply_to_message_id is null or reply_to_message_id <> id);
  end if;
end $$;

-- A reply can only point at a message in the SAME conversation.
create or replace function public.store_order_messages_reply_same_chat()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.reply_to_message_id is not null and not exists (
    select 1 from public.store_order_messages m
     where m.id = new.reply_to_message_id
       and m.order_number = new.order_number
  ) then
    raise exception 'reply target is not in this conversation' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

drop trigger if exists store_order_messages_reply_same_chat on public.store_order_messages;
create trigger store_order_messages_reply_same_chat
  before insert or update of reply_to_message_id on public.store_order_messages
  for each row
  when (new.reply_to_message_id is not null)
  execute function public.store_order_messages_reply_same_chat();

drop function if exists public.store_post_message(text, text, uuid, text, text, text, text, uuid);
drop function if exists public.store_post_message(text, text, uuid, text, text, text, text, uuid, uuid);
create function public.store_post_message(
  p_order_number text,
  p_sender_role text,
  p_sender uuid,
  p_kind text,
  p_body text,
  p_attachment_path text,
  p_attachment_mime text,
  p_client_message_id uuid,
  p_reply_to uuid default null
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
    if public.store_chat_owner(p_order_number) is distinct from p_sender then
      raise exception 'not the order owner' using errcode = '42501';
    end if;
  else
    raise exception 'invalid sender role' using errcode = '22023';
  end if;

  insert into public.store_order_messages (
    order_number, sender_role, sender_user_id, kind, body,
    attachment_path, attachment_mime, client_message_id, reply_to_message_id
  )
  values (
    p_order_number, p_sender_role, p_sender, p_kind, coalesce(p_body, ''),
    p_attachment_path, p_attachment_mime, p_client_message_id, p_reply_to
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
     or v_row.attachment_path is distinct from p_attachment_path
     or v_row.reply_to_message_id is distinct from p_reply_to then
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'BW010';
  end if;

  return jsonb_build_object('created', false, 'message', to_jsonb(v_row));
end;
$$;

-- ===========================================================================
-- 2. Reactions
-- ===========================================================================
create table if not exists public.store_message_reactions (
  message_id uuid not null
    references public.store_order_messages (id) on delete cascade,
  order_number text not null
    references public.store_chat_threads (key) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  actor_role text not null,
  reaction text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (message_id, actor_user_id),
  constraint store_message_reactions_role_valid check (actor_role in ('customer', 'admin')),
  constraint store_message_reactions_reaction_valid check (reaction in ('love', 'haha', 'sad', 'wow', 'like'))
);

create index if not exists store_message_reactions_order_idx
  on public.store_message_reactions (order_number);

alter table public.store_message_reactions enable row level security;
revoke all on public.store_message_reactions from public, anon, authenticated;

-- Aggregate for one message: counts per reaction, the chat owner's own
-- reaction, and (admins only) which admin chose what.
create or replace function public.store_reaction_summary(p_message_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(reaction, n) from (
        select reaction, count(*)::int as n from public.store_message_reactions
         where message_id = p_message_id group by reaction) c), '{}'::jsonb),
    'customer', (select reaction from public.store_message_reactions
                  where message_id = p_message_id and actor_role = 'customer' limit 1),
    'admins', coalesce((select jsonb_object_agg(actor_user_id, reaction) from public.store_message_reactions
                         where message_id = p_message_id and actor_role = 'admin'), '{}'::jsonb)
  );
$$;

create or replace function public.store_set_reaction(
  p_order_number text,
  p_message_id uuid,
  p_actor uuid,
  p_role text,
  p_reaction text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before text;
  v_summary jsonb;
  v_conv uuid;
begin
  if p_role = 'admin' then
    if p_actor is null or not exists (select 1 from public.admin_users where user_id = p_actor) then
      raise exception 'not an admin' using errcode = '42501';
    end if;
  elsif p_role = 'customer' then
    if p_actor is null or public.store_chat_owner(p_order_number) is distinct from p_actor then
      raise exception 'not the chat owner' using errcode = '42501';
    end if;
  else
    raise exception 'invalid role' using errcode = '22023';
  end if;

  if p_reaction is not null and p_reaction not in ('love', 'haha', 'sad', 'wow', 'like') then
    raise exception 'unknown reaction' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.store_order_messages m
     where m.id = p_message_id and m.order_number = p_order_number
  ) then
    raise exception 'message not in this conversation' using errcode = 'P0002';
  end if;

  select reaction into v_before from public.store_message_reactions
   where message_id = p_message_id and actor_user_id = p_actor;

  if p_reaction is null then
    delete from public.store_message_reactions
     where message_id = p_message_id and actor_user_id = p_actor;
  else
    insert into public.store_message_reactions (message_id, order_number, actor_user_id, actor_role, reaction)
    values (p_message_id, p_order_number, p_actor, p_role, p_reaction)
    on conflict (message_id, actor_user_id) do update
      set reaction = excluded.reaction, updated_at = now()
      where store_message_reactions.reaction is distinct from excluded.reaction;
  end if;

  v_summary := public.store_reaction_summary(p_message_id);

  -- Broadcast only real changes (a repeated tap is a no-op on the wire).
  if v_before is distinct from p_reaction then
    select id into v_conv from public.store_order_conversations where order_number = p_order_number;
    if v_conv is not null then
      perform public.store_chat_send(
        'chat:' || v_conv::text, 'reaction',
        jsonb_build_object('message_id', p_message_id,
                           'counts', v_summary -> 'counts',
                           'customer', v_summary -> 'customer'));
    end if;
    perform public.store_chat_send(
      'admin:inbox', 'reaction',
      jsonb_build_object('order_number', p_order_number, 'message_id', p_message_id) || v_summary);
  end if;

  return v_summary;
end;
$$;

-- ===========================================================================
-- 3. Privileges: service role only
-- ===========================================================================
revoke all on function public.store_post_message(text, text, uuid, text, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.store_order_messages_reply_same_chat() from public, anon, authenticated;
revoke all on function public.store_reaction_summary(uuid) from public, anon, authenticated;
revoke all on function public.store_set_reaction(text, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.store_post_message(text, text, uuid, text, text, text, text, uuid, uuid) to service_role;
grant execute on function public.store_reaction_summary(uuid) to service_role;
grant execute on function public.store_set_reaction(text, uuid, uuid, text, text) to service_role;
grant select, insert, update, delete on public.store_message_reactions to service_role;

notify pgrst, 'reload schema';

commit;
