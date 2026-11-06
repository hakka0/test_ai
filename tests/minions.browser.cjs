const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {decode}=require('@colyseus/schema'),{unpack}=require('@colyseus/msgpackr');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots=`docs/screenshots/minions-${version}`,url='http://127.0.0.1:2686';
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2686',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});fs.mkdirSync(shots,{recursive:true});
function snapshot(raw){if(typeof raw==='string')return;const b=Buffer.from(raw);if(b[0]!==13)return;const it={offset:1},type=decode.stringCheck(b,it)?decode.string(b,it):decode.number(b,it);if(type==='snapshot')return unpack(b,{start:it.offset});}
(async()=>{let browser,vite;try{
 for(let i=0;i<80;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const results=[],extra=[],rendering=[],errors=[];
 for(const mode of ['pc','mobile']){
  const ctx=await browser.newContext({viewport:mode==='pc'?{width:1400,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  let last;await ctx.routeWebSocket('**/*',ws=>{const peer=ws.connectToServer();ws.onMessage(raw=>peer.send(raw));peer.onMessage(raw=>{const s=snapshot(raw);if(s)last=s;ws.send(raw);});});
  await ctx.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url,protocols){if(protocols&&typeof protocols==='object'&&!Array.isArray(protocols))throw new TypeError('Browser WebSocket protocols must be a string or array');super(url,protocols);}};});
  const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));const own=()=>last.players.find(p=>p.visibility==='self');
  const press=async sel=>{const el=typeof sel==='string'?p.locator(sel):sel;await el.scrollIntoViewIfNeeded();return mode==='mobile'?el.tap():el.click();};
  const waitState=async check=>{for(let i=0;i<120&&!check();i++)await p.waitForTimeout(30);assert.ok(check(),'fresh server state');};
  async function closeUnit(){if(await p.locator('#unit-dialog').evaluate(e=>e.open))await press('#close-unit-dialog');}
  await p.goto(url);await press('#practice');await p.waitForFunction(()=>document.getElementById('phase').textContent.startsWith('준비'));await debugClick(p,'debug-pause');const room=await p.locator('#room-code').textContent();
  const frames=mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]];
  for(const [width,height] of frames){
   console.log('CHECK minions',mode,width,height);await closeUnit();await p.setViewportSize({width,height});await p.waitForTimeout(150);const generation=last.debug.generation;await debugPreset(p,'minion');await waitState(()=>last.debug.generation>generation);
   assert.equal(last.encounter,'minion');assert.equal(last.players.length,2);assert.equal(await p.locator('.ranking-row').count(),2);assert.match(await p.locator('#phase').textContent(),/미니언전 1\/3/);
   const minion=p.locator('#cells [data-board-owner^="minions:"]').first();await minion.waitFor({state:'visible'});await press(minion);
   const detail=p.locator(mode==='pc'?'#selected-unit-content':'#unit-detail');if(mode==='mobile')await p.locator('#unit-dialog').waitFor({state:'visible'});
   assert.match(await detail.locator('h2').textContent(),/훈련 미니언/);assert.equal(await detail.locator('.selection img').getAttribute('src'),'/units/minion-sentry.svg');assert.equal(await detail.locator('[data-stat="hp"] .stat-value strong').textContent(),'85');assert.equal(await detail.locator('[data-stat="defense"] .stat-value strong').textContent(),'8');assert.equal(await detail.locator('.unit-meta').textContent(),'중립 유닛');
   if(mode==='mobile')assert.equal(await p.locator('#unit-title-sell').isVisible(),false);await closeUnit();
   const geometry=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return{overflow:document.documentElement.scrollWidth>innerWidth,board:r('board-wrap'),bench:r('bench'),shop:r('pc-play-dock'),rank:r('player-ranking'),targets:[...document.querySelectorAll('.ranking-row,#shop-offers [data-offer]')].map(e=>e.getBoundingClientRect().toJSON())};});
   assert.equal(geometry.overflow,false);assert.ok(geometry.targets.every(t=>t.width>=44&&t.height>=44));const overlap=(a,b)=>a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1;for(const [a,b] of [['board','bench'],['board','shop'],['board','rank'],['bench','shop'],['bench','rank'],['shop','rank']])assert.equal(overlap(geometry[a],geometry[b]),false,`${a}/${b}`);
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-prepare.png`});const gold=own().gold,count=own().units.length;
   await debugClick(p,'debug-next');await waitState(()=>last.phase==='combat');assert.equal(last.fighters.filter(f=>f.minion).length,2);
   await debugClick(p,'debug-next');await waitState(()=>last.phase==='result');assert.equal(own().gold,gold+2);assert.equal(own().units.length,count+1);assert.equal(own().streakCount,0);assert.equal(own().health,100);assert.equal(last.roundHistory.at(-1).players.find(v=>v.id===own().id).outcome,'win');
   assert.ok(last.events.some(e=>e.type==='loot'&&e.loot.type==='unit'));await p.screenshot({path:`${shots}/${mode}-${width}-${height}-drops.png`});
   await press('#history-toggle');await p.locator('#history-panel').waitFor({state:'visible'});assert.match(await p.locator('#history-result-summary').textContent(),/미니언전 승리/);await press('[data-contribution-team="opponent"]');assert.match(await p.locator('#history-contributions').textContent(),/훈련 미니언/);await press(mode==='pc'?'#inspection-unit-tab':'#combat-sheet-close');
   const other=last.players.find(v=>v.visibility==='opponent').id;await press(`[data-player-id="${other}"]`);assert.ok((await p.locator('#cells [data-board-owner]').getAttribute('data-board-owner'))!==own().id);await press('#scout-return');
   await debugClick(p,'debug-next');await waitState(()=>last.phase==='prepare'&&last.round===2);assert.equal(last.neutralOpponents[0].units.length,2);assert.equal(await p.locator('#room-code').textContent(),room);assert.equal(await p.locator('html').getAttribute('data-screen-mode'),mode);
   results.push({mode,width,height,geometry,goldDrop:2,unitDrop:1,neutralInspection:true,history:true,scouting:true});
  }
  for(const round of [2,3]){const items=own().inventory.length,gold=own().gold;await debugClick(p,'debug-next');await waitState(()=>last.phase==='combat');await debugClick(p,'debug-next');await waitState(()=>last.phase==='result');assert.equal(own().inventory.length,items+1);assert.equal(own().gold,gold+(round===2?2:3));await debugClick(p,'debug-next');await waitState(()=>last.phase==='prepare'&&last.round===round+1);}
  assert.equal(last.encounter,'pvp');assert.equal(last.neutralOpponents,undefined);await debugClick(p,'debug-next');await waitState(()=>last.phase==='matching');await debugClick(p,'debug-next');await waitState(()=>last.phase==='combat');assert.ok(last.fighters.every(f=>!f.minion));
  extra.push({mode,threeWaves:true,materialAndEquipment:true,normalPvpMatching:true});await ctx.close();
 }
 // Isolated renderer verification inspects real Phaser loot objects, including
 // all reward types, reduced effects and perspective changes.
 const {createServer}=await import('vite');vite=await createServer({server:{host:'127.0.0.1',port:2687,strictPort:true}});await vite.listen();const p=await browser.newPage({viewport:{width:600,height:800}});p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:2687/tests/combat-attributes.fixture.html');await p.waitForFunction(()=>window.combatFixture?.scene.sys.isActive());
 for(const reduced of [false,true])for(const reverse of [false,true]){
  const r=await p.evaluate(({reduced,reverse})=>{const f=window.combatFixture;f.pair('knight','knight',{reverse,reduced});const s=f.scene,enemy=s.snapshot.fighters[1];s.resetVisuals();
   enemy.minion={wave:3,variant:'sentry'};const drone={...structuredClone(enemy),id:'drone',x:4,minion:{wave:3,variant:'drone'}},third={...structuredClone(enemy),id:'third',x:6};s.snapshot.fighters.push(drone,third);
   const types=[{id:'g',type:'gold',amount:3},{id:'u',type:'unit',kind:'knight'},{id:'i',type:'item',definition:'blade'}];s.snapshot.events=types.map((loot,i)=>({id:i+1,type:'loot',source:[enemy,drone,third][i].id,target:[enemy,drone,third][i].id,amount:1,loot}));s.snapshot.eventId=3;s.update(s.time.now+16,16);
   const objects=s.children.list.filter(o=>o.getData('role')==='loot');return {types:objects.map(o=>o.getData('lootType')).sort(),sprites:[...s.sprites.values()].map(o=>o.texture.key),labels:s.children.list.filter(o=>o.getData('role')==='loot-label').map(o=>o.text)};
  },{reduced,reverse});assert.deepEqual(r.types,['gold','item','unit']);assert.ok(r.sprites.includes('minion-sentry')&&r.sprites.includes('minion-drone'));await p.screenshot({path:`${shots}/renderer-${reduced?'reduced':'full'}-${reverse?'reverse':'forward'}.png`});rendering.push({reduced,reverse,...r});
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,extra,rendering,errors,fixture:'Actual two-player practice debug minion preset; unmodified server snapshots. Real PvP intro is covered by minions.network.test.ts; renderer snapshots are isolated fixtures.'},null,2));console.log('PASS minions: nine layouts/rotation, neutral details/history/scouting, actual kill rewards, three waves/PvP transition and loot renderer');
}finally{await browser?.close();await vite?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
