\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean,label text) returns void language plpgsql as $$
begin if cond is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'ok - %',label; end $$;
create or replace function pg_temp.raises(sql text,code text,label text) returns void language plpgsql as $$
begin begin execute sql; exception when others then if sqlstate <> code then raise exception 'FAIL: % (got % %)',label,sqlstate,sqlerrm; end if; raise notice 'ok - %',label; return; end; raise exception 'FAIL: % (succeeded)',label; end $$;
\set a '''00000000-0000-0000-0000-0000000000a1'''
\set b '''00000000-0000-0000-0000-0000000000a2'''
\set u '''00000000-0000-0000-0000-000000003501'''
\set v '''00000000-0000-0000-0000-000000003502'''
\set w '''00000000-0000-0000-0000-000000003503'''
insert into auth.users(id,email) values (:u,'hist-one@test.local'),(:v,'hist-two@test.local'),(:w,'no-history@test.local');
select store_open_inquiry(:u,'Same Name') as home \gset
select store_open_inquiry(:v,'Same Name') as other \gset
select store_open_inquiry(:w,'No History') as emptyhome \gset
select store_post_message(:'home','customer',:u,'text','General inquiry',null,null,gen_random_uuid());
select store_post_message(:'other','customer',:v,'text','Other inquiry',null,null,gen_random_uuid());
create or replace function pg_temp.history_order(k text,u uuid) returns void language plpgsql as $$
begin
 insert into store_order_snapshots(order_number,idempotency_key,request_fingerprint,view_token_hash,buyer_name,buyer_roblox_username,total_amount,owner_user_id)
 values(k,'history-test-'||k,repeat('5',64),repeat('5',64),'Same Name','sameRbx',150,u);
 insert into store_order_line_snapshots(order_number,line_index,gamepass_id,game_id,product_name,game_name,robux_amount,quantity,unit_price,line_total)
 values(k,0,'22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','History product','Blox Fruits',100,1,150,150);
 insert into orders(order_number,buyer_name,buyer_roblox_username,status) values(k,'Same Name','sameRbx','delivered');
 perform store_post_message(k,'customer',u,'text','Historical customer message',null,null,gen_random_uuid());
end $$;
select pg_temp.history_order('BW-HST001',:u);
select pg_temp.history_order('BW-HST002',:u);
update store_order_line_snapshots set game_id='11111111-0000-0000-0000-000000000002',game_name='Historical game' where order_number='BW-HST002';
select pg_temp.history_order('BW-HST003',:u);
select pg_temp.history_order('BW-HST004',:v);
select pg_temp.history_order('BW-HST005',null);
select pg_temp.history_order('BW-HST006',:u);
select pg_temp.history_order('BW-HST007',:u);
-- A new order already in the ongoing conversation, plus old chats.
select pg_temp.history_order('BW-HSTNEW',:u);
delete from store_order_messages where order_number='BW-HSTNEW';
delete from store_order_conversations where order_number='BW-HSTNEW';
select store_attach_order_to_customer('BW-HSTNEW',:u,'NEW SLIP','Same Name',null);
select pg_temp.ok(not store_link_historical_chat('BW-HST001',:a),'migration is disabled by default');
update store_chat_settings set historical_chat_enabled=true where id;
select pg_temp.ok(not store_link_historical_chat('BW-HST001',:a),'unresolved customer message remains separate');
select pg_temp.ok(not store_link_historical_chat('BW-HST005',:a),'unowned order is never linked by matching name');
select pg_temp.raises(format('select store_link_historical_chat(%L,%L)','BW-HST001',:u),'42501','customer cannot forge a link');
-- Reply resolves the active work; Done is also supported, without fabricating a reply.
select store_post_message('BW-HST001','admin',:a,'text','Resolved',null,null,gen_random_uuid()) -> 'message' ->> 'id' as reply \gset
select store_post_message('BW-HST002','admin',:a,'text','Resolved too',null,null,gen_random_uuid());
select store_post_message('BW-HST004','admin',:a,'text','Other customer',null,null,gen_random_uuid());
select store_post_message('BW-HST006','admin',:a,'text','Unread by another admin',null,null,gen_random_uuid());
select store_post_message('BW-HST007','admin',:a,'text','Unread by customer',null,null,gen_random_uuid());
select id as done_last from store_order_messages where order_number='BW-HST002' order by created_at desc,id desc limit 1 \gset
select store_set_conversation_state('BW-HST002',:a,'done',:'done_last');
select pg_temp.ok(not store_link_historical_chat('BW-HST002',:a),'Done does not hide existing unread messages');
-- Only genuine read operations make histories eligible; linking never writes cursors.
do $$ declare k text; m uuid; a uuid; begin
 foreach k in array array['BW-HST001','BW-HST002','BW-HST004','BW-HST006','BW-HST007'] loop
   select id into m from store_order_messages where order_number=k order by created_at desc,id desc limit 1;
   for a in select user_id from admin_users loop
     if k <> 'BW-HST006' or a <> '00000000-0000-0000-0000-0000000000a2' then perform store_mark_admin_read(k,a,m); end if;
   end loop;
   if k <> 'BW-HST007' then perform store_mark_customer_read(k,m); end if;
 end loop;
end $$;
select pg_temp.ok(not store_link_historical_chat('BW-HST006',:a),'another admin unread state blocks linking');
select pg_temp.ok(not store_link_historical_chat('BW-HST007',:a),'customer unread state blocks linking');
-- Historical payment card (original chat, no order_ref) and its receipt.
select (store_save_payment_method(:a,null,'GCash','BudgetWise','09170000035',null,true)).id as method \gset
select store_send_payment_details('BW-HST001',:a,:'method',gen_random_uuid()) as payment \gset
select store_send_payment_details('BW-HST002',:a,:'method',gen_random_uuid()) as old_unpaid \gset
select store_mark_customer_read('BW-HST002',:'old_unpaid');
-- Existing quoted replies retain original chat context.
select store_post_message('BW-HST001','admin',:a,'text','Original quoted reply',null,null,gen_random_uuid(),:'reply');
select gen_random_uuid() as album_client \gset
select 'BW-HST001/' || :u || '/' || :'album_client' || '/' as album_path \gset
insert into storage.objects(bucket_id,name) values ('order-chat-attachments',:'album_path'||'0.png'),('order-chat-attachments',:'album_path'||'0.thumb.png');
select store_post_album('BW-HST001','customer',:u,'Receipt album',null,
 jsonb_build_array(jsonb_build_object('position',0,'path',:'album_path'||'0.png','thumb_path',:'album_path'||'0.thumb.png','mime','image/png','thumb_mime','image/png','size',64,'width',10,'height',10)),:'album_client') -> 'message' ->> 'id' as album \gset
select store_post_message('BW-HST001','customer',:u,'image','Receipt', 'BW-HST001/receipt.png','image/png',gen_random_uuid()) -> 'message' ->> 'id' as receipt \gset
select store_post_message('BW-HST001','admin',:a,'text','Thanks',null,null,gen_random_uuid()) -> 'message' ->> 'id' as lastmsg \gset
select store_mark_customer_read('BW-HST001',:'lastmsg');
select store_mark_admin_read('BW-HST001',:a,:'lastmsg');
select store_mark_admin_read('BW-HST001',user_id,:'lastmsg') from admin_users;
select store_assign_conversation(:'home',:a,:a);
-- Snapshot invariants before ANY linking.
create temp table messages_before_35 as select * from store_order_messages;
create temp table conversations_before_35 as select * from store_order_conversations;
create temp table attachments_before_35 as select * from store_order_message_attachments;
create temp table reads_before_35 as select * from store_conversation_reads;
create temp table orders_before_35 as select * from orders;
select pg_temp.ok(store_link_historical_chat('BW-HST001',:a),'answered/read active history links');
select pg_temp.ok(store_link_historical_chat('BW-HST002',:a),'Done/read history links');
select pg_temp.ok(store_link_historical_chat('BW-HST004',:a),'other customer links only to their own conversation');
select pg_temp.ok(store_link_historical_chat('BW-HST001',:b),'duplicate linking is idempotent');
select pg_temp.ok((select count(*)=3 from store_chat_history_links),'one immutable mapping per source');
select pg_temp.ok(not exists(select * from messages_before_35 except select * from store_order_messages),'original messages including IDs and chat ownership unchanged');
select pg_temp.ok(not exists(select * from conversations_before_35 except select * from store_order_conversations),'assignment, attention, Done and payment metadata unchanged');
select pg_temp.ok(not exists(select * from attachments_before_35 except select * from store_order_message_attachments),'album files and source paths unchanged');
select pg_temp.ok(not exists(select * from reads_before_35 except select * from store_conversation_reads),'linking never advances read cursors');
select pg_temp.ok((select home_key=:'other' from store_chat_history_links where source_key='BW-HST004'),'similar customer names never determine identity');
select pg_temp.ok(not exists(select 1 from store_chat_history_links where home_key=:'emptyhome'),'customer without history remains unchanged');
select pg_temp.ok(exists(select 1 from store_admin_inbox(:a,'all',null,null,null,100,null) where order_number='BW-HST003'),'unresolved row remains visible');
select pg_temp.ok(not exists(select 1 from store_admin_inbox(:a,'all',null,null,null,100,null) where order_number in ('BW-HST001','BW-HST002')),'linked rows leave the inbox without deleting conversations');
select pg_temp.ok(exists(select 1 from store_admin_inbox(:a,'all','BW-HST001',null,null,100,null) where order_number=:'home'),'old order search finds the primary customer row');
select pg_temp.ok(exists(select 1 from store_admin_inbox(:a,'all',null,null,null,100,null,array['11111111-0000-0000-0000-000000000002']::uuid[],false) where order_number=:'home'),'historical-only game finds the primary row with inquiries excluded');
select pg_temp.ok(not has_function_privilege('authenticated','public.store_link_historical_chat(text,uuid)','execute') and not has_table_privilege('authenticated','public.store_chat_history_links','insert'),'browser roles cannot create mappings or invoke linking');
select pg_temp.raises(format('select store_set_conversation_state(%L,%L,%L,null)','BW-HST002',:a,'active'),'BW030','old admin tab cannot reopen hidden work');
select pg_temp.ok(not exists(select 1 from store_customer_conversations(:u) where order_number in ('BW-HST001','BW-HST002')),'customer navigation hides only linked rows');
select pg_temp.ok(exists(select 1 from store_chat_messages_page(:'home',null,null,200) where id=:'receipt'),'receipt retains identity in unified history');
select pg_temp.ok(not exists(select 1 from store_chat_messages_page(:'other',null,null,200) where id=:'receipt'),'no cross-customer history access');
select pg_temp.raises(format('select * from store_chat_messages_page(%L,%L,null,20)',:'other',:'receipt'),'P0002','foreign history cursor cannot cross access');
select pg_temp.raises(format('select store_post_message(%L,%L,%L,%L,%L,null,null,gen_random_uuid())','BW-HST001','customer',:u,'text','old tab'),'BW030','linked original thread rejects new messages');
select pg_temp.raises(format('select store_post_message(%L,%L,%L,%L,%L,null,null,gen_random_uuid(),%L)',:'home','customer',:u,'text','cross reply',:'reply'),'P0002','cross-chat reply boundary remains intact');
select pg_temp.raises(format('select store_set_reaction(%L,%L,%L,%L,%L)','BW-HST001',:'reply',:v,'customer','love'),'42501','reaction uses original ownership');
truncate realtime.messages;
select store_set_reaction('BW-HST001',:'reply',:u,'customer','love');
select pg_temp.ok(exists(select 1 from realtime.messages where event='reaction' and topic='admin:inbox' and payload->>'order_number'=:'home'),'reaction relays to primary inbox without subscribing to old chats');
select pg_temp.ok(not exists(select 1 from store_payment_confirmations where message_id=:'payment'),'receipt did not confirm payment');
select store_confirm_payment('BW-HST001',:'payment',:a);
select pg_temp.ok((select order_number='BW-HST001' and order_ref is null and amount=150 from store_payment_confirmations where message_id=:'payment'),'legacy confirmation retains original order and amount');
select pg_temp.ok(exists(select 1 from realtime.messages where event='history_payment' and payload->>'message_id'=:'payment'),'payment updates relay to unified interface');
-- New card for the SAME historical order is tagged at home; other orders/quotes stay independent.
select store_send_payment_details('BW-HST001',:a,:'method',gen_random_uuid()) as newpayment \gset
select pg_temp.ok((select order_number=:'home' and order_ref='BW-HST001' from store_order_messages where id=:'newpayment'),'new order payment card goes to current conversation, tagged with real order');
select store_confirm_payment(:'home',:'newpayment',:a);
select pg_temp.ok(not exists(select 1 from realtime.messages where event='conversation' and payload->>'order_number'=:'home' and payload->>'payment_received_message_id' is not null),'realtime cannot restore an unsafe aggregate Paid badge');
select pg_temp.ok((select order_ref='BW-HST001' and amount=150 from store_payment_confirmations where message_id=:'newpayment'),'new confirmation cannot become an inquiry quote');
select store_send_payment_details('BW-HST002',:a,:'method',gen_random_uuid()) as unpaid \gset
select pg_temp.raises(format('select store_confirm_payment(%L,%L,%L)','BW-HST002',:'old_unpaid',:a),'BW020','new home card supersedes an unconfirmed historical card of the same order');
select pg_temp.ok((select reply_to_message_id=:'reply' from store_chat_messages_page(:'home',null,null,200) where body='Original quoted reply'),'original historical reply reference survives linking');
select pg_temp.ok(exists(select 1 from store_chat_messages_page(:'home',null,null,200) where id=:'album' and kind='album'),'historical album is included with its original identity');
select pg_temp.ok((select state='received' from store_order_payment_states(:'home',array['BW-HST001'])) and (select state='sent' from store_order_payment_states(:'home',array['BW-HST002'])),'batched order state distinguishes paid and unpaid historical subjects');
select pg_temp.ok(not exists(select 1 from store_order_payment_states(:'other',array['BW-HST001'])),'payment state lookup rejects orders outside this conversation');
select pg_temp.ok((select payment_received_message_id is null from store_admin_inbox(:a,'all',null,null,null,100,:'home')),'aggregate Paid is suppressed when historical subjects are present');
-- Stable ordering with identical timestamps across historical sources.
-- Times changed ONLY in disposable fixture, never by migration.
update store_order_messages set created_at='2020-01-01T00:00:00Z' where order_number in ('BW-HST001','BW-HST002');
create temp table page35 as select * from store_chat_messages_page(:'home',null,null,3);
select id as oldest from page35 order by created_at,id limit 1 \gset
create temp table older35 as select * from store_chat_messages_page(:'home',:'oldest',null,3);
select pg_temp.ok(not exists(select id from page35 intersect select id from older35),'equal-time pagination has no duplicate IDs');
select pg_temp.ok((select count(*)=3 from older35),'equal-time cursor does not skip a page');
do $$ declare v_home text; v_cursor uuid; v_ids uuid[] := '{}'; v_page uuid[]; v_id uuid; v_expected integer; begin
 select home_key into v_home from store_chat_history_links where source_key='BW-HST001';
 loop
   select array_agg(id order by created_at,id) into v_page from store_chat_messages_page(v_home,v_cursor,null,2);
   exit when v_page is null;
   foreach v_id in array v_page loop
     if v_id=any(v_ids) then raise exception 'FAIL: duplicated paginated message'; end if;
     v_ids:=array_append(v_ids,v_id);
   end loop;
   v_cursor:=v_page[1];
 end loop;
 select count(*) into v_expected from store_order_messages where order_number=v_home or order_number in (select source_key from store_chat_active_history where home_key=v_home);
 if cardinality(v_ids) <> v_expected then raise exception 'FAIL: missing messages across equal-time pages'; end if;
 raise notice 'ok - complete two-message pages have no gaps or duplicates across identical timestamps';
end $$;
select pg_temp.ok(not exists(select * from orders_before_35 except select * from orders),'XOB statuses and order records untouched');
update store_chat_settings set historical_chat_enabled=false where id;
select pg_temp.ok(not exists(select 1 from store_chat_active_history),'recovery flag disables unified history without deleting mappings');
select pg_temp.ok(exists(select 1 from store_admin_inbox(:a,'all',null,null,null,100,'BW-HST001')),'recovery restores original inbox rows');
select pg_temp.raises(format('select store_post_message(%L,%L,%L,%L,%L,null,null,gen_random_uuid())','BW-HST001','customer',:u,'text','still readonly'),'BW030','recovery keeps historical sources read-only');
update store_chat_settings set historical_chat_enabled=true where id;
select pg_temp.ok((select count(*)=3 from store_chat_active_history),'re-enabling recovers mappings without data loss');
\echo 'ALL HISTORICAL CHAT TESTS PASSED'
