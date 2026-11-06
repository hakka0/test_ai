const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {decode}=require('@colyseus/schema'),{unpack}=require('@colyseus/msgpackr');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots=`docs/screenshots/reserve-sale-${version}`,url='http://127.0.0.1:2697';
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2697',DEBUG_GAME:'0',NODE_ENV:'production'},stdio:'pipe'});fs.mkdirSync(shots,{recursive:true});
function snapshot(raw){if(typeof raw==='string')return;const b=Buffer.from(raw);if(b[0]!==13)return;const it={offset:1},type=decode.stringCheck(b,it)?decode.string(b,it):decode.number(b,it);if(type==='snapshot')return unpack(b,{start:it.offset});}
(async()=>{let browser;try{
 for(let i=0;i<90;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const {unitSellPrice}=await import('../shared/shop.ts');browser=await chromium.launch(browserOptions());const results=[],errors=[];
 for(const mode of ['pc','mobile']){
  const ctx=await browser.newContext({viewport:mode==='pc'?{width:1400,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36'});
  let last;await ctx.routeWebSocket('**/*',ws=>{const peer=ws.connectToServer();ws.onMessage(raw=>peer.send(raw));peer.onMessage(raw=>{const s=snapshot(raw);if(s)last=s;ws.send(raw);});});
  await ctx.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url,protocols){if(protocols&&typeof protocols==='object'&&!Array.isArray(protocols))throw new TypeError('Invalid browser protocols');super(url,protocols);}};});
  const p=await ctx.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));const own=()=>last.players.find(v=>v.visibility==='self');
  const press=async target=>{const e=typeof target==='string'?p.locator(target):target;await e.scrollIntoViewIfNeeded();await(mode==='mobile'?e.tap():e.click());};
  const fresh=async fn=>{for(let i=0;i<200&&!fn();i++)await p.waitForTimeout(30);assert.ok(fn(),'authoritative state update');};
  async function closeUnit(){if(await p.locator('#unit-dialog').evaluate(e=>e.open))await press('#close-unit-dialog');}
  async function selectReserve(u){await press(`[data-bench-slot="${u.benchSlot}"]`);if(mode==='mobile')await p.locator('#unit-dialog').waitFor({state:'visible'});}
  await p.goto(url);await press('#pvp-practice');await fresh(()=>last?.debug);await debugClick(p,'debug-pause');await fresh(()=>last.debug.paused);const room=last.roomId,bot=last.players.find(v=>v.bot).id;
  const frames=mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]];
  for(const [width,height] of frames){
   console.log('CHECK combat reserve sale',mode,width,height);await p.setViewportSize({width,height});await p.waitForTimeout(150);assert.equal(last.roomId,room);assert.equal(await p.locator('html').getAttribute('data-screen-mode'),mode);
   if(await p.locator('#scout-return').isVisible()){assert.equal(await p.locator(`[data-player-id="${bot}"]`).getAttribute('aria-pressed'),'true');await press('#scout-return');}
   const generation=last.debug.generation;await debugPreset(p,'synergyBulwark');await fresh(()=>last.debug.generation>generation&&last.phase==='prepare');
   await p.locator('#deployment-overlay').waitFor({state:'visible'});await press('#ready');await fresh(()=>last.phase==='matching');await debugClick(p,'debug-next');await fresh(()=>last.phase==='combat');await p.locator('#deployment-overlay').waitFor({state:'hidden'});
   const field=own().units.find(u=>u.x>=0),frozen=structuredClone(last.fighters);await press(`#cells [data-board-unit="${field.id}"]`);
   const fieldSell=p.locator(mode==='pc'?'#selected-unit-content [data-quick-sell]':'#unit-title-sell');await fieldSell.waitFor({state:'visible'});assert.equal(await fieldSell.isDisabled(),true);await closeUnit();
   // Start with a field unit selected; permission must follow the dragged reserve ID.
   const reserve=own().units.find(u=>u.x<0),gold=own().gold;const source=p.locator(`[data-bench-slot="${reserve.benchSlot}"]`);await source.scrollIntoViewIfNeeded();
   const a=await source.boundingBox(),b=await p.locator('#pc-dock-reserve').boundingBox();assert.ok(a&&b);const from={x:a.x+a.width/2,y:a.y+a.height/2},to={x:b.x+b.width/2,y:b.y+b.height/2};
   let cdp;if(mode==='mobile'){cdp=await ctx.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...to,id:1}]});}
   else{await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(to.x,to.y,{steps:10});}
   await p.locator('#shop-sell-overlay').waitFor({state:'visible'});assert.match(await p.locator('#shop-sell-overlay').textContent(),/판매/);await p.screenshot({path:`${shots}/${mode}-${width}-${height}-drag-sale.png`});
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else await p.mouse.up();
   await fresh(()=>!own().units.some(u=>u.id===reserve.id));assert.equal(own().gold,gold+unitSellPrice(reserve));assert.deepEqual(last.fighters,frozen);await p.locator('#shop-sell-overlay').waitFor({state:'hidden'});
   const next=own().units.find(u=>u.x<0),nextGold=own().gold;await selectReserve(next);const quick=p.locator(mode==='pc'?'#selected-unit-content [data-quick-sell]':'#unit-title-sell');assert.equal(await quick.isEnabled(),true);await press(quick);
   await fresh(()=>!own().units.some(u=>u.id===next.id));assert.equal(own().gold,nextGold+unitSellPrice(next));assert.deepEqual(last.fighters,frozen);await closeUnit();
   // Newly purchased combat reserves also use the existing two-step sale control.
   if(width===1400||width===390){
    const beforeIds=new Set(own().units.map(u=>u.id)),offer=own().shop.find(o=>!o.sold),beforeGold=own().gold;await require('./ui-helpers.cjs').buyOffer(p,p.locator(`[data-offer="${offer.id}"]`));await fresh(()=>own().units.some(u=>!beforeIds.has(u.id)));
    const bought=own().units.find(u=>!beforeIds.has(u.id));assert.equal(bought.x,-1);await selectReserve(bought);if(mode==='pc')await press('#selected-unit-content .selection img');
    assert.equal(await p.locator('#sell-unit').isEnabled(),true);await press('#sell-unit');assert.match(await p.locator('#sell-unit').textContent(),/판매 확인/);await press('#sell-unit');await fresh(()=>!own().units.some(u=>u.id===bought.id));assert.equal(own().gold,beforeGold-offer.cost+unitSellPrice(bought));assert.deepEqual(last.fighters,frozen);await closeUnit();
   }
   await press(`[data-player-id="${bot}"]`);await p.locator('#deployment-overlay').waitFor({state:'hidden'});
   const opponent=last.players.find(v=>v.id===bot),otherReserve=opponent.bench[0];await selectReserve(otherReserve);
   if(mode==='mobile')assert.equal(await p.locator('#unit-title-sell').isVisible(),false);else assert.equal(await p.locator('#selected-unit-content [data-quick-sell]').count(),0);await closeUnit();
   const g=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return{overflow:document.documentElement.scrollWidth>innerWidth,board:r('board-wrap'),bench:r('bench'),shop:r('pc-play-dock'),rank:r('player-ranking'),targets:[...document.querySelectorAll('.ranking-row,#shop-offers [data-offer]')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().toJSON())};});
   assert.equal(g.overflow,false);assert.ok(g.targets.every(v=>v.width>=44&&v.height>=44));const overlap=(a,b)=>a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1;for(const [a,b] of [['board','bench'],['board','shop'],['board','rank'],['bench','shop'],['bench','rank'],['shop','rank']])assert.equal(overlap(g[a],g[b]),false,`${a}/${b}`);
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-combat.png`});await debugClick(p,'debug-next');await fresh(()=>last.phase==='result');await p.locator('#deployment-overlay').waitFor({state:'visible'});
   results.push({mode,width,height,fieldSaleDisabled:true,reserveDragAndQuickSale:true,frozenFighters:true,newReserveConfirmationSale:width===1400||width===390,opponentReadOnly:true,combatCapacityHidden:true,resultCapacityRestored:true,geometry:g});
  }
  await p.reload();await p.locator('#game-view').waitFor({state:'visible'});assert.equal(last.roomId,room);await p.locator('#deployment-overlay').waitFor({state:'visible'});await press('#leave');await p.locator('#lobby').waitFor({state:'visible'});await ctx.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,errors,source:'Actual one-human/five-bot room snapshots; combat clock paused, no snapshot alterations.'},null,2));console.log('PASS combat reserves: nine layouts/rotation, drag/quick/confirmation sale, field and opponent protection, frozen fighters, capacity hidden only during combat, reload');
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
