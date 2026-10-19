// Browser presentation contract against a LOCAL Next server with mocked chat APIs.
// SQL ownership/concurrency/payment rules are tested separately by test-db.mjs.
// No Supabase stack, production credentials, or Docker required.
// E2E_BASE_URL=http://127.0.0.1:3100 E2E_CHROMIUM=/usr/bin/chromium node --test scripts/e2e/historical-chat-ui.e2e.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
const BASE=process.env.E2E_BASE_URL??'http://127.0.0.1:3100';
if (!['localhost','127.0.0.1'].includes(new URL(BASE).hostname)) throw new Error('Local server only');
const home='GI-1234ABCD';
const source='BW-HST001';
const id='35000000-0000-4000-8000-000000000001';
const old={id,orderNumber:source,historyOrderNumber:source,senderRole:'admin',kind:'text',body:'Your historical order is ready.',hasAttachment:false,createdAt:'2020-01-01T00:00:00.000001Z',clientMessageId:null,payment:null,paymentReceived:null,album:null,reactions:null,replyTo:null,orderRef:null,order:null,product:null,vouch:null,senderName:'BudgetWise'};
const latest={...old,id:'35000000-0000-4000-8000-000000000002',orderNumber:home,historyOrderNumber:null,createdAt:'2026-01-01T00:00:00Z',body:'Your current BudgetWise conversation.'};
for (const viewport of [{width:390,height:844},{width:430,height:932},{width:1440,height:900}]) {
 test(`old order links open a bounded historical window (${viewport.width}px)`,{timeout:90000},async()=>{
  const browser=await chromium.launch({executablePath:process.env.E2E_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox']});
  try {
   const context=await browser.newContext({viewport,reducedMotion:'reduce'});
   const page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const requests=[];
   await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());requests.push(url.pathname+url.search);
    let body={};
    if(url.pathname.endsWith('/summary')) body=url.pathname.includes(source)?{movedTo:home}:{summary:{kind:'inquiry',orderNumber:home,conversationId:null,totalAmount:0,createdAt:'2026-01-01T00:00:00Z',buyerName:'Customer',robloxUsername:'',status:'',state:'active',paymentSent:false,itemCount:0,summary:'Conversation',lines:[]},adminRead:{at:null,messageId:null},ownRead:{at:null,messageId:null},slots:[],orders:[],orderTotal:0};
    else if(url.pathname.endsWith('/history-focus')) body={messageId:id,messages:[old],hasOlder:false};
    else if(url.pathname.endsWith('/messages')) body={messages:url.searchParams.has('after')?[]:[latest],hasOlder:true};
    else if(url.pathname.endsWith('/read')) body={cursor:{}};
    else if(url.pathname==='/api/account/conversations') body={userId:'35000000-0000-4000-8000-000000000099',conversations:[]};
    else if(url.pathname==='/api/account/orders') body={rows:[],nextCursor:null};
    else if(url.pathname.endsWith('/reactions')) body={messageId:id,reactions:{counts:{love:1},mine:'love'}};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   await page.goto(`${BASE}/orders/${source}`,{waitUntil:'domcontentloaded'});
   await page.getByText('Your historical order is ready.',{exact:true}).waitFor();
   assert.ok(page.url().includes(home),'old order redirects to unified chat');
   await page.getByText(`Order ${source} conversation`,{exact:true}).waitFor();
   assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).count(),0,'focused historical window cannot accidentally post into old chat');
   assert.equal(await page.locator(`[data-message-id="${id}"]`).count(),1,'historical message is not duplicated');
   assert.ok(requests.filter(url=>url.includes('/history-focus')).length<=2,'deep link uses bounded requests rather than draining pages');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'no horizontal overflow');
   await page.getByRole('button',{name:'Return to latest to reply'}).click();
   await page.getByText('Your current BudgetWise conversation.',{exact:true}).waitFor();
   await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();
   assert.equal(await page.getByText('Your historical order is ready.',{exact:true}).count(),0,'latest window replaces the history window without a hidden gap');
   assert.deepEqual(errors,[],'no browser runtime errors');
   await context.close();
  } finally {await browser.close();}
 });
}
