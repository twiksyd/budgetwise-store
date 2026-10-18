-- Tests for 0029 (payment auto-assign, game filters, customer identity).
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

\set robert  '''00000000-0000-0000-0000-0000000000a1'''
\set andre   '''00000000-0000-0000-0000-0000000000a2'''
\set kenneth '''00000000-0000-0000-0000-0000000000a3'''
\set custa   '''00000000-0000-0000-0000-0000000000c1'''
\set custb   '''00000000-0000-0000-0000-0000000000c2'''
\set karin   '''11111111-0000-0000-0000-00000000000a'''
\set drag    '''11111111-0000-0000-0000-00000000000b'''

insert into auth.users (id, email) values (:kenneth, 'kenneth@bw.test') on conflict do nothing;
insert into admin_users (user_id, display_name) values (:kenneth, 'Kenneth') on conflict do nothing;
update auth.users set raw_user_meta_data = '{"avatar_url": "https://lh3.googleusercontent.com/a/photo-a", "email": "custa@gmail.test", "sub": "1234"}'
 where id = :custa;

-- Three orders: Karinderya, Drag Drive, and a mixed one; plus an inquiry.
create or replace function pg_temp.order(p_order text, p_owner uuid, p_games uuid[], p_names text[]) returns void
language plpgsql as $$ begin
  insert into store_order_snapshots (order_number, idempotency_key, request_fingerprint, view_token_hash,
    buyer_name, buyer_roblox_username, total_amount, owner_user_id)
  values (p_order, 'idem-' || lower(p_order) || '-0029-0000', repeat('3', 64), repeat('3', 64),
          'Buyer ' || p_order, 'rbx' || p_order, 100, p_owner);
  for i in 1 .. cardinality(p_games) loop
    insert into store_order_line_snapshots (order_number, line_index, game_id, product_name, game_name,
      robux_amount, quantity, unit_price, line_total)
    values (p_order, i - 1, p_games[i], 'Item ' || i, p_names[i], 0, 1, 50, 50);
  end loop;
  insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body)
  values (p_order, 'customer', p_owner, 'slip', 'SLIP ' || p_order);
end $$;
select pg_temp.order('BW-GAMEA1', :custa, array[:karin]::uuid[], array['Karinderya']);
select pg_temp.order('BW-GAMEB1', :custb, array[:drag]::uuid[], array['Drag Drive Simulator']);
select pg_temp.order('BW-GAMEAB', :custa, array[:karin, :drag]::uuid[], array['Karinderya', 'Drag Drive Simulator']);
select pg_temp.order('BW-LEGACY', null, array[:karin]::uuid[], array['Karinderya']);
select store_open_inquiry(:custb, 'Maria') as gi \gset
select store_post_message(:'gi', 'customer', :custb, 'text', 'Question', null, null, gen_random_uuid());

create or replace function pg_temp.keys(p_admin uuid, p_filter text, p_games uuid[], p_inq boolean default true) returns text[]
language sql as $$
  select coalesce(array_agg(order_number order by order_number), '{}')
    from store_admin_inbox(p_admin, p_filter, null, null, null, 100, null, p_games, p_inq)
   where order_number in ('BW-GAMEA1', 'BW-GAMEB1', 'BW-GAMEAB', 'BW-LEGACY')
      or order_number like 'GI-%' and order_number in (select key from store_chat_threads where owner_user_id = '00000000-0000-0000-0000-0000000000c2') $$;

\echo '--- game filters (0029)'
select pg_temp.ok(pg_temp.keys(:robert, 'active', null) = array['BW-GAMEA1', 'BW-GAMEAB', 'BW-GAMEB1', 'BW-LEGACY', :'gi'],
  'All games: every order and the inquiry');
select pg_temp.ok(pg_temp.keys(:robert, 'active', array[:karin]::uuid[]) = array['BW-GAMEA1', 'BW-GAMEAB', 'BW-LEGACY', :'gi'],
  'Karinderya: its orders, the mixed order, and General Inquiry');
select pg_temp.ok(pg_temp.keys(:robert, 'active', array[:karin]::uuid[], false) = array['BW-GAMEA1', 'BW-GAMEAB', 'BW-LEGACY'],
  'General Inquiry can be left out');
select pg_temp.ok(pg_temp.keys(:robert, 'active', '{}'::uuid[], true) = array[:'gi'],
  'General Inquiry only');
select pg_temp.ok(pg_temp.keys(:robert, 'active', array[:karin, :drag]::uuid[], false) = array['BW-GAMEA1', 'BW-GAMEAB', 'BW-GAMEB1', 'BW-LEGACY'],
  'several games: orders containing any of them');
select pg_temp.ok(pg_temp.keys(:robert, 'needs_reply', array[:drag]::uuid[], false) = array['BW-GAMEAB', 'BW-GAMEB1'],
  'combines with Needs reply');
select pg_temp.ok(pg_temp.keys(:robert, 'unassigned', array[:drag]::uuid[], false) = array['BW-GAMEAB', 'BW-GAMEB1'],
  'combines with Unassigned');
select pg_temp.ok(
  (select count(*) from store_admin_inbox(:robert, 'all', null, null, null, 1, 'BW-GAMEB1', array[:karin]::uuid[], false)) = 1,
  'a single-row fetch ignores the game filter (the browser decides)');
select pg_temp.ok(
  (select count(*) = 1 and bool_and(order_number = 'BW-GAMEAB')
     from store_admin_inbox(:robert, 'active', null,
       (select last_message_at from store_order_conversations where order_number = 'BW-LEGACY'), 'BW-LEGACY',
       1, null, array[:drag]::uuid[], false)),
  'pagination cursor works under a game filter');
select pg_temp.ok(store_admin_inbox_outside_count(:robert, array[:karin]::uuid[], true) >= 1
  and store_admin_inbox_outside_count(:robert, null, true) = 0,
  'urgent chats outside the chosen games are counted (0 for All games)');

\echo '--- customer identity and games on rows (0029)'
select pg_temp.ok(
  (select customer_user_id = :custa and customer_photo_url = 'https://lh3.googleusercontent.com/a/photo-a'
          and game_names = array['Drag Drive Simulator', 'Karinderya'] and cardinality(game_ids) = 2
     from store_admin_inbox(:robert, p_order_number => 'BW-GAMEAB')),
  'a row carries its owner, Google photo and every game');
select pg_temp.ok(
  (select customer_user_id = :custb and customer_photo_url is null from store_admin_inbox(:robert, p_order_number => :'gi')),
  'General Inquiry rows carry their customer too (no photo: null)');
select pg_temp.ok(
  (select customer_user_id is null and customer_photo_url is null from store_admin_inbox(:robert, p_order_number => 'BW-LEGACY')),
  'a legacy order without an account has no identity (falls back in the app)');

\echo '--- payment details auto-assign (0029)'
select (store_save_payment_method(:robert, null, 'GCash', 'B W Store', '09170000029', null, true)).id as method \gset
truncate realtime.messages;
select store_send_payment_details('BW-GAMEA1', :robert, :'method', gen_random_uuid()) as pay1 \gset
select pg_temp.ok((select assigned_admin_id = :robert and assigned_by = :robert from store_order_conversations where order_number = 'BW-GAMEA1'),
  'an Unassigned chat is assigned to the admin who sent payment details');
select pg_temp.ok(
  (select count(*) = 1 and bool_and(actor_user_id = :robert and details ->> 'cause' = 'payment_details'
                                    and details ->> 'to' = :robert and details ->> 'message_id' = :'pay1')
     from store_chat_audit_log where order_number = 'BW-GAMEA1' and action = 'conversation.assigned'),
  'the assignment is audited (cause payment_details)');
select pg_temp.ok(exists (select 1 from realtime.messages where topic = 'admin:inbox' and event = 'conversation'
                            and payload ->> 'order_number' = 'BW-GAMEA1' and payload ->> 'assigned_admin_id' = :robert),
  'every admin gets the assignment live');
select store_send_payment_details('BW-GAMEA1', :andre, :'method', gen_random_uuid());
select pg_temp.ok((select assigned_admin_id = :robert from store_order_conversations where order_number = 'BW-GAMEA1')
  and (select count(*) from store_chat_audit_log where order_number = 'BW-GAMEA1' and action = 'conversation.assigned') = 1,
  'another admin''s payment card keeps the existing assignment');
select store_assign_conversation('BW-GAMEB1', :andre, :kenneth);
select store_send_payment_details('BW-GAMEB1', :robert, :'method', gen_random_uuid());
select pg_temp.ok((select assigned_admin_id = :andre from store_order_conversations where order_number = 'BW-GAMEB1'),
  'a manual assignment is preserved');
select store_assign_conversation('BW-GAMEA1', null, :kenneth);
select store_send_payment_details('BW-GAMEA1', :robert, :'method', (select client_message_id from store_order_messages where id = :'pay1'));
select pg_temp.ok((select assigned_admin_id is null from store_order_conversations where order_number = 'BW-GAMEA1'),
  'a retry of the same card never re-assigns after a manual unassign');
select store_post_message('BW-GAMEAB', 'admin', :kenneth, 'text', 'Send to GCash 09171234567 please', null, null, gen_random_uuid());
select pg_temp.ok((select assigned_admin_id is null from store_order_conversations where order_number = 'BW-GAMEAB'),
  'plain text with a phone number never assigns');
select store_assign_conversation('BW-GAMEB1', :kenneth, :robert);
select pg_temp.ok((select assigned_admin_id = :kenneth from store_order_conversations where order_number = 'BW-GAMEB1'),
  'manual reassignment still works');

\echo '--- browsers'
set role authenticated;
select pg_temp.raises($q$select * from store_admin_inbox_preferences$q$, '42501', 'browsers cannot read inbox preferences');
select pg_temp.raises($q$select store_admin_inbox_outside_count('00000000-0000-0000-0000-0000000000a1', null, true)$q$, '42501',
  'browsers cannot call the outside count');
reset role;

\echo 'PASSED 32_assign_games_avatars_test'
