const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {decode}=require('@colyseus/schema'),{unpack}=require('@colyseus/msgpackr');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots=`docs/screenshots/deferred-merge-${version}`,url='http://127.0.0.1:2678';
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2678',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});fs.mkdirSync(shots,{recursive:true});
function snapshot(raw){if(typeof raw==='string')return;const b=Buffer.from(raw);if(b[0]!==13)return;const it={offset:1},type=decode.stringCheck(b,it)?decode.string(b,it):decode.number(b,it);if(type==='snapshot')return unpack(b,{start:it.offset});}
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const errors=[],results=[];
 for(const mode of ['pc','mobile']){
  const ctx=await browser.newContext({viewport:mode==='pc'?{width:1400,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  let last;await ctx.routeWebSocket('**/*',ws=>{const peer=ws.connectToServer();ws.onMessage(raw=>peer.send(raw));peer.onMessage(raw=>{const s=snapshot(raw);if(s)last=s;ws.send(raw);});});
  await ctx.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url,protocols){if(protocols&&typeof protocols==='object'&&!Array.isArray(protocols))throw new TypeError('Browser WebSocket protocols must be a string or array');super(url,protocols);}};});
  const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  const self=()=>last.players.find(p=>p.visibility==='self'),press=async el=>{if(typeof el==='string')el=p.locator(el);return mode==='mobile'?el.tap():el.click();};
  async function waitState(condition){for(let i=0;i<200&&!condition();i++)await p.waitForTimeout(25);assert.ok(condition(),'authoritative state updated');}
  async function closeUnit(){if(await p.locator('#unit-dialog').evaluate(e=>e.open))await press('#close-unit-dialog');}
  async function choose(id,bench=false){await press(bench?`#units [data-unit="${id}"]`:`#cells [data-board-unit="${id}"]`);if(mode==='mobile'){await p.locator('#unit-dialog').waitFor({state:'visible'});assert.equal(await p.locator('#unit-detail .unit-upgrade').getAttribute('aria-label'),'강화 1성');await closeUnit();}else assert.equal(await p.locator('#selected-unit-content .unit-upgrade').getAttribute('aria-label'),'강화 1성');}
  async function drag(source,target){await source.scrollIntoViewIfNeeded();const a=await source.boundingBox(),b=await target.boundingBox();assert.ok(a&&b);
   if(mode==='mobile'){const cdp=await ctx.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});await p.waitForTimeout(50);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
   else{await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await p.mouse.up();}
  }
  await p.goto(url);await press('#practice');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));await debugClick(p,'debug-pause');const room=last.roomId;
  const frames=mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]];
  for(const [width,height] of frames)for(const purchasePhase of ['combat','result']){
   console.log('CHECK deferred merge',mode,width,height,purchasePhase);await closeUnit();await p.setViewportSize({width,height});await p.waitForTimeout(140);
   const generation=last.debug.generation;await debugPreset(p,'merge');await waitState(()=>last.debug.generation>generation);const first=self().units.find(u=>u.kind==='knight'&&u.x>=0),second=self().units.find(u=>u.kind==='knight'&&u.x<0);await p.locator(`#cells [data-board-unit="${first.id}"]`).waitFor();
   if(purchasePhase==='combat'){await drag(p.locator(`[data-bench-slot="${second.benchSlot}"]`),p.locator('#cells [data-x="5"][data-y="7"]'));await waitState(()=>self().units.find(u=>u.id===second.id)?.x===5);}
   await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));if(purchasePhase==='result'){await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('라운드 결과'));}
   await choose(second.id,purchasePhase==='result');const original=self().units.map(u=>u.id),revision=self().mergeRevision,fighters=structuredClone(last.fighters),offer=self().shop[0],gold=self().gold;assert.equal(offer.kind,'knight');
   await require('./ui-helpers.cjs').buyOffer(p,p.locator(`#shop-offers [data-offer="${offer.id}"]`));await waitState(()=>self().shop.find(o=>o.id===offer.id)?.sold);const pending=self().units.filter(u=>u.kind==='knight');
   assert.equal(self().gold,gold-1);assert.equal(pending.length,3);assert.ok(pending.every(u=>u.rank===1));assert.ok(original.every(id=>self().units.some(u=>u.id===id)));assert.equal(self().mergeRevision,revision);assert.deepEqual(last.fighters,fighters);assert.equal(await p.locator(`#cells [data-board-owner="${self().id}"]`).count(),purchasePhase==='combat'?2:fighters.filter(f=>f.owner===self().id&&f.hp>0).length);assert.equal(await p.locator('#selected-unit-content .unit-upgrade').getAttribute('aria-label'),'강화 1성');
   const reserve=pending.find(u=>!original.includes(u.id));assert.ok(reserve&&reserve.x<0);await p.locator(`#units [data-unit="${reserve.id}"]`).waitFor();assert.match(await p.locator(`#units [data-unit="${reserve.id}"]`).getAttribute('aria-label'),/강화 1성/);
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-${purchasePhase}-pending.png`,animations:'disabled'});
   if(mode==='mobile'&&width===390&&purchasePhase==='combat'){
    const other=last.players.find(p=>p.visibility==='opponent').id;await press(`[data-player-id="${other}"]`);for(const viewport of [{width:844,height:390},{width:390,height:844}]){await p.setViewportSize(viewport);await p.waitForTimeout(160);assert.equal(await p.locator(`[data-player-id="${other}"]`).getAttribute('aria-pressed'),'true');assert.equal(last.roomId,room);assert.equal(self().units.filter(u=>u.kind==='knight'&&u.rank===1).length,3);assert.equal(await p.locator('html').getAttribute('data-screen-mode'),'mobile');}
    await press('#scout-return');await choose(second.id);
   }
   if(purchasePhase==='combat'){await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('라운드 결과'));assert.equal(self().units.filter(u=>u.kind==='knight'&&u.rank===1).length,3);assert.equal(self().mergeRevision,revision);}
   await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));await waitState(()=>self().units.some(u=>u.id===first.id&&u.rank===2));
   assert.equal(self().units.filter(u=>u.kind==='knight').length,1);assert.ok(!self().units.some(u=>u.id===second.id||u.id===reserve.id));assert.equal(self().mergeRevision,revision+1);await p.waitForFunction(id=>document.querySelector(`#cells [data-board-unit="${id}"]`)?.getAttribute('aria-pressed')==='true',first.id);assert.equal(await p.locator('#selected-unit-content .unit-upgrade').getAttribute('aria-label'),'강화 2성');assert.equal(await p.locator(`#units [data-unit="${reserve.id}"]`).count(),0);assert.equal(last.roomId,room);
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-${purchasePhase}-prepare-merged.png`,animations:'disabled'});
   const geometry=await p.evaluate(()=>{const box=id=>document.getElementById(id).getBoundingClientRect().toJSON();return {board:box('board-wrap'),bench:box('bench'),shop:box('pc-play-dock'),ranking:box('player-ranking'),overflow:document.documentElement.scrollWidth>innerWidth,targets:[...document.querySelectorAll('.ranking-row,#shop-offers [data-offer],#mobile-info-open,#history-toggle')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().toJSON())};});
   const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;assert.equal(geometry.overflow,false);assert.ok(geometry.bench.bottom<=height);assert.ok(geometry.ranking.x>=geometry.board.right);assert.ok(!overlap(geometry.bench,geometry.shop)&&!overlap(geometry.board,geometry.shop));assert.ok(geometry.targets.every(r=>r.width>=44&&r.height>=44));
   results.push({mode,width,height,purchasePhase,pendingIds:pending.map(u=>u.id),survivor:first.id,rank:2,geometry});fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),fixture:'Actual two-player practice server, unmodified snapshots',results,errors},null,2));
  }
  await ctx.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS deferred combat/result merge, stable battle and bench, preparation upgrade/selection, nine layouts and rotation');
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
