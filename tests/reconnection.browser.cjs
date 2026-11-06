const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {decode}=require('@colyseus/schema'),{unpack}=require('@colyseus/msgpackr');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots=`docs/screenshots/reconnection-${version}`,url='http://127.0.0.1:2682';
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2682',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
fs.mkdirSync(shots,{recursive:true});
function snapshot(raw){if(typeof raw==='string')return;const bytes=Buffer.from(raw);if(bytes[0]!==13)return;const it={offset:1},type=decode.stringCheck(bytes,it)?decode.string(bytes,it):decode.number(bytes,it);if(type==='snapshot')return unpack(bytes,{start:it.offset});}
(async()=>{let browser;try{
 for(let i=0;i<80;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const results=[],extra=[],errors=[];
 for(const mode of ['pc','mobile']){
  const ctx=await browser.newContext({viewport:mode==='pc'?{width:1400,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  let last,currentSocket,mutedSocket;await ctx.routeWebSocket('**/*',ws=>{currentSocket=ws;const peer=ws.connectToServer();ws.onMessage(raw=>peer.send(raw));peer.onMessage(raw=>{if(ws===mutedSocket)return;const s=snapshot(raw);if(s)last=s;ws.send(raw);});});
  await ctx.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url,protocols){if(protocols&&typeof protocols==='object'&&!Array.isArray(protocols))throw new TypeError('Browser WebSocket protocols must be a string or array');super(url,protocols);window.__gameSocket=this;}};});
  const p=await ctx.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
  const own=()=>last.players.find(p=>p.visibility==='self');
  const press=async sel=>{const el=p.locator(sel);await el.scrollIntoViewIfNeeded();return mode==='mobile'?el.tap():el.click();};
  const token=()=>p.evaluate(()=>sessionStorage.getItem('duel-token'));
  async function closeUnit(){if(await p.locator('#unit-dialog').evaluate(e=>e.open))await press('#close-unit-dialog');}
  async function waitState(predicate){for(let i=0;i<150&&!predicate();i++)await p.waitForTimeout(30);assert.ok(predicate(),'fresh server snapshot');}
  async function restored(previous,timeout=12000){await p.waitForFunction(old=>sessionStorage.getItem('duel-token')!==old&&document.getElementById('connection').textContent.startsWith('연결됨'),previous,{timeout});await waitState(()=>own().connected);}
  await p.goto(url);await press('#practice');await p.waitForFunction(()=>document.getElementById('phase').textContent.startsWith('준비'));await debugClick(p,'debug-pause');
  const roomCode=await p.locator('#room-code').textContent(),session=own().id,other=last.players.find(p=>p.visibility==='opponent').id;
  const frames=mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]];
  let watched=false;
  for(const [width,height] of frames){
   console.log('CHECK reconnection',mode,width,height);await closeUnit();await p.setViewportSize({width,height});await p.waitForTimeout(140);
   assert.equal(await p.locator('#room-code').textContent(),roomCode);assert.equal(await p.locator('html').getAttribute('data-screen-mode'),mode);
   if(watched){assert.equal(await p.locator(`[data-player-id="${other}"]`).getAttribute('aria-pressed'),'true');await press('#scout-return');}
   const generation=last.debug.generation;await debugPreset(p,'early');await waitState(()=>last.debug.generation>generation);await p.locator(`#cells [data-board-unit="${own().units.find(u=>u.x>=0).id}"]`).waitFor({state:'visible'});
   await press(`[data-player-id="${other}"]`);const selected=p.locator(`#cells [data-board-owner="${other}"]`).first(),unitId=await selected.getAttribute('data-board-unit');await selected[mode==='mobile'?'tap':'click']();watched=true;
   if(mode==='mobile')await p.locator('#unit-dialog').waitFor({state:'visible'});
   const before=structuredClone(own()),beforeToken=await token(),beforeTime=last.gameNow;
   await ctx.setOffline(true);await p.evaluate(()=>window.__gameSocket.close());
   await p.waitForFunction(()=>document.getElementById('connection').textContent.includes('재접속 중'));
   assert.match(await p.locator('#notice').textContent(),/재접속 중/);
   if(mode==='mobile')assert.match(await p.locator('#dialog-notice').textContent(),/재접속 중/);
   for(const id of ['buy-experience','reroll'])assert.equal(await p.locator('#'+id).isDisabled(),true);
   assert.equal(await token(),beforeToken);assert.deepEqual(own().units,before.units);assert.equal(own().gold,before.gold);
   if(mode==='pc'&&width===1400){await p.waitForTimeout(4800);assert.equal(await p.locator('#notice').isVisible(),true);await p.screenshot({path:`${shots}/pc-offline.png`});}
   await ctx.setOffline(false);await restored(beforeToken);await waitState(()=>last.serverNow>beforeTime&&own().id===session);
   assert.match(await p.locator('#notice').textContent(),/연결이 복구/);
   assert.equal((await token()).split(':')[0],roomCode);assert.equal(own().id,session);
   for(const key of ['units','shop','inventory','gold','health','level'])assert.deepEqual(own()[key],before[key],key);
   assert.equal(last.gameNow,beforeTime);assert.equal(last.phase,'prepare');
   assert.equal(await p.locator(`[data-player-id="${other}"]`).getAttribute('aria-pressed'),'true');assert.equal(await p.locator(`#cells [data-board-unit="${unitId}"]`).getAttribute('aria-pressed'),'true');
   if(mode==='mobile'){assert.equal(await p.locator('#unit-dialog').evaluate(e=>e.open),true);await closeUnit();}
   const geometry=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return{overflow:document.documentElement.scrollWidth>innerWidth,board:r('board-wrap'),bench:r('bench'),shop:r('pc-play-dock'),rank:r('player-ranking'),notice:r('notice'),targets:[...document.querySelectorAll('.ranking-row,#shop-offers [data-offer]')].map(e=>e.getBoundingClientRect().toJSON())};});
   assert.equal(geometry.overflow,false);assert.ok(geometry.targets.every(t=>t.width>=44&&t.height>=44));
   assert.ok(geometry.notice.y>=0&&geometry.notice.bottom<=height&&geometry.notice.x>=0&&geometry.notice.right<=width,'connection feedback fits the viewport');
   const overlap=(a,b)=>a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1;for(const [a,b] of [['board','bench'],['board','shop'],['board','rank'],['bench','shop'],['bench','rank'],['shop','rank']])assert.equal(overlap(geometry[a],geometry[b]),false,`${a}/${b}`);
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-restored.png`});results.push({mode,width,height,session,roomCode,rosterPreserved:true,scoutingPreserved:true,selectionPreserved:true,geometry});
  }
  await closeUnit();await press('#scout-return');
  if(mode==='pc'){
   console.log('CHECK silent socket watchdog');const previous=await token(),before=structuredClone(own()),serverNow=last.serverNow;mutedSocket=currentSocket;
   await restored(previous,25000);await waitState(()=>last.serverNow>serverNow);assert.notEqual(currentSocket,mutedSocket);assert.equal(own().id,session);assert.deepEqual(own().units,before.units);assert.equal(own().gold,before.gold);mutedSocket=undefined;
  }
  console.log('CHECK combat reconnection',mode);await debugClick(p,'debug-next');await p.waitForFunction(()=>document.getElementById('phase').textContent.startsWith('전투'));await press(`[data-player-id="${other}"]`);
  const battle=structuredClone(last.fighters),combatToken=await token(),combatNow=last.serverNow;assert.ok(battle.length>0);
  await ctx.setOffline(true);await p.evaluate(()=>window.__gameSocket.close());await p.waitForFunction(()=>document.getElementById('connection').textContent.includes('재접속 중'));await ctx.setOffline(false);await restored(combatToken);await waitState(()=>last.serverNow>combatNow);
  assert.equal(last.phase,'combat');assert.deepEqual(last.fighters,battle);assert.equal(await p.locator(`[data-player-id="${other}"]`).getAttribute('aria-pressed'),'true');for(const f of battle)assert.equal(await p.locator(`#cells [data-board-unit="${f.id}"]`).count(),1);await press('#scout-return');
  const beforeReload=structuredClone(own()),previous=await token();let blocked=0;
  await p.route('**/matchmake/reconnect/**',route=>++blocked===1?route.abort('internetdisconnected'):route.continue());
  await p.reload();await p.waitForFunction(()=>document.getElementById('lobby-status').textContent.includes('재접속 중'));
  assert.equal(await p.locator('#practice').isDisabled(),false);await p.locator('#game-view').waitFor({state:'visible'});await restored(previous);assert.ok(blocked>=2);assert.equal(own().id,session);assert.equal(await p.locator('#room-code').textContent(),roomCode);assert.deepEqual(own().units,beforeReload.units);assert.equal(own().gold,beforeReload.gold);
  await p.unroute('**/matchmake/reconnect/**');
  // Restoring offline must remain cancellable by starting another game.
  await p.route('**/matchmake/reconnect/**',route=>route.abort('internetdisconnected'));await p.reload();await p.waitForFunction(()=>document.getElementById('lobby-status').textContent.includes('재접속 중'));await press('#practice');await p.locator('#game-view').waitFor({state:'visible'});await waitState(()=>own().id!==session);
  const freshToken=await token();assert.notEqual((await p.locator('#room-code').textContent()),roomCode);await p.waitForTimeout(1700);assert.equal(await token(),freshToken);await p.unroute('**/matchmake/reconnect/**');
  await press('#leave');await p.locator('#lobby').waitFor({state:'visible'});assert.equal(await token(),null);
  await p.evaluate(()=>sessionStorage.setItem('duel-token','ZZZZ:expired'));await p.reload();await p.waitForFunction(()=>document.getElementById('lobby-status').textContent.includes('방이 이미 종료'));assert.equal(await token(),null);assert.equal(await p.locator('#practice').isDisabled(),false);
  extra.push({mode,combatReconnection:true,silentSocketWatchdog:mode==='pc',reloadTransientRetry:true,restoreCancellable:true,disposedRoomStopsRetry:true});await ctx.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,extra,errors,fixture:'Actual two-player practice server; unmodified snapshots'},null,2));console.log('PASS nine layouts: offline/online same-session recovery, roster/gold/shop/scouting/selection, rotation, reload retry, cancellation and disposed-room handling');
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
