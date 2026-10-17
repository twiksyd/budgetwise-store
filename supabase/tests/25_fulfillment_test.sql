-- Tests for 0022 (structured fulfillment details).
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, label text) returns void
language plpgsql as $$ begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label; end $$;
create or replace function pg_temp.raises(sql text, expected_state text, label text) returns void
language plpgsql as $$ begin
  begin execute sql;
  exception when others then
    if expected_state is not null and sqlstate <> expected_state then
      raise exception 'FAIL: % (expected %, got % %)', label, expected_state, sqlstate, sqlerrm; end if;
    raise notice 'ok - % (%)', label, sqlstate; return; end;
  raise exception 'FAIL: % (statement succeeded)', label; end $$;

\set robert '''00000000-0000-0000-0000-0000000000a1'''
\set custa  '''00000000-0000-0000-0000-0000000000c1'''
\set custb  '''00000000-0000-0000-0000-0000000000c2'''

\echo '--- structured fulfillment details (0022)'
-- Order A gets a Via Link line with quantity 2 (allowed by the cart today).
insert into store_order_line_snapshots (order_number, line_index, gamepass_id, game_id, product_name,
  game_name, robux_amount, quantity, unit_price, line_total)
values ('BW-AAAAAA', 0, gen_random_uuid(), 'bf10c2e9-d9f2-4f86-8c7d-5c94b7354a75', '500 Robux',
  'Robux (Via Link)', 500, 2, 125, 250);

truncate realtime.messages;
select store_set_fulfillment_detail('BW-AAAAAA', 0, 0, 'roblox_gamepass_url',
  'https://www.roblox.com/game-pass/123456789', '123456789', :custa, 'customer');
select pg_temp.ok(
  (select value = 'https://www.roblox.com/game-pass/123456789' and external_id = '123456789'
      and source = 'customer' and updated_by = :custa
     from store_order_fulfillment_details where order_number = 'BW-AAAAAA' and unit_index = 0),
  'customer submits a link for unit 0; canonical URL + gamepass id stored');
select pg_temp.ok(
  (select count(*) from store_order_fulfillment_details where order_number = 'BW-AAAAAA') = 1,
  'unit 1 of the same line is still empty (per-unit, not one link for the whole quantity)');
select pg_temp.ok(
  (select array_agg(k order by k) from realtime.messages, jsonb_object_keys(payload) k
    where topic = 'admin:inbox' and event = 'fulfillment') = array['conversation_id', 'field_key', 'order_number']
  and (select count(*) from realtime.messages where payload::text like '%123456789%') = 0,
  'admins get a compact fulfillment ping with no value in it');
select pg_temp.ok(
  (select count(*) from realtime.messages where topic like 'chat:%' and event = 'fulfillment') = 1,
  'the customer''s other tabs get a ping too');
select pg_temp.ok(
  (select details->>'before' is null and details->>'after' = 'https://www.roblox.com/game-pass/123456789'
      and actor_user_id = :custa
     from store_chat_audit_log where action = 'fulfillment_detail.submitted'),
  'customer submission is audited');

select store_set_fulfillment_detail('BW-AAAAAA', 0, 0, 'roblox_gamepass_url',
  'https://www.roblox.com/game-pass/987654321', '987654321', :robert, 'admin');
select pg_temp.ok(
  (select details->>'before' = 'https://www.roblox.com/game-pass/123456789'
      and details->>'after' = 'https://www.roblox.com/game-pass/987654321'
      and actor_user_id = :robert and created_at is not null
     from store_chat_audit_log where action = 'fulfillment_detail.corrected'),
  'admin correction audited with who, previous value, new value, when');
select pg_temp.ok(
  (select source = 'admin' from store_order_fulfillment_details where order_number = 'BW-AAAAAA' and unit_index = 0),
  'current value records that an admin set it');

select store_set_fulfillment_detail('BW-AAAAAA', 0, 0, 'roblox_gamepass_url',
  'https://www.roblox.com/game-pass/987654321', '987654321', :robert, 'admin');
select pg_temp.ok(
  (select count(*) from store_chat_audit_log where action like 'fulfillment_detail.%') = 2,
  'saving an identical value writes nothing and audits nothing');

select pg_temp.raises($$select store_set_fulfillment_detail('BW-AAAAAA', 0, 1, 'roblox_gamepass_url',
  'https://www.roblox.com/game-pass/5', '5', '00000000-0000-0000-0000-0000000000c2', 'customer')$$, '42501',
  'customer B cannot write customer A''s fulfillment details');
select pg_temp.raises($$select store_set_fulfillment_detail('BW-AAAAAA', 0, 1, 'roblox_gamepass_url',
  'https://www.roblox.com/game-pass/5', '5', '00000000-0000-0000-0000-0000000000c1', 'admin')$$, '42501',
  'a customer cannot write as an admin');
select pg_temp.raises($$select store_set_fulfillment_detail('BW-AAAAAA', 0, 2, 'roblox_gamepass_url',
  'https://www.roblox.com/game-pass/5', '5', '00000000-0000-0000-0000-0000000000c1', 'customer')$$, '22023',
  'unit index beyond the line quantity is refused');
select pg_temp.raises($$select store_set_fulfillment_detail('BW-AAAAAA', 9, 0, 'roblox_gamepass_url',
  'https://www.roblox.com/game-pass/5', '5', '00000000-0000-0000-0000-0000000000c1', 'customer')$$, 'P0002',
  'a line that does not exist is refused');
select pg_temp.raises($$select store_set_fulfillment_detail('BW-AAAAAA', 0, 1, 'roblox_gamepass_url',
  'https://evil.example/game-pass/5', '5', '00000000-0000-0000-0000-0000000000c1', 'customer')$$, '23514',
  'database refuses a non-canonical gamepass URL even if the app let it through');
select pg_temp.raises($$select store_set_fulfillment_detail('BW-AAAAAA', 0, 1, 'roblox_gamepass_url',
  'https://www.roblox.com/game-pass/5', '6', '00000000-0000-0000-0000-0000000000c1', 'customer')$$, '23514',
  'database refuses a URL whose id does not match the stored gamepass id');
select pg_temp.raises($$select store_set_fulfillment_detail('BW-AAAAAA', 0, 1, 'roblox_gamepass_url',
  'javascript:alert(1)', '5', '00000000-0000-0000-0000-0000000000c1', 'customer')$$, '23514',
  'database refuses script URLs');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select pg_temp.raises($$select * from store_order_fulfillment_details$$, '42501', 'customers cannot read fulfillment details directly');
select pg_temp.raises($$select store_set_fulfillment_detail('BW-AAAAAA', 0, 1, 'roblox_gamepass_url',
  'https://www.roblox.com/game-pass/5', '5', '00000000-0000-0000-0000-0000000000c1', 'customer')$$, '42501',
  'customers cannot call the write function directly (only through the server)');
reset role;
\echo 'ALL 0022 DATABASE TESTS PASSED'
