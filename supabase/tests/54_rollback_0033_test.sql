-- After supabase/rollback/0033_down.sql: back to the 0032 shape.
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;

\echo '--- 0033 rollback'
select pg_temp.ok(to_regprocedure('public.store_attach_order_to_customer(text,uuid,text,text,uuid)') is null
  and to_regprocedure('public.store_send_recommendation(text,uuid,jsonb,uuid)') is null
  and to_regclass('public.store_order_recommendations') is null,
  '0033 rollback drops the attach / product card functions and the link table');
select pg_temp.ok(not exists (select 1 from information_schema.columns
    where table_name = 'store_order_messages' and column_name = 'order_ref')
  and not exists (select 1 from information_schema.columns
    where table_name = 'store_chat_threads' and column_name = 'home_key')
  and not exists (select 1 from information_schema.columns
    where table_name = 'store_payment_confirmations' and column_name = 'order_ref'),
  '0033 rollback drops order_ref and home_key');
select pg_temp.ok(not exists (select 1 from pg_trigger where tgname = 'store_order_messages_thread_guard'),
  '0033 rollback drops the thread guard');
select pg_temp.ok(pg_get_functiondef('public.store_send_payment_details(text,uuid,uuid,uuid)'::regprocedure) not like '%home_key%'
  and pg_get_functiondef('public.store_confirm_payment(text,uuid,uuid)'::regprocedure) not like '%order_ref%'
  and pg_get_functiondef('public.store_set_fulfillment_detail(text,integer,integer,text,text,text,uuid,text)'::regprocedure) not like '%home_key%',
  '0033 rollback restores the payment and fulfillment functions');
select pg_temp.ok(
  not exists (select 1 from information_schema.routines r
    join information_schema.parameters p on p.specific_name = r.specific_name
   where r.routine_name = 'store_admin_inbox' and p.parameter_name = 'order_count')
  and pg_get_functiondef('public.store_customer_orders(uuid,text,timestamptz,text,integer)'::regprocedure) not like '%home_key%',
  '0033 rollback restores the inbox and My Orders shapes');
select pg_temp.ok((select pg_get_constraintdef(oid) not like '%product%' from pg_constraint
    where conname = 'store_order_messages_kind_valid'),
  '0033 rollback removes the product message kind');
select pg_temp.ok(exists (select 1 from pg_indexes where indexname = 'store_order_messages_one_slip_idx'
    and indexdef not like '%order_ref%'),
  '0033 rollback restores one slip per chat');
