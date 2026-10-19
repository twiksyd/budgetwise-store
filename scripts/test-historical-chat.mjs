import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toChatMessage } from '../src/lib/chat/dto.mjs';
import { buildDisplayItems, findFirstUnreadIndex, initialThread, mergeMessages, threadReducer } from '../src/lib/chat/thread-state.mjs';
import { confirmablePaymentIds } from '../src/lib/chat/payment-received.mjs';
import { createConversationCache } from '../src/lib/chat/conversation-cache.mjs';
import { createConversationLoader } from '../src/lib/chat/conversation-loader.mjs';
const home = 'GI-1234ABCD';
const legacy = 'BW-HIST01';
const raw = { id: 'a', order_number: legacy, sender_role:'admin',sender_user_id:'secret-admin',kind:'text',body:'Historical',created_at:'2020-01-01T00:00:00.000001Z' };
const viewer = {viewer:'customer',viewerUserId:'customer',conversationKey:home};
const dto = (patch={}) => toChatMessage({...raw,...patch},viewer);

test('unified history retains original identity and customer privacy',()=>{
 const message = dto({attachment_path:'private/original/path.png'});
 assert.equal(message.orderNumber,legacy);
 assert.equal(message.historyOrderNumber,legacy);
 assert.equal(message.hasAttachment,true);
 assert.equal(message.senderUserId,undefined);
 assert.equal(message.attachment_path,undefined);
});
test('existing same-source quoted reply survives a mixed-source page; foreign quote is rejected',()=>{
 const base = {...raw,id:'reply',reply_to_message_id:'original'};
 const same = toChatMessage(base,{...viewer,replyTargets:new Map([['original',{...raw,id:'original'}]])});
 assert.equal(same.replyTo.id,'original');
 const foreign = toChatMessage(base,{...viewer,replyTargets:new Map([['original',{...raw,id:'original',order_number:'BW-OTHER1'}]])});
 assert.equal(foreign.replyTo,null);
});
test('historical payment cards keep their real order subject, never the inquiry quote subject',()=>{
 const a=dto({kind:'payment',payload:{provider:'gcash',amount:150}});
 const b=toChatMessage({...raw,id:'b',order_number:'BW-HIST02',kind:'payment',payload:{provider:'gcash',amount:300}},{...viewer,viewer:'admin'});
 const quote=toChatMessage({...raw,id:'q',order_number:home,kind:'payment',payload:{provider:'gcash',amount:500}},{...viewer,viewer:'admin'});
 assert.equal(a.orderRef,null,'stored order_ref stays unchanged');
 assert.equal(a.payment.orderNumber,legacy);
 assert.deepEqual([...confirmablePaymentIds([a,b,quote])],['a','b','q']);
 assert.equal(a.paymentReceived,null,'no invented confirmation');
});
test('albums retain opaque attachment identity and hide storage paths',()=>{
 const message=toChatMessage({...raw,kind:'album'},{...viewer,attachments:new Map([['a',[{id:'media',message_id:'a',position:0,storage_path:'old/private.png',thumb_path:'old/thumb.png'}]]])});
 assert.deepEqual(message.album.items,[{id:'media',width:null,height:null}]);
});
test('source boundaries break bubble groups even for identical sender and timestamp',()=>{
 const a=dto();const b={...a,id:'b',orderNumber:'BW-HIST02',historyOrderNumber:'BW-HIST02'};
 const items=buildDisplayItems([a,b],{nowMs:Date.now()}).filter(i=>i.type==='message');
 assert.ok(items.every(i=>i.firstInGroup && i.lastInGroup));
});
test('equal timestamps and microsecond differences merge without duplicate IDs',()=>{
 const a=dto();const b={...a,id:'b'};const c={...a,id:'c',createdAt:'2020-01-01T00:00:00.000002Z'};
 assert.deepEqual(mergeMessages([b,c],[a,b]).map(m=>m.id),['a','b','c']);
});
test('historical read state never borrows the primary conversation cursor',()=>{
 assert.equal(findFirstUnreadIndex([dto()],null,()=>false),-1);
});
test('focused history is bounded and cannot create a hidden gap during realtime refresh',async()=>{
 const cache=createConversationCache();cache.touch(home);
 cache.dispatch(home,{type:'history_window',messages:[dto()],hasOlder:true,historyWindow:true});
 let calls=0;
 const loader=createConversationLoader({cache,fetchJson:async()=>{calls++;return {messages:[],hasOlder:false};}});
 await loader.fetchNewer(home);
 assert.equal(calls,0,'old window never drains all messages up to today');
 assert.equal(cache.getThread(home).messages[0].id,'a');
 const latest=threadReducer(cache.getThread(home),{type:'history_window',messages:[{...dto(),id:'latest',orderNumber:home,historyOrderNumber:null}],hasOlder:true,historyWindow:false});
 assert.deepEqual(latest.messages.map(m=>m.id),['latest']);
 assert.equal(initialThread.messages.length,0);
});
test('an older page already in flight cannot append a gap after opening a historical window',async()=>{
 const cache=createConversationCache();cache.touch(home);
 cache.dispatch(home,{type:'loaded',messages:[{...dto(),id:'latest',historyOrderNumber:null}],hasOlder:true});
 let resolve;
 const pending=new Promise(r=>{resolve=r;});
 const loader=createConversationLoader({cache,fetchJson:()=>pending});
 const older=loader.loadOlder(home);
 cache.dispatch(home,{type:'history_window',messages:[dto()],hasOlder:true,historyWindow:true});
 resolve({messages:[{...dto(),id:'unrelated-page'}],hasOlder:false});
 await older;
 assert.deepEqual(cache.getThread(home).messages.map(m=>m.id),['a']);
 assert.equal(cache.getThread(home).hasOlder,true);
});

// A primary read cursor must never acknowledge separate historical sources.
const {createInboxState,inboxReducer,visibleRows,matchesView}=await import('../src/lib/chat/inbox-state.mjs');
const historyInboxRow={orderNumber:home,conversationId:'conv',buyerName:'Customer',buyerRobloxUsername:'customer',lastMessageId:'primary',lastMessageAt:'2026-01-01T00:00:00Z',lastMessageKind:'text',lastSenderRole:'customer',gameIds:[],gameNames:[],viewedBy:[],unreadCount:7,historyUnreadCount:5,state:'active'};
test('reading the primary conversation preserves five historical unread messages',()=>{
 const state=createInboxState({me:'admin',rows:[historyInboxRow]});
 const next=inboxReducer(state,{type:'mark_read',orderNumber:home,at:'2026-01-01T00:00:00Z',messageId:'primary'});
 assert.equal(next.rows[home].unreadCount,5);
 assert.equal(next.rows[home].historyUnreadCount,5);
});
test('another tab advancing the primary read cursor preserves historical unread',()=>{
 const state=createInboxState({me:'admin',rows:[historyInboxRow]});
 const next=inboxReducer(state,{type:'read_event',event:{order_number:home,admin_user_id:'admin',last_read_at:'2026-01-02T00:00:00Z',last_read_message_id:'primary'},activeOrderNumber:null});
 assert.equal(next.rows[home].unreadCount,5);
});
test('Done homes with unread history remain discoverable through the Unread filter',()=>{
 const done={...historyInboxRow,state:'done'};
 const unread=createInboxState({me:'admin',rows:[done],view:{filter:'unread'}});
 assert.equal(visibleRows(unread).length,1);
 const active=createInboxState({me:'admin',rows:[done],view:{filter:'active'}});
 assert.equal(matchesView(done, active.view, 'admin'),false,'Done status is not silently changed');
 const ordinary=createInboxState({me:'admin',rows:[{...done,historyUnreadCount:0}],view:{filter:'unread'}});
 assert.equal(matchesView(ordinary.rows[home], ordinary.view, 'admin'),false,'existing Done queue behavior is unchanged');
});
test('an authoritative historical read refresh changes totals without touching primary cursors',()=>{
 const state=createInboxState({me:'admin',rows:[historyInboxRow]});
 const next=inboxReducer(state,{type:'upsert_row',row:{...historyInboxRow,historyUnreadCount:3,unreadCount:5}});
 assert.equal(next.rows[home].unreadCount,5);
 assert.equal(next.rows[home].myReadAt,undefined);
});
