-- Before the 0026 rollback: a General Inquiry with messages exists, so the
-- rollback must refuse (checked by the runner).
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;

\echo '--- 0026 rollback guard'
select store_open_inquiry('00000000-0000-0000-0000-0000000000c1', 'Juan') as inq \gset
select store_post_message(:'inq', 'customer', '00000000-0000-0000-0000-0000000000c1', 'text', 'Hello', null, null, gen_random_uuid());
select pg_temp.ok(exists (select 1 from store_order_conversations where order_number = :'inq'), 'an inquiry conversation exists');
