-- After supabase/rollback/0031_down.sql: back to the 0030 shape.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;

\echo '--- 0031 rollback'
select pg_temp.ok(to_regprocedure('public.store_send_inquiry_payment_details(text,uuid,uuid,numeric,uuid)') is null,
  '0031 rollback drops the inquiry payment function');
select pg_temp.ok(pg_get_functiondef('public.store_confirm_payment(text,uuid,uuid)'::regprocedure) like '%store_order_snapshots%',
  '0031 rollback restores the order-only confirmation');
