-- Fingerprint every existing message and snapshot row BEFORE 0021 runs, so
-- the tests can prove the migration (and a second run of it) changed none.
create table public.test_before as
select
  (select count(*) from public.store_order_messages) as message_count,
  (select md5(string_agg(concat_ws('|', id, order_number, sender_role, sender_user_id,
                                   kind, body, attachment_path, created_at, read_at), ','
                         order by id))
     from public.store_order_messages) as message_hash,
  (select md5(string_agg(concat_ws('|', order_number, buyer_name, buyer_roblox_username,
                                   total_amount, owner_user_id, created_at), ','
                         order by order_number))
     from public.store_order_snapshots) as snapshot_hash;
