const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {decode}=require('@colyseus/schema'),{unpack}=require('@colyseus/msgpackr');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots=`docs/screenshots/shop-preview-${version}`,url='http://127.0.0.1:2699';
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2699',DEBUG_GAME:'0',NODE_ENV:'production'},stdio:'pipe'});fs.mkdirSync(shots,{recursive:true});
function message(raw){if(typeof raw==='string')return;const b=Buffer.from(raw);if(b[0]!==13)return;const it={offset:1},type=decode.stringCheck(b,it)?decode.string(b,it):decode.number(b,it);return{type,data:unpack(b,{start:it.offset})};}
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const results=[],errors=[],behavior=[];
 for(const mode of (process.env.SHOP_TEST_MODE?[process.env.SHOP_TEST_MODE]:['pc','mobile'])){
  const ctx=await browser.newContext({viewport:mode==='pc'?{width:1400,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36'});
  let last;const actions=[],buys=[];
  await ctx.routeWebSocket('**/*',ws=>{const peer=ws.connectToServer();ws.onMessage(raw=>{const m=message(raw);if(m?.type==='action'){actions.push(m.data);if(m.data.type==='buy')buys.push(m.data);}peer.send(raw);});peer.onMessage(raw=>{const m=message(raw);if(m?.type==='snapshot')last=m.data;ws.send(raw);});});
  await ctx.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url,protocols){if(protocols&&typeof protocols==='object'&&!Array.isArray(protocols))throw new TypeError('Invalid browser protocols');super(url,protocols);}};});
  const p=await ctx.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
  const press=async target=>{const e=typeof target==='string'?p.locator(target):target;await e.scrollIntoViewIfNeeded();await(mode==='mobile'?e.tap():e.click());};
  const pressBlocked=async e=>{await e.scrollIntoViewIfNeeded();await(mode==='mobile'?e.tap({force:true}):e.click({force:true}));};
  const fresh=async fn=>{for(let i=0;i<220&&!fn();i++)await p.waitForTimeout(30);assert.ok(fn(),'authoritative state update');};
  const own=()=>last.players.find(v=>v.visibility==='self'),copies=kind=>own().units.filter(u=>u.kind===kind).reduce((n,u)=>n+3**(u.rank-1),0),tip=p.locator('#shop-unit-tooltip');
  const reset=async preset=>{const g=last.debug.generation;await debugPreset(p,preset);await fresh(()=>last.debug.generation>g&&last.phase==='prepare');await p.waitForTimeout(100);};
  const card=o=>p.locator(`[data-offer="${o.id}"]`);
  const hover=async o=>{await card(o).hover();await tip.waitFor({state:'visible'});assert.deepEqual(await tip.locator('[data-skill-kind]').evaluateAll(es=>es.map(e=>e.dataset.skillKind)),['passive','active']);assert.equal(await tip.locator('img,[data-stat],button,h2').count(),0);};
  const purchase=async(o,method)=>{const gold=own().gold,n=copies(o.kind),count=buys.length,revision=own().shopRevision,placements=actions.filter(a=>['bench','place','sell'].includes(a.type)).length;
   await method();await fresh(()=>own().shop.find(v=>v.id===o.id)?.sold);assert.equal(own().gold,gold-o.cost);assert.equal(copies(o.kind),n+1);assert.equal(buys.length,count+1);assert.deepEqual(buys.at(-1),{type:'buy',offerId:o.id,revision});assert.equal(actions.filter(a=>['bench','place','sell'].includes(a.type)).length,placements);await tip.waitFor({state:'hidden'});
  };
  async function dragOffer(o,destination,hold){
   const source=card(o);await source.scrollIntoViewIfNeeded();const a=await source.boundingBox(),b=await p.locator(destination).boundingBox();assert.ok(a&&b);const from={x:a.x+a.width/2,y:a.y+a.height/2},to={x:b.x+b.width/2,y:b.y+b.height/2};
   let cdp;if(mode==='mobile'){cdp=await ctx.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...to,id:1}]});}else{await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(to.x,to.y,{steps:10});}
   await p.locator('.shop-drag-ghost').waitFor({state:'visible'});
   const fit=await p.locator('.shop-drag-ghost').evaluate(e=>{const portrait=e.querySelector('.shop-drag-portrait'),img=portrait?.querySelector('img');return{outer:e.getBoundingClientRect().toJSON(),portrait:portrait?.getBoundingClientRect().toJSON(),image:img?.getBoundingClientRect().toJSON(),border:parseFloat(getComputedStyle(e).borderLeftWidth),transform:portrait&&getComputedStyle(portrait).transform};});
   assert.ok(fit.portrait&&fit.image,JSON.stringify(fit));
   for(const key of ['width','height'])assert.ok(Math.abs(fit.outer[key]-a[key])<1,'ghost matches source '+key);
   for(const key of ['x','y'])assert.ok(Math.abs(fit.portrait[key]-fit.outer[key]-fit.border)<1,'portrait fills inner '+key);
   for(const key of ['width','height'])assert.ok(Math.abs(fit.portrait[key]-(fit.outer[key]-fit.border*2))<1,'portrait fills inner '+key);
   for(const key of ['x','y','width','height'])assert.ok(Math.abs(fit.image[key]-fit.portrait[key])<1,'image fills portrait '+key);
   assert.equal(fit.transform,'none');if(hold)await hold();
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else await p.mouse.up();await p.locator('.shop-drag-ghost').waitFor({state:'hidden'});
  }
  await p.goto(url);await press('#pvp-practice');await fresh(()=>last?.debug);await debugClick(p,'debug-pause');await fresh(()=>last.debug.paused);const room=last.roomId,bot=last.players.find(v=>v.bot).id;
  const frames=mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]];
  for(const [width,height] of (process.env.SHOP_ONE_FRAME?frames.slice(0,1):frames)){
   console.log('CHECK immediate shop / drag',mode,width,height);await p.setViewportSize({width,height});await p.waitForTimeout(150);assert.equal(last.roomId,room);assert.equal(await p.locator('html').getAttribute('data-screen-mode'),mode);
   if(await p.locator('#scout-return').isVisible()){assert.equal(await p.locator(`[data-player-id="${bot}"]`).getAttribute('aria-pressed'),'true');await press('#scout-return');}
   await reset('merge');const o=own().shop[0];assert.equal(o.kind,'knight');assert.equal(own().units.filter(u=>u.kind==='knight'&&u.rank===1).length,2);
   await p.waitForFunction(id=>document.querySelector(`[data-offer="${id}"]`).dataset.mergeReady==='true',o.id);
   const style=await card(o).evaluate(e=>({border:getComputedStyle(e).borderColor,shadow:getComputedStyle(e).boxShadow}));assert.notEqual(style.shadow,'none');
   const before=await p.locator('#shop-offers [data-shop-slot]').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON())),requests=buys.length,gold=own().gold;
   if(mode==='pc'){await hover(o);assert.equal(buys.length,requests);assert.equal(own().gold,gold);const r=await tip.boundingBox();assert.ok(r.x>=7&&r.y>=7&&r.x+r.width<=width-7&&r.y+r.height<=height-7);await p.screenshot({path:`${shots}/${mode}-${width}-${height}-hover.png`});await p.mouse.move(1,1);await tip.waitFor({state:'hidden'});}
   await purchase(o,()=>dragOffer(o,'[data-bench-slot="0"]',async()=>{
    assert.equal(await p.locator('#bench').evaluate(e=>e.classList.contains('shop-drop-valid')),true);assert.equal(await card(o).evaluate(e=>getComputedStyle(e).opacity),'0.35');assert.equal(buys.length,requests);const after=await p.locator('#shop-offers [data-shop-slot]').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));for(let i=0;i<before.length;i++)for(const key of ['x','y','width','height'])assert.ok(Math.abs(before[i][key]-after[i][key])<1);await p.screenshot({path:`${shots}/${mode}-${width}-${height}-drag.png`});
   }));
   assert.equal(own().units.filter(u=>u.kind==='knight').length,1);assert.equal(own().units.find(u=>u.kind==='knight').rank,2);assert.equal(await p.locator('#unit-dialog').evaluate(e=>e.open),false,'bench drop must not select/relocate existing unit');
   const next=own().shop.find(v=>!v.sold);await purchase(next,async()=>{if(mode==='pc'&&width===1024){await card(next).focus();await p.keyboard.press('Enter');}else await press(card(next));});
   assert.equal(await p.locator('[data-shop-buy]').count(),0);assert.equal(await p.locator('body').evaluate(e=>e.textContent.includes('ⓘ')),false);
   const geometry=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return{overflow:document.documentElement.scrollWidth>innerWidth,board:r('board-wrap'),bench:r('bench'),shop:r('pc-dock-reserve'),rank:r('player-ranking'),targets:[...document.querySelectorAll('.ranking-row,#shop-offers [data-offer],#ready,#history-toggle')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().toJSON())};});assert.equal(geometry.overflow,false);assert.ok(geometry.targets.every(t=>t.width>=44&&t.height>=44));const overlap=(a,b)=>a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1;for(const [a,b] of [['board','bench'],['board','shop'],['board','rank'],['bench','shop'],['bench','rank'],['shop','rank']])assert.equal(overlap(geometry[a],geometry[b]),false,`${a}/${b}`);
   await press(`[data-player-id="${bot}"]`);results.push({mode,width,height,hoverEffectsOnly:mode==='pc',passiveBeforeActive:mode==='pc',immediateClickOrTap:true,dragBuysOnce:true,noPlacementOrSaleSideEffects:true,mergeHint:true,actualMerge:true,allCardDimensionsStable:true,ghostMatchesCardAndFillsBorder:true,noInfoIcons:true,geometry});
  }
  console.log('CHECK purchase restrictions / scouting / cancellation',mode);
  await press('#scout-return');await reset('early');let o=own().shop[0],requests=buys.length;
  await dragOffer(o,'#timer');await p.waitForTimeout(150);assert.equal(buys.length,requests);assert.equal(own().shop[0].sold,false);
  await dragOffer(o,'[data-bench-slot="0"]',()=>p.keyboard.press('Escape'));assert.equal(buys.length,requests);
  if(mode==='pc'){await hover(o);const rev=own().shopRevision;await press('#reroll');await fresh(()=>own().shopRevision>rev);await tip.waitFor({state:'hidden'});}
  await reset('early');for(let i=0;i<2;i++){const rev=own().shopRevision;await press('#reroll');await fresh(()=>own().shopRevision>rev);}assert.equal(own().gold,0);o=own().shop[0];requests=buys.length;await pressBlocked(card(o));await p.waitForTimeout(100);assert.equal(buys.length,requests);assert.equal(await card(o).getAttribute('aria-disabled'),'true');if(mode==='pc'){await hover(o);await p.keyboard.press('Escape');}
  await reset('synergyBulwark');o=own().shop[0];requests=buys.length;await pressBlocked(card(o));await p.waitForTimeout(100);assert.equal(buys.length,requests);assert.equal(await card(o).getAttribute('aria-disabled'),'true');
  // Removing one of the actual two candidates removes the hint; buying a second restores it.
  await reset('merge');o=own().shop[0];const candidate=own().units.find(u=>u.kind==='knight'&&u.x<0);await press(`[data-bench-slot="${candidate.benchSlot}"]`);
  const sell=p.locator(mode==='pc'?'#selected-unit-content [data-quick-sell]':'#unit-title-sell');await press(sell);await fresh(()=>!own().units.some(u=>u.id===candidate.id));if(await p.locator('#unit-dialog').evaluate(e=>e.open))await press('#close-unit-dialog');assert.equal(await card(o).getAttribute('data-merge-ready'),'false');await purchase(o,()=>press(card(o)));
  // During combat a third copy is acquired but merging waits until preparation.
  await reset('merge');await press('#ready');await fresh(()=>last.phase==='matching');o=own().shop[0];requests=buys.length;await pressBlocked(card(o));await p.waitForTimeout(100);assert.equal(buys.length,requests);await debugClick(p,'debug-next');await fresh(()=>last.phase==='combat');const frozen=structuredClone(last.fighters);o=own().shop[0];assert.equal(await card(o).getAttribute('data-merge-ready'),'true');await purchase(o,()=>dragOffer(o,'[data-bench-slot="0"]'));assert.equal(own().units.filter(u=>u.kind==='knight'&&u.rank===1).length,3);assert.deepEqual(last.fighters,frozen);
  await press(`[data-player-id="${bot}"]`);const other=structuredClone(last.players.find(v=>v.id===bot).units),next=own().shop.find(v=>!v.sold);requests=buys.length;await dragOffer(next,'[data-bench-slot="0"]',async()=>assert.equal(await p.locator('#bench').evaluate(e=>e.classList.contains('shop-drop-invalid')),true));assert.equal(buys.length,requests);await purchase(next,()=>press(card(next)));assert.deepEqual(last.fighters,frozen);assert.deepEqual(last.players.find(v=>v.id===bot).units,other);
  await press('#history-toggle');if(mode==='pc'){await p.locator('#combat-content').waitFor({state:'visible'});await press('#inspection-unit-tab');}else{await p.locator('#combat-record-dialog').waitFor({state:'visible'});await press('#combat-sheet-close');}await press('#equipment-toggle');if(await p.locator('#equipment-close').isVisible())await press('#equipment-close');assert.equal(await p.locator('body').evaluate(e=>e.textContent.includes('ⓘ')),false);
  if(mode==='mobile'){await p.setViewportSize({width:844,height:390});await p.waitForTimeout(150);assert.equal(last.roomId,room);assert.equal(await p.locator(`[data-player-id="${bot}"]`).getAttribute('aria-pressed'),'true');await p.setViewportSize({width:390,height:844});await p.waitForTimeout(150);assert.equal(await p.locator(`[data-player-id="${bot}"]`).getAttribute('aria-pressed'),'true');}
  await p.reload();await p.locator('#game-view').waitFor({state:'visible'});assert.equal(last.roomId,room);assert.equal(await tip.isVisible(),false);await press('#leave');await p.locator('#lobby').waitFor({state:'visible'});
  behavior.push({mode,outsideAndEscapeCancel:true,goldAndCapacityBlocked:true,matchingBlocked:true,mergeHintUpdatesOnSale:true,combatMergeDeferred:true,frozenFighters:true,scoutingClickPurchase:true,opponentBenchDropBlocked:true,equipmentAndHistory:true,rotationAndReload:true});await ctx.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,behavior,errors,completeLayoutRun:!process.env.SHOP_TEST_MODE&&!process.env.SHOP_ONE_FRAME,scope:'Actual one-human/five-bot rooms, real pointer/touch gestures and server purchases/merges. No modified snapshots or synthetic six-human claim.'},null,2));console.log(`PASS ${results.length} layouts: immediate click/tap, PC passive/active hover, mouse/touch reserve purchase, cancel, merge hint/merge/deferred combat, restrictions/scouting, no info icons and rotation`);
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
