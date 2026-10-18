-- After supabase/rollback/0029_down.sql: back to the 0028 shape.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;

\echo '--- 0029 rollback'
select pg_temp.ok(to_regclass('public.store_admin_inbox_preferences') is null, '0029 rollback drops the preferences table');
select pg_temp.ok(to_regprocedure('public.store_admin_inbox(uuid,text,text,timestamptz,text,integer,text)') is not null
  and to_regprocedure('public.store_admin_inbox(uuid,text,text,timestamptz,text,integer,text,uuid[],boolean)') is null,
  '0029 rollback restores the 0028 inbox signature');
select pg_temp.ok(pg_get_functiondef('public.store_send_payment_details(text,uuid,uuid,uuid)'::regprocedure) not like '%payment_details''%',
  '0029 rollback restores payment details without auto-assign');
