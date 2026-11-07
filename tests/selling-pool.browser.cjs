const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {decode}=require('@colyseus/schema'),{unpack}=require('@colyseus/msgpackr');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots=`docs/screenshots/selling-pool-${version}`,url='http://127.0.0.1:2674';
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2674',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
fs.mkdirSync(shots,{recursive:true});
function snapshot(raw){if(typeof raw==='string')return;const bytes=Buffer.from(raw);if(bytes[0]!==13)return;const it={offset:1},type=decode.stringCheck(bytes,it)?decode.string(bytes,it):decode.number(bytes,it);if(type==='snapshot')return unpack(bytes,{start:it.offset});}
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const errors=[],results=[],extra=[];
 for(const mode of ['pc','mobile']){
  console.log('CHECK selling',mode);
  const ctx=await browser.newContext({viewport:mode==='pc'?{width:1400,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  let last;await ctx.routeWebSocket('**/*',ws=>{const peer=ws.connectToServer();ws.onMessage(raw=>peer.send(raw));peer.onMessage(raw=>{const s=snapshot(raw);if(s)last=s;ws.send(raw);});});
  await ctx.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url,protocols){if(protocols&&typeof protocols==='object'&&!Array.isArray(protocols))throw new TypeError('Browser WebSocket protocols must be a string or array');super(url,protocols);}};});
  await ctx.addInitScript(()=>document.addEventListener('pointermove',e=>{window.__salePointer={x:e.clientX,y:e.clientY};},true));
  const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  const self=()=>last.players.find(p=>p.visibility==='self'),press=async el=>{if(typeof el==='string')el=p.locator(el);return mode==='mobile'?el.tap():el.click();};
  async function waitState(condition){for(let i=0;i<100&&!condition();i++)await p.waitForTimeout(30);assert.ok(condition(),'server state updated');}
  async function loadPreset(name){const generation=last.debug.generation;await debugPreset(p,name);await waitState(()=>last.debug.generation>generation);await p.locator(`#cells [data-board-unit="${self().units.find(u=>u.x>=0).id}"]`).waitFor({state:'visible'});}
  async function closeUnit(){if(await p.locator('#unit-dialog').evaluate(e=>e.open))await press('#close-unit-dialog');}
  async function shown(el){await el.evaluate(e=>e.scrollIntoView({block:'center'}));await p.waitForTimeout(40);}
  async function drag(source,{cancel=false,shot}={}){
   await closeUnit();await p.locator(source).scrollIntoViewIfNeeded();const a=await p.locator(source).boundingBox(),b=await p.locator('#pc-dock-reserve').boundingBox();assert.ok(a&&b);
   const sx=a.x+a.width/2,sy=a.y+a.height/2,x=b.x+b.width/2,y=b.y+b.height/2;
   let cdp;if(mode==='mobile'){cdp=await ctx.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy,id:1}]});}
   else{await p.mouse.move(sx,sy);await p.mouse.down();}
   const path=[],before=structuredClone(self());
   // Cross the boundary both ways while holding the same unit. Its image must
   // move exactly as far as the pointer, including after the sale hint appears.
   for(const [step,px,py,inside] of [['outside',b.x-4,y,false],['enter',b.x+4,y,true],['center',x,y,true],['leave',b.x-4,y,false],['reenter',x,y,true]]){
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:px,y:py,id:1}]});else await p.mouse.move(px,py);
    await p.waitForFunction(({x,y})=>Math.abs(window.__salePointer?.x-x)<1&&Math.abs(window.__salePointer?.y-y)<1,{x:px,y:py});
    await p.locator('#shop-sell-overlay').waitFor({state:inside?'visible':'hidden'});
    const point=await p.locator('.unit-drag-ghost img').evaluate((e,{px,py})=>{const r=e.getBoundingClientRect();return{x:r.x-px,y:r.y-py,width:r.width,height:r.height,opacity:Number(getComputedStyle(e).opacity)};},{px,py});
    path.push({step,...point});
    assert.ok(Math.abs(point.x-path[0].x)<1&&Math.abs(point.y-path[0].y)<1,`drag image jumped: ${JSON.stringify(path)}`);
    assert.equal(point.width,path[0].width);assert.equal(point.height,path[0].height);
   }
   assert.ok(path[1].opacity>0&&path[1].opacity<path[0].opacity,'the sale hint stays readable without moving the image');assert.equal(path[3].opacity,path[0].opacity,'leaving the shop restores the image');
   await p.waitForTimeout(80);assert.deepEqual(self().units,before.units,'hovering must not sell or move the unit');assert.equal(self().gold,before.gold);
   const held=await p.locator('.unit-drag-ghost img').boundingBox();assert.ok(Math.abs(held.x-x-path[0].x)<1&&Math.abs(held.y-y-path[0].y)<1,'holding the pointer must keep the image still');
   await p.locator('#shop-sell-overlay').waitFor({state:'visible'});const overlay=await p.locator('#shop-sell-overlay').evaluate(e=>({text:e.textContent,color:getComputedStyle(e).backgroundColor,rect:e.getBoundingClientRect().toJSON(),label:e.querySelector('strong').getBoundingClientRect().toJSON(),ghost:document.querySelector('.unit-drag-ghost').getBoundingClientRect().toJSON()}));
   assert.match(overlay.text,/판매/);assert.match(overlay.color,/139, 32, 32/);
   assert.ok(Math.abs(overlay.label.x+overlay.label.width/2-overlay.rect.x-overlay.rect.width/2)<1);assert.ok(Math.abs(overlay.label.y+overlay.label.height/2-overlay.rect.y-overlay.rect.height/2)<1);
   overlay.path=path;
   if(shot)await p.screenshot({path:`${shots}/${shot}.png`});
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await cdp.detach();}
   else if(cancel){await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await p.mouse.up();}else await p.mouse.up();
   await p.locator('#shop-sell-overlay').waitFor({state:'hidden'});return overlay;
  }
  await p.goto(url);await press('#practice');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));await debugClick(p,'debug-pause');
  const room=await p.locator('#room-code').textContent(),frames=mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]];
  for(const [width,height] of frames){
   console.log('CHECK preparation sale',mode,width,height);await closeUnit();await p.setViewportSize({width,height});await p.waitForTimeout(140);await loadPreset('early');
   if(!await p.locator('[data-equipment-item]').first().isVisible())await press('#equipment-toggle');
   await press(p.locator('[data-equipment-item]').first());await p.locator('#craft-dialog').waitFor({state:'visible'});await press('#item-equip');
   assert.equal(await p.locator('#equipment-selection').textContent(),'');assert.equal(await p.locator('#equipment-selection').isVisible(),false);assert.equal(await p.locator('#equipment-cancel').isVisible(),true);await press('#equipment-cancel');
   if(mode==='mobile')await press('#equipment-close');
   const hifumi=self().units.find(u=>u.kind==='hifumi');await press(`[data-bench-slot="${hifumi.benchSlot}"]`);
   if(mode==='pc'){
    const info=p.locator('#selected-unit-content'),image=await info.locator('.selection img').boundingBox(),sell=await info.locator('.unit-quick-sell').boundingBox();assert.equal(image.width,sell.width);assert.equal(image.height,sell.height);await press(info.locator('.selection img'));
   }
   await p.locator('#unit-dialog').waitFor({state:'visible'});
   const profile=await p.locator('#unit-detail .selection img').boundingBox(),button=await p.locator('#unit-title-sell').boundingBox();assert.equal(profile.width,button.width);assert.equal(profile.height,button.height);assert.ok(button.width>=44&&button.height>=44);
   const colors=await p.locator('#unit-detail .unit-meta').evaluate(e=>({upgrade:getComputedStyle(e.querySelector('.unit-upgrade')).color,rarity:getComputedStyle(e.querySelector('.unit-rarity')).color,text:e.textContent}));assert.equal(colors.upgrade,'rgb(121, 186, 255)');assert.equal(colors.rarity,'rgb(255, 216, 74)');assert.match(colors.text,/★3/);assert.doesNotMatch(colors.text,/◆/);
   const summary=p.locator('#dialog-equipment-panel > summary');await shown(summary);const summaryBox=await summary.boundingBox();await summary[mode==='mobile'?'tap':'click']({position:{x:30,y:summaryBox.height/2}});assert.equal(await p.locator('#dialog-equipment-panel').evaluate(e=>e.open),true,'equipment section opens');const equip=p.locator('#dialog-inventory [data-mode="equip"]').first();await shown(equip);await press(equip);await waitState(()=>self().inventory.some(i=>i.unitId===hifumi.id));
   const gold=self().gold;await p.screenshot({path:`${shots}/${mode}-${width}-${height}-details.png`});await press('#unit-title-sell');await waitState(()=>!self().units.some(u=>u.id===hifumi.id));assert.equal(self().gold,gold+3);assert.equal(self().inventory.some(i=>i.unitId===hifumi.id),false);await p.locator('#unit-dialog').waitFor({state:'hidden'});
   const shiroko=self().units.find(u=>u.kind==='shiroko'),before=self().gold;
   await drag(`[data-bench-slot="${shiroko.benchSlot}"]`,{cancel:true});await p.waitForTimeout(80);assert.ok(self().units.some(u=>u.id===shiroko.id));assert.equal(self().gold,before);
   const overlay=await drag(`[data-bench-slot="${shiroko.benchSlot}"]`,{shot:`${mode}-${width}-${height}-sell-hover`});await waitState(()=>!self().units.some(u=>u.id===shiroko.id));assert.equal(self().gold,before+2);
   const yuuka=self().units.find(u=>u.kind==='yuuka'),prior=self().gold;await drag(`#cells [data-board-unit="${yuuka.id}"]`);await waitState(()=>!self().units.some(u=>u.id===yuuka.id));assert.equal(self().gold,prior+1);assert.equal(self().units.length,0);
   const geometry=await p.evaluate(()=>{const box=id=>document.getElementById(id).getBoundingClientRect().toJSON();return {overflow:document.documentElement.scrollWidth>innerWidth,board:box('board-wrap'),shop:box('pc-play-dock'),bench:box('bench'),rank:box('player-ranking'),targets:[...document.querySelectorAll('.ranking-row,#shop-offers [data-offer]')].map(e=>e.getBoundingClientRect().toJSON()),blueStars:[...document.querySelectorAll('.pc-bench-rank')].map(e=>getComputedStyle(e).color)};});
   assert.equal(geometry.overflow,false);assert.ok(geometry.rank.x>=geometry.board.right-1&&geometry.rank.right<=width+1);assert.ok(geometry.targets.every(t=>t.width>=44&&t.height>=44));assert.equal(await p.locator('#room-code').textContent(),room);assert.equal(await p.locator('body').evaluate(e=>e.classList.contains('dragging-unit')),false);
   results.push({mode,width,height,profile,button,colors,overlay,geometry});
  }
  await loadPreset('late');const maxKinds=self().units.filter(u=>u.rank===3).map(u=>u.kind);assert.ok(maxKinds.length>0);assert.ok(self().shop.every(o=>o.sold||!maxKinds.includes(o.kind)),'debug roster and real offers follow own three-star exclusion');
  const max=self().units.find(u=>u.rank===3),gold=self().gold;await press(`#cells [data-board-unit="${max.id}"]`);if(mode==='pc')await press('#selected-unit-content .selection img');await press('#unit-title-sell');await waitState(()=>!self().units.some(u=>u.id===max.id));assert.equal(self().gold,gold+9);
  const other=last.players.find(p=>p.visibility==='opponent').id;await press(`[data-player-id="${other}"]`);await press(p.locator(`#cells [data-board-owner="${other}"]`).first());if(mode==='pc')await press('#selected-unit-content .selection img');assert.equal(await p.locator('#unit-title-sell').isVisible(),false);await closeUnit();await press('#scout-return');
  for(const [width,height] of frames){
   console.log('CHECK combat sale',mode,width,height);await closeUnit();await p.setViewportSize({width,height});await p.waitForTimeout(140);await loadPreset('early');await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));
   const fighter=self().units.find(u=>u.x>=0),reserve=self().units.find(u=>u.kind==='shiroko'),gold=self().gold,frozen=structuredClone(last.fighters);
   // Moving still cannot change the roster during combat; dragging to the shop sells.
    await press(`[data-bench-slot="${reserve.benchSlot}"]`);if(mode==='mobile'){await p.locator('#unit-dialog').waitFor({state:'visible'});await closeUnit();}await press('#cells button[data-x="5"][data-y="7"]');await p.waitForTimeout(60);assert.equal(self().units.find(u=>u.id===reserve.id).x,-1);
   await drag(`[data-bench-slot="${reserve.benchSlot}"]`,{shot:`${mode}-${width}-${height}-combat-sell-hover`});await waitState(()=>!self().units.some(u=>u.id===reserve.id));assert.equal(self().gold,gold+2);assert.deepEqual(last.fighters,frozen);
   await press(`#cells [data-board-unit="${fighter.id}"]`);if(mode==='pc')await press('#selected-unit-content .selection img');assert.equal(await p.locator('#unit-title-sell').isDisabled(),false);
   const price=self().gold;await press('#unit-title-sell');await waitState(()=>!self().units.some(u=>u.id===fighter.id));assert.equal(self().gold,price+1);assert.deepEqual(last.fighters,frozen);
    await p.waitForFunction(()=>document.querySelector('#unit-dialog').dataset.readOnly==='true');assert.equal(await p.locator('#unit-title-sell').isVisible(),false);assert.equal(await p.locator('#dialog-equipment-panel').isVisible(),false);await closeUnit();assert.equal(await p.locator(`#cells [data-board-unit="${fighter.id}"]`).count(),1);
    await press(`#cells [data-board-unit="${fighter.id}"]`);if(mode==='pc')await press('#selected-unit-content .selection img');await p.locator('#unit-dialog').waitFor({state:'visible'});assert.equal(await p.locator('#unit-dialog').getAttribute('data-read-only'),'true');await closeUnit();
   await press(`[data-player-id="${other}"]`);assert.equal(await p.locator(`#cells [data-board-unit="${fighter.id}"]`).count(),1);await press('#scout-return');
   // Combat field drag also sells the persistent unit, retaining its frozen fighter.
   await loadPreset('early');await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));const field=self().units.find(u=>u.x>=0),battle=structuredClone(last.fighters);
   await drag(`#cells [data-board-unit="${field.id}"]`);await waitState(()=>!self().units.some(u=>u.id===field.id));assert.deepEqual(last.fighters,battle);
   extra.push({mode,width,height,maxKinds,soldRank:3,opponentLocked:true,combatSale:true,frozenFighters:true});
  }
  await ctx.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,extra,errors,fixture:'Real two-player server, no modified snapshots'},null,2));console.log('PASS equipment text hidden, blue/yellow stars, profile-sized sale buttons, equipment refund, cancelled/bench/field drag sale, red shop feedback, nine layouts/rotation and own max-rank exclusion');
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
