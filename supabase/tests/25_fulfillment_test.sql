-- Tests for draft 0022 (structured fulfillment details).
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

\echo '--- structured fulfillment details (draft 0022)'
\set line '{"user_id": null, "gamepass_id": "5f0c1b2a-3d4e-4f60-8a7b-9c0d1e2f3a4b", "game_id": "bf10c2e9-d9f2-4f86-8c7d-5c94b7354a75", "product_name": "500 Robux", "game_name": "Robux (Via Link)", "robux_amount": 500, "quantity": 1, "unit_price": 150, "line_total": 150, "is_via_plus": false, "line_robux_amount": 500, "line_cost": 100, "line_profit": 50}'

select create_store_order_v2('idem-key-fulfil-0000000001', repeat('e',64), repeat('e',64), 'BW-FFFFFF',
  'Ana', 'anaRBX', 150, jsonb_build_array(:'line'::jsonb), null,
  '[{"line_index": 0, "field_key": "roblox_gamepass_url", "value": "https://www.roblox.com/game-pass/123456789"}]');
select pg_temp.ok(
  (select value from store_order_fulfillment_details where order_number = 'BW-FFFFFF' and line_index = 0
     and field_key = 'roblox_gamepass_url') = 'https://www.roblox.com/game-pass/123456789'
  and (select source from store_order_fulfillment_details where order_number = 'BW-FFFFFF') = 'checkout',
  'checkout stores the gamepass link against the exact order line');

select create_store_order_v2('idem-key-fulfil-0000000001', repeat('e',64), repeat('e',64), 'BW-FFFFF2',
  'Ana', 'anaRBX', 150, jsonb_build_array(:'line'::jsonb), null,
  '[{"line_index": 0, "field_key": "roblox_gamepass_url", "value": "https://www.roblox.com/game-pass/123456789"}]');
select pg_temp.ok(
  (select count(*) from store_order_fulfillment_details) = 1
  and not exists (select 1 from store_order_snapshots where order_number = 'BW-FFFFF2'),
  'an idempotent replay writes no second order and no duplicate details');

select pg_temp.raises(
  format($$select create_store_order_v2('idem-key-fulfil-0000000002', repeat('e',64), repeat('e',64), 'BW-GGGGGG',
     'Ben', 'benRBX', 150, jsonb_build_array(%L::jsonb), null,
     '[{"line_index": 7, "field_key": "roblox_gamepass_url", "value": "https://www.roblox.com/game-pass/1"}]')$$, :'line'),
  '23503', 'a detail for a line that does not exist is rejected');
select pg_temp.ok(
  not exists (select 1 from store_order_snapshots where order_number = 'BW-GGGGGG')
  and not exists (select 1 from orders where order_number = 'BW-GGGGGG'),
  'and the whole order rolls back with it (atomic)');

select create_store_order('idem-key-legacy-000000001', repeat('f',64), repeat('f',64), 'BW-HHHHHH',
  'Cy', 'cyRBX', 150, jsonb_build_array(:'line'::jsonb), null);
select pg_temp.ok(
  exists (select 1 from store_order_snapshots where order_number = 'BW-HHHHHH')
  and not exists (select 1 from store_order_fulfillment_details where order_number = 'BW-HHHHHH'),
  'the currently deployed create_store_order keeps working; such orders just have no details');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select pg_temp.raises($$select * from store_order_fulfillment_details$$, '42501', 'customers cannot read fulfillment details directly');
select pg_temp.raises($$select create_store_order_v2('x', 'x', 'x', 'x', 'x', 'x', 1, '[]', null, null)$$, '42501', 'customers cannot call order creation directly');
reset role;
\echo 'ALL 0022 DATABASE TESTS PASSED'
