-- After supabase/rollback/0028_down.sql: back to the 0027 shape.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;

\echo '--- 0028 rollback'
select pg_temp.ok(to_regprocedure('public.store_order_messages_reply_state()') is null, '0028 rollback drops the reply-state trigger function');
select pg_temp.ok(
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'store_order_conversations'
                 and column_name in ('last_customer_message_at', 'last_admin_reply_by')),
  '0028 rollback drops the reply-state columns');
select pg_temp.ok(
  (select count(*) from information_schema.routines r
     join information_schema.parameters p on p.specific_name = r.specific_name and p.parameter_mode = 'OUT'
    where r.routine_name = 'store_admin_inbox') = 27,
  '0028 rollback restores the 0027 inbox columns');
