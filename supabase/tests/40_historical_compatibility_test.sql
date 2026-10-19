\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean,label text) returns void language plpgsql as $$
begin if cond is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'ok - %',label; end $$;
create or replace function pg_temp.raises(sql text,code text,label text) returns void language plpgsql as $$
begin begin execute sql; exception when others then if sqlstate <> code then raise exception 'FAIL: % (got % %)',label,sqlstate,sqlerrm; end if; raise notice 'ok - %',label; return; end; raise exception 'FAIL: % (succeeded)',label; end $$;
\set a '''00000000-0000-0000-0000-0000000000a1'''
\set b '''00000000-0000-0000-0000-0000000000a2'''
\set u '''00000000-0000-0000-0000-000000003601'''
insert into auth.users(id,email) values (:u,'compat@test.local');
create or replace function pg_temp.history_order(k text,u uuid) returns void language plpgsql as $$
begin
 insert into store_order_snapshots(order_number,idempotency_key,request_fingerprint,view_token_hash,buyer_name,buyer_roblox_username,total_amount,owner_user_id)
 values(k,'compat-test-'||k,repeat('5',64),repeat('5',64),'Customer','customer',150,u);
 insert into store_order_line_snapshots(order_number,line_index,gamepass_id,game_id,product_name,game_name,robux_amount,quantity,unit_price,line_total)
 values(k,0,'22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','History product','Blox Fruits',100,1,150,150);
 insert into orders(order_number,buyer_name,buyer_roblox_username,status) values(k,'Customer','customer','delivered');
 perform store_post_message(k,'customer',u,'text','Historical message',null,null,gen_random_uuid());
end $$;
select pg_temp.history_order('BW-C36001',:u);
select pg_temp.history_order('BW-C36002',:u);
select pg_temp.history_order('BW-C36003',:u);
select pg_temp.history_order('BW-C36004',:u);
select pg_temp.raises(format('select store_initialize_customer_conversation(%L,%L)',:u,:u),'42501','initializer rejects non-admin');
select pg_temp.raises(format('select store_initialize_customer_conversation(%L,%L)','00000000-0000-0000-0000-000000003699',:a),'42501','initializer refuses invented ownership');
select store_initialize_customer_conversation(:u,:a) as home \gset
select pg_temp.ok((select last_message_id is null and last_message_at is null and last_message_kind is null and last_sender_role is null from store_order_conversations where order_number=:'home'),'empty conversation has no fake activity');
select pg_temp.ok(store_initialize_customer_conversation(:u,:b)=:'home','initializer idempotent across actors and several orders');
select pg_temp.ok((select count(*)=1 from store_history_operations where customer_id=:u and operation='initialize'),'idempotent initialization writes one audit');
select pg_temp.ok(not exists(select 1 from store_admin_inbox(:a,'all',null,null,null,100,:'home')),'empty unlinked conversation hidden from inbox');
-- 110 verified customers, including 24 existing inquiries without metadata.
do $$ declare n int; u uuid; k text; h text; begin
 for n in 1..110 loop
  u:=('00000000-0000-0000-0001-'||lpad(n::text,12,'0'))::uuid; k:='BW-CI'||lpad(n::text,4,'0');
  insert into auth.users(id,email) values(u,'compat-init-'||n||'@test.local');
  perform pg_temp.history_order(k,u);
  if n<=24 then perform store_open_inquiry(u,null); end if;
  h:=store_initialize_customer_conversation(u,'00000000-0000-0000-0000-0000000000a1');
  perform pg_temp.ok(h=store_initialize_customer_conversation(u,'00000000-0000-0000-0000-0000000000a1'),'110-customer initializer repeat '||n);
 end loop;
end $$;
select pg_temp.ok((select count(*)=110 from store_chat_threads t join store_order_conversations c on c.order_number=t.key where t.owner_user_id::text like '00000000-0000-0000-0001-%' and t.kind='inquiry'),'all 110 customers initialized once');
-- Real message metadata reconstruction without manufacturing personal cursors.
select key as repairhome from store_chat_threads where owner_user_id='00000000-0000-0000-0001-000000000001' and kind='inquiry' \gset
select store_post_message(:'repairhome','customer','00000000-0000-0000-0001-000000000001','text','Real inquiry',null,null,gen_random_uuid());
select pg_temp.ok((select last_message_id is not null from store_order_conversations where order_number=:'repairhome'),'first real message replaces NULL activity');
create temp table real_meta as select * from store_order_conversations where order_number=:'repairhome';
delete from store_order_conversations where order_number=:'repairhome';
select store_initialize_customer_conversation('00000000-0000-0000-0001-000000000001',:a);
select pg_temp.ok((select c.last_message_id=r.last_message_id and c.last_message_at=r.last_message_at and c.last_customer_message_id=r.last_customer_message_id from store_order_conversations c join real_meta r using(order_number)),'reconstructed metadata uses real IDs/timestamps');
-- Repeated initialization preserves genuine workflow state, assignment and cursors.
select id as repairlast from store_order_messages where order_number=:'repairhome' order by created_at desc,id desc limit 1 \gset
select store_set_conversation_state(:'repairhome',:a,'done',:'repairlast');
select store_assign_conversation(:'repairhome',:b,:a);
create temp table existing_inquiry_meta_36 as select * from store_order_conversations where order_number=:'repairhome';
select store_initialize_customer_conversation('00000000-0000-0000-0001-000000000001',:a);
select pg_temp.ok(not exists(select * from existing_inquiry_meta_36 except select * from store_order_conversations),'initializer preserves existing Done assignment and metadata');
-- Explicit Done keeps its meaning even with unanswered customer messages / missing cursors.
select id as last1 from store_order_messages where order_number='BW-C36001' limit 1 \gset
select id as last2 from store_order_messages where order_number='BW-C36002' limit 1 \gset
select store_set_conversation_state('BW-C36001',:a,'done',:'last1');
select store_post_message('BW-C36001','admin',:a,'text','Real admin unread',null,null,gen_random_uuid()) -> 'message' ->> 'id' as adminmsg \gset
select store_mark_admin_read('BW-C36002',:b,:'last2');
select store_post_message('BW-C36002','customer',:u,'text','Later unread',null,null,gen_random_uuid()) -> 'message' ->> 'id' as later \gset
select store_set_conversation_state('BW-C36002',:a,'done',:'later');
select store_post_message('BW-C36004','admin',:a,'text','Answered but assignment conflict',null,null,gen_random_uuid());
select store_assign_conversation('BW-C36004',:b,:a);
-- Legacy guest messages retain their missing sender ID; verified snapshot ownership remains authoritative.
update store_order_messages set sender_user_id=null where order_number='BW-C36002';
create temp table preserved_messages_36 as select * from store_order_messages;
create temp table preserved_reads_36 as select * from store_conversation_reads;
create temp table preserved_convs_36 as select * from store_order_conversations;
create temp table preserved_orders_36 as select * from orders;
create temp table preserved_payments_36 as select * from store_payment_confirmations;
update store_chat_settings set historical_chat_enabled=true where id;
select pg_temp.ok(not store_link_historical_chat('BW-C36001',:a),'compatibility readiness defaults OFF');
update store_chat_settings set historical_chat_compat_ready=true where id;
select pg_temp.ok(not store_link_historical_chat('BW-C36001',:a),'global flag cannot link unapproved history');
select gen_random_uuid() as batch \gset
select store_approve_history_batch(array['BW-C36001','BW-C36002','BW-C36003','BW-C36004'],:a,:'batch',now()+interval '1 hour');
select pg_temp.ok(store_link_historical_chat('BW-C36001',:a),'Done with missing individual read cursors links explicitly');
select pg_temp.ok(store_link_historical_chat('BW-C36002',:a),'Done with lagging personal cursor links explicitly');
select pg_temp.ok(not store_link_historical_chat('BW-C36003',:a),'active Needs Reply remains separate');
select pg_temp.ok(not store_link_historical_chat('BW-C36004',:a),'active assignment conflict remains separate');
select pg_temp.ok(store_link_historical_chat('BW-C36001',:b),'repeat link idempotent');
select pg_temp.ok((select count(*)=2 from store_chat_history_links where home_key=:'home'),'only explicitly selected eligible sources linked');
select pg_temp.ok(not exists((select * from preserved_messages_36 except select * from store_order_messages) union all (select * from store_order_messages except select * from preserved_messages_36)),'message identity and content unchanged');
select pg_temp.ok(not exists(select * from preserved_reads_36 except select * from store_conversation_reads) and (select count(*) from preserved_reads_36)=(select count(*) from store_conversation_reads),'no manufactured personal reads');
select pg_temp.ok(not exists(select * from preserved_convs_36 except select * from store_order_conversations),'all states assignments read/payment metadata preserved');
select pg_temp.ok(not exists(select * from preserved_orders_36 except select * from orders),'orders unchanged');
select pg_temp.ok(not exists(select * from preserved_payments_36 except select * from store_payment_confirmations),'payments unchanged');
select pg_temp.ok((select sum(admin_unread)=3 and sum(customer_unread)=1 from store_history_sources(array[:'home'],:a)),'unified history unread preserves real source counts');
select pg_temp.ok((select sum(admin_unread)=2 from store_history_sources(array[:'home'],:b)),'different admin cursors isolated');
select pg_temp.ok((select unread_count=3 from store_admin_inbox(:a,'unread',:'home',null,null,100)),'empty home inbox exposes source activity and unread');
select pg_temp.ok((select unread_count=1 from store_customer_conversations(:u) where order_number=:'home'),'customer history unread preserved');
select pg_temp.ok(not exists(select 1 from store_admin_inbox(:a,'all',null,null,null,100,'BW-C36001')),'source produces no duplicate inbox row');
select pg_temp.ok((select count(*)=4 from store_chat_messages_page(:'home',null,null,50)),'unified history has original messages');
select pg_temp.ok((select last_message_id is null from store_order_conversations where order_number=:'home'),'derived activity never persisted to empty home');
select pg_temp.ok((store_history_review(null,:u,0)::text like '%Needs Reply%' and store_history_review(null,:u,0)::text like '%Assignment conflict%'),'review explains blockers without changing cursors');
select store_mark_admin_read('BW-C36001',:a,:'last1');
select pg_temp.ok((select sum(admin_unread)=2 from store_history_sources(array[:'home'],:a)),'explicit source read advances only that source');
select pg_temp.ok((select sum(admin_unread)=2 from store_history_sources(array[:'home'],:b)),'source acknowledgment cannot clear another admin');
select store_mark_customer_read('BW-C36001',:'adminmsg');
select pg_temp.ok((select sum(customer_unread)=0 from store_history_sources(array[:'home'])),'customer explicit acknowledgment uses source cursor');
-- An explicit workflow action may close an empty home using a real visible source message.
select id as visible_last from store_chat_messages_page(:'home',null,null,50) order by created_at desc,id desc limit 1 \gset
select store_set_conversation_state(:'home',:a,'done',:'visible_last');
select pg_temp.ok((select state='done' and last_message_id is null from store_order_conversations where order_number=:'home'),'explicit closure uses visible history without fake activity');
select pg_temp.ok(exists(select 1 from store_admin_inbox(:a,'unread',:'home',null,null,100) where order_number=:'home' and state='done' and unread_count=2),'Done home remains in real Unread filter with source cursors intact');
select store_post_message(:'home','customer',:u,'text','New ongoing conversation',null,null,gen_random_uuid());
select pg_temp.ok((select state='active' and last_message_id is not null from store_order_conversations where order_number=:'home'),'first ongoing message creates real activity and reopens explicitly closed home');
select pg_temp.raises(format('select store_initialize_customer_batch(%L::uuid[],%L)',array_fill(:u::uuid,array[26])::text,:a),'P0001','initialization batches bounded at 25');
select pg_temp.raises(format('select store_approve_history_batch(%L::text[],%L,%L,now()+interval ''1 hour'')',array_fill('BW-C36001'::text,array[26])::text,:a,:'batch'),'P0001','approval batches bounded at 25');
update store_chat_settings set historical_chat_enabled=false where id;
select pg_temp.ok(not exists(select 1 from store_history_sources(array[:'home'],:a)),'recovery hides presentation only');
select pg_temp.ok((select count(*)=2 from store_chat_history_links where home_key=:'home'),'recovery retains mappings');
select pg_temp.ok(exists(select 1 from store_admin_inbox(:a,'all',null,null,null,100,'BW-C36001')),'flag off restores source row');
select pg_temp.ok(not has_function_privilege('authenticated','store_initialize_customer_conversation(uuid,uuid)','execute'),'initializer service only');
select pg_temp.ok(not has_function_privilege('anon','store_history_review(uuid,uuid,integer)','execute'),'review private');
-- Imported ownership conflict must never be silently adopted by initialization.
select key as conflicthome from store_chat_threads where kind='inquiry' and owner_user_id='00000000-0000-0000-0001-000000000110' \gset
insert into store_order_messages(order_number,sender_role,sender_user_id,kind,body,client_message_id)
values(:'conflicthome','customer',:u,'text','Inconsistent imported identity',gen_random_uuid());
select pg_temp.raises(format('select store_initialize_customer_conversation(%L,%L)','00000000-0000-0000-0001-000000000110',:a),'42501','initializer refuses conflicting inquiry ownership');
select pg_temp.ok(not has_function_privilege('authenticated','store_approve_history_batch(text[],uuid,uuid,timestamptz)','execute'),'approvals service only');
select pg_temp.ok(not has_function_privilege('authenticated','store_link_history_batch(text[],uuid,uuid)','execute'),'bounded linking service only');
\echo 'ALL COMPATIBILITY TESTS PASSED' 
