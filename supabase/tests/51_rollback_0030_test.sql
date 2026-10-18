-- After supabase/rollback/0030_down.sql: the 0029 filters only.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;

\echo '--- 0030 rollback'
select pg_temp.ok(pg_get_functiondef('public.store_admin_inbox(uuid,text,text,timestamptz,text,integer,text,uuid[],boolean)'::regprocedure)
  not like '%seen_no_reply%', '0030 rollback restores the 0029 inbox function');
