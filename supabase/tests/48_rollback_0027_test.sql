-- After supabase/rollback/0027_down.sql: back to the 0026 shape.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;

\echo '--- 0027 rollback'
select pg_temp.ok(to_regclass('public.store_payment_confirmations') is null, '0027 rollback drops the confirmations table');
select pg_temp.ok(to_regprocedure('public.store_confirm_payment(text, uuid, uuid)') is null, '0027 rollback drops store_confirm_payment');
select pg_temp.ok(
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'store_order_conversations'
                 and column_name like 'payment_re%'),
  '0027 rollback drops the conversation payment columns');
select pg_temp.ok(
  (select count(*) from information_schema.routines r
     join information_schema.parameters p on p.specific_name = r.specific_name and p.parameter_mode = 'OUT'
    where r.routine_name = 'store_admin_inbox') = 23,
  '0027 rollback restores the 0026 inbox columns');
select pg_temp.ok(pg_get_functiondef('public.store_order_conversations_after_update()'::regprocedure) not like '%payment_received%',
  '0027 rollback restores the 0026 realtime trigger');
