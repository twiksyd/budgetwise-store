-- BudgetWise Store: remove the 0020 chat access path once nothing uses it.
--
-- STATUS: PROPOSED — NOT APPLIED. Run ONLY after:
--   * 0021 is applied, and
--   * the new inbox/chat code (private broadcast topics) is deployed, and
--   * old browser tabs have reloaded onto it (see deployment order).
--
-- Removes the postgres_changes path that sends whole message rows (with
-- admin user ids and attachment paths) to customers, direct REST read access
-- to messages, the transition-only read sync, and the 0020 inbox functions.

begin;

-- 1. Stop streaming raw message rows through postgres_changes.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'store_order_messages'
  ) then
    alter publication supabase_realtime drop table public.store_order_messages;
  end if;
end $$;

-- 2. Browsers no longer read messages directly; the API serves them.
drop policy if exists "owner can read own order messages" on public.store_order_messages;
drop policy if exists "admins can read all order messages" on public.store_order_messages;
revoke all on public.store_order_messages from anon, authenticated;

-- 3. The snapshot header grant existed only for the policy above. The new
--    realtime topic check runs as SECURITY DEFINER and does not need it.
drop policy if exists "owner can see own order header" on public.store_order_snapshots;
revoke all on public.store_order_snapshots from anon, authenticated;

-- 4. Transition-only mirror of the shared read_at column.
drop trigger if exists store_order_messages_legacy_read_sync on public.store_order_messages;
drop function if exists public.store_order_messages_legacy_read_sync();

-- 5. 0020 inbox/summary functions replaced by store_admin_inbox and
--    store_customer_conversations.
drop function if exists public.store_admin_chat_inbox(integer);
drop function if exists public.store_order_chat_summaries(text[]);

-- 6. Indexes superseded by the (order_number, created_at, id) cursor index.
drop index if exists public.store_order_messages_unread_idx;
drop index if exists public.store_order_messages_order_created_idx;

-- messages.read_at is intentionally kept: it is historical data, unused.

notify pgrst, 'reload schema';

commit;
