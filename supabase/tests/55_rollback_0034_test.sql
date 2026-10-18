\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;

select pg_temp.ok(to_regprocedure('public.store_send_vouch_request(text,uuid)') is null,
  '0034 rollback removes the vouch sender');
select pg_temp.ok(not exists (select 1 from pg_indexes where indexname = 'store_order_messages_one_vouch_per_conversation_idx'),
  '0034 rollback removes the one-vouch index');
select pg_temp.ok((select pg_get_constraintdef(oid) not like '%vouch%'
  from pg_constraint where conname = 'store_order_messages_kind_valid'
    and conrelid = 'public.store_order_messages'::regclass),
  '0034 rollback removes the vouch message kind');
select pg_temp.ok(public.store_chat_preview('product', '', '{"type":"game","game_name":"Blox Fruits"}') = 'Pricelist: Blox Fruits',
  '0034 rollback preserves the 0033 preview behavior');

select '0034 ROLLBACK TESTS PASSED' as result;
