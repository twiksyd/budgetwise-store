insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'robert@bw.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'andre@bw.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'custa@gmail.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'custb@gmail.test');
insert into public.admin_users (user_id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2');

insert into public.store_order_snapshots
  (order_number, idempotency_key, request_fingerprint, view_token_hash,
   buyer_name, buyer_roblox_username, total_amount, owner_user_id, created_at)
values
  ('BW-AAAAAA', 'idem-key-aaaaaaaaaaaaaaaa', repeat('a',64), repeat('a',64),
   'Juan Dela Cruz', 'Juan123', 250, '00000000-0000-0000-0000-0000000000c1', now() - interval '2 hours'),
  ('BW-BBBBBB', 'idem-key-bbbbbbbbbbbbbbbb', repeat('b',64), repeat('b',64),
   'Maria Santos', 'mariaRBX', 99, '00000000-0000-0000-0000-0000000000c2', now() - interval '1 hour');

insert into public.orders (order_number, buyer_name, buyer_roblox_username, status)
values ('BW-AAAAAA', 'Juan Dela Cruz', 'Juan123', 'pending'),
       ('BW-AAAAAA', 'Juan Dela Cruz', 'Juan123', 'pending'),
       ('BW-BBBBBB', 'Maria Santos', 'mariaRBX', 'delivered');

-- A chat that has been fully handled (read_at set both ways) and one with an
-- unread customer message.
insert into public.store_order_messages (order_number, sender_role, sender_user_id, kind, body, created_at, read_at) values
  ('BW-AAAAAA', 'customer', '00000000-0000-0000-0000-0000000000c1', 'slip', 'ORDER SLIP A', now() - interval '110 min', now() - interval '100 min'),
  ('BW-AAAAAA', 'admin', '00000000-0000-0000-0000-0000000000a1', 'text', 'Hello po', now() - interval '100 min', now() - interval '90 min'),
  ('BW-AAAAAA', 'customer', '00000000-0000-0000-0000-0000000000c1', 'text', 'ok thanks', now() - interval '90 min', now() - interval '80 min'),
  ('BW-BBBBBB', 'customer', '00000000-0000-0000-0000-0000000000c2', 'slip', 'ORDER SLIP B', now() - interval '50 min', null);

-- An order placed on the old flow: snapshot, no owner, no chat.
insert into public.store_order_snapshots
  (order_number, idempotency_key, request_fingerprint, view_token_hash,
   buyer_name, buyer_roblox_username, total_amount, owner_user_id)
values ('BW-NOCHAT', 'idem-key-nochatnochatnoch', repeat('d',64), repeat('d',64),
        'Old Flow', 'oldflow', 50, null);
