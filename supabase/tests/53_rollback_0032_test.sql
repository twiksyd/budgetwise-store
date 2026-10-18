-- After supabase/rollback/0032_down.sql: back to the 0031 shape.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;

\echo '--- 0032 rollback'
select pg_temp.ok(to_regclass('public.store_message_reactions') is null, '0032 rollback drops reactions');
select pg_temp.ok(
  to_regprocedure('public.store_post_message(text,text,uuid,text,text,text,text,uuid)') is not null
  and to_regprocedure('public.store_post_message(text,text,uuid,text,text,text,text,uuid,uuid)') is null,
  '0032 rollback restores the 8-argument store_post_message');
select pg_temp.ok(not exists (select 1 from information_schema.columns
  where table_name = 'store_order_messages' and column_name = 'reply_to_message_id'),
  '0032 rollback drops reply_to_message_id');
