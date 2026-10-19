\set ON_ERROR_STOP 1
-- Historical mappings ENABLED: retain the existing 100 ms inbox contract
-- over a large, mostly Done archive. No assertion is disabled or relaxed.
insert into store_order_snapshots(order_number,idempotency_key,request_fingerprint,view_token_hash,buyer_name,buyer_roblox_username,total_amount)
select 'BW-HP'||lpad(g::text,6,'0'),'history-performance-'||g,repeat('8',64),repeat('8',64),'History performance','perf',1
from generate_series(1,100000) g;
insert into store_order_conversations(order_number,last_message_id,last_message_at,last_message_kind,last_message_preview,last_sender_role,state,done_at,assigned_admin_id)
select 'BW-HP'||lpad(g::text,6,'0'),gen_random_uuid(),'2024-01-01'::timestamptz-g*interval '1 minute','text','Archive','admin',
case when g%3333=0 then 'active' else 'done' end,
case when g%3333=0 then null else now() end,
case when g%19998=0 then '00000000-0000-0000-0000-0000000000a1'::uuid end
from generate_series(1,100000) g;
analyze store_order_conversations;
analyze store_chat_threads;
analyze store_chat_history_links;
do $$ declare f text; enabled boolean; elapsed interval; t timestamptz; begin
 foreach enabled in array array[true,false] loop
 update store_chat_settings set historical_chat_enabled=enabled where id;
 foreach f in array array['active','unread','mine','unassigned','done','all'] loop
  perform * from store_admin_inbox('00000000-0000-0000-0000-0000000000a1',f,null,null,null,31);
  t:=clock_timestamp();
  perform * from store_admin_inbox('00000000-0000-0000-0000-0000000000a1',f,null,null,null,31);
  elapsed:=clock_timestamp()-t;
  if elapsed>interval '100 ms' then raise exception 'FAIL: historical inbox % took %',f,elapsed; end if;
  raise notice 'ok - historical inbox % (enabled=%) over 100000 rows: %',f,enabled,elapsed;
 end loop;
 end loop;
 update store_chat_settings set historical_chat_enabled=true where id;
end $$;
delete from store_order_conversations where order_number like 'BW-HP%';
delete from store_order_snapshots where order_number like 'BW-HP%';
\echo 'ALL HISTORICAL PERFORMANCE TESTS PASSED'
