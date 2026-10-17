-- 0025: customer-facing admin names, and a live "assistant changed" signal.
--
-- NOT APPLIED. Review, then apply by hand. Do not run 0023 as part of this.
--
-- 1. admin_users.public_username: the only admin identity customers ever
--    see ("Assisted by Twicks"). display_name stays the internal name that
--    admins see; emails and user ids are never sent to customers.
-- 2. Andre -> Twicks, Robert -> Zuno, Kenneth -> Akio, matched on the
--    trusted internal display_name (never on email). Only fills empty values.
-- 3. store_order_conversations_after_update(): 0024's body verbatim, plus
--    one 'assistant' ping on the conversation's own chat:<id> topic when the
--    assignment changes, so an open customer chat updates its header live.
--    The ping's payload is empty: no admin ids or names on the wire.
--
-- Deploy order does not matter: the app reads admin_users with select *,
-- treats a missing column as "no public name" (customers then see just
-- "BudgetWise"), and ignores the new event until it is sent.
-- Rollback: supabase/rollback/0025_down.sql.

begin;

alter table public.admin_users
  add column if not exists public_username text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'admin_users_public_username_valid'
       and conrelid = 'public.admin_users'::regclass
  ) then
    alter table public.admin_users
      add constraint admin_users_public_username_valid
      check (
        public_username is null
        or (char_length(public_username) between 1 and 24
            and public_username ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*$'
            and public_username = btrim(public_username))
      ) not valid;
  end if;
end $$;

alter table public.admin_users
  validate constraint admin_users_public_username_valid;

-- Two admins can never appear to customers under the same name.
create unique index if not exists admin_users_public_username_key
  on public.admin_users (lower(public_username))
  where public_username is not null;

update public.admin_users set public_username = 'Twicks'
 where public_username is null and lower(btrim(display_name)) = 'andre';
update public.admin_users set public_username = 'Zuno'
 where public_username is null and lower(btrim(display_name)) = 'robert';
update public.admin_users set public_username = 'Akio'
 where public_username is null and lower(btrim(display_name)) = 'kenneth';

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
$;

commit;
