const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {decode}=require('@colyseus/schema'),{unpack,Packr}=require('@colyseus/msgpackr');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots=`docs/screenshots/combat-scouting-${version}`,url='http://127.0.0.1:2672';
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2672',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
fs.mkdirSync(shots,{recursive:true});
function message(raw){if(typeof raw==='string')return;const bytes=Buffer.from(raw);if(bytes[0]!==13)return;const it={offset:1},type=decode.stringCheck(bytes,it)?decode.string(bytes,it):decode.number(bytes,it);return {bytes,offset:it.offset,type,data:bytes.length>it.offset?unpack(bytes,{start:it.offset}):undefined};}
// Copy the live two-player fight into two extra UI arenas. This is not a six-player server.
function sixArenas(s){
 const pairs=[['scout-ui-a','scout-ui-b'],['scout-ui-c','scout-ui-d']],players=[...s.players],fighters=[...s.fighters],events=s.events.map(e=>({...e,id:e.id*3}));
 for(let index=0;index<pairs.length;index++){
  const pair=pairs[index],ids=new Map(s.fighters.map(f=>[f.id,`${index}-${f.id}`]));
  const clones=s.fighters.map(f=>({...f,id:ids.get(f.id),owner:pair[s.players.findIndex(p=>p.id===f.owner)],equipment:[],skills:f.skills.map(k=>({...k}))}));
  fighters.push(...clones);
  pair.forEach((id,side)=>players.push({id,name:`관전 유저 ${String.fromCharCode(65+index*2+side)}`,visibility:'opponent',health:100,level:1,connected:true,ready:false,score:0,units:clones.filter(f=>f.owner===id),bench:[],inventory:[]}));
  events.push(...s.events.map(e=>({...e,id:e.id*3+index+1,source:ids.get(e.source),target:ids.get(e.target)})));
 }
 return {...s,players,fighters,events,eventId:s.eventId*3+2,battlePairs:[...s.battlePairs,...pairs]};
}
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const errors=[],results=[],prepareResults=[],sixResults=[];
 for(const mode of ['pc','mobile']){
  console.log('CHECK',mode,'start');
  const context=await browser.newContext({viewport:mode==='pc'?{width:1400,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  let lastReal,lastDelivered,extended=false,actions=0;const packr=new Packr({useRecords:false});
  await context.routeWebSocket('**/*',ws=>{const peer=ws.connectToServer();ws.onMessage(raw=>{if(message(raw)?.type==='action')actions++;peer.send(raw);});peer.onMessage(raw=>{const m=message(raw);if(m?.type==='snapshot'){lastReal=m.data;lastDelivered=extended?sixArenas(m.data):m.data;if(extended){ws.send(Buffer.concat([m.bytes.subarray(0,m.offset),Buffer.from(packr.pack(lastDelivered))]));return;}}ws.send(raw);});});
  await context.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url,protocols){if(protocols&&typeof protocols==='object'&&!Array.isArray(protocols))throw new TypeError('Browser WebSocket protocols must be a string or array');super(url,protocols);}};});
  const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  const press=async s=>{const e=typeof s==='string'?p.locator(s):s;return mode==='mobile'?e.tap():e.click();};
  async function closeUnit(){if(await p.locator('#unit-dialog').evaluate(e=>e.open))await press('#close-unit-dialog');}
  async function watch(id){await closeUnit();await press(`[data-player-id="${id}"]`);await p.waitForFunction(()=>document.body.classList.contains('scouting-player'));assert.equal(await p.locator(`[data-player-id="${id}"]`).getAttribute('aria-pressed'),'true');}
  async function step(ms=1000){const now=lastReal.gameNow;await p.evaluate(id=>document.getElementById(id).onclick(),ms===100?'debug-step':'debug-second');for(let i=0;i<80&&lastReal.gameNow<=now;i++)await p.waitForTimeout(25);assert.ok(lastReal.gameNow>now);}
  async function assertBoard(watched){
   const snapshot=lastDelivered,pair=snapshot.battlePairs.find(pair=>pair.includes(watched)),reverse=pair[1]===watched;
   const expected=snapshot.fighters.filter(f=>pair.includes(f.owner)&&f.hp>0).map(f=>({id:f.id,owner:f.owner,x:reverse?7-f.x:f.x,y:reverse?7-f.y:f.y,hp:f.hp})).sort((a,b)=>a.id.localeCompare(b.id));
   await p.waitForFunction(expected=>{const rows=[...document.querySelectorAll('#cells [data-board-unit]')].map(e=>({id:e.dataset.boardUnit,owner:e.dataset.boardOwner,x:+e.dataset.x,y:+e.dataset.y,hp:+e.getAttribute('aria-label').match(/체력 (\d+)/)[1]})).sort((a,b)=>a.id.localeCompare(b.id));return JSON.stringify(rows)===JSON.stringify(expected);},expected);
   return expected;
  }
  async function assertPreparation(watched){
   const pair=lastReal.battlePairs.find(pair=>pair.includes(watched)),reverse=pair[1]===watched;
   const expected=pair.flatMap((id,side)=>lastReal.players.find(p=>p.id===id).units.filter(u=>u.x>=0).map(u=>({id:u.id,owner:id,x:reverse?(side===0?7-u.x:u.x):(side===0?u.x:7-u.x),y:reverse?(side===0?u.y:7-u.y):(side===0?7-u.y:u.y)}))).sort((a,b)=>a.id.localeCompare(b.id));
   await p.waitForFunction(expected=>{const rows=[...document.querySelectorAll('#cells [data-board-unit]')].map(e=>({id:e.dataset.boardUnit,owner:e.dataset.boardOwner,x:+e.dataset.x,y:+e.dataset.y})).sort((a,b)=>a.id.localeCompare(b.id));return JSON.stringify(rows)===JSON.stringify(expected);},expected);
   return expected;
  }
  await p.goto(url);console.log('CHECK',mode,'page loaded');await press('#practice');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));console.log('CHECK',mode,'room entered');await debugClick(p,'debug-pause');await debugPreset(p,'early');console.log('CHECK',mode,'preset loaded');
  const viewer=lastReal.players.find(p=>p.visibility==='self').id,enemy=lastReal.players.find(p=>p.id!==viewer).id,room=await p.locator('#room-code').textContent();
  assert.equal(await p.locator('#synergy-details,#synergy-reference,#enemy-synergies').count(),0);
  // Give the two teams different traits so scouting cannot accidentally repeat my composition.
  const field=p.locator('#cells [data-board-owner="'+viewer+'"]').first();await field.waitFor({state:'visible'});await p.locator('[data-bench-slot="1"][data-unit]').waitFor({state:'visible'});
  const source=await p.locator('[data-bench-slot="1"]').boundingBox(),target=await field.boundingBox();
  if(mode==='mobile'){const cdp=await context.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:source.x+source.width/2,y:source.y+source.height/2,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:target.x+target.width/2,y:target.y+target.height/2,id:1}]});await p.waitForTimeout(80);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  else{await p.mouse.move(source.x+source.width/2,source.y+source.height/2);await p.mouse.down();await p.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:8});await p.mouse.up();}
  await p.waitForFunction(()=>document.querySelector('#my-synergies [data-trait="arcane"]'));await watch(enemy);assert.equal(await p.locator('#my-synergies [data-trait="arcane"]').count(),0);assert.equal(await p.locator('#my-synergies [data-trait="bulwark"]').count(),1);
  const frames=mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]];
  for(const [width,height] of frames){
   await p.setViewportSize({width,height});await p.waitForTimeout(160);const units=await assertPreparation(enemy);assert.equal(units.length,2);
   for(const owner of [viewer,enemy]){await press(`#cells [data-board-owner="${owner}"]`);if(mode==='pc')await press('#selected-unit-content .selection img');assert.equal(await p.locator('#unit-dialog').getAttribute('data-read-only'),'true');assert.equal(await p.locator('#unit-title-sell').isVisible(),false);await closeUnit();}
   assert.equal(await p.locator(`[data-player-id="${enemy}"]`).getAttribute('aria-pressed'),'true');assert.equal(await p.locator('#room-code').textContent(),room);
   const geometry=await p.evaluate(()=>{const box=id=>document.getElementById(id).getBoundingClientRect().toJSON();return {banner:box('scout-banner'),back:box('scout-return'),equipment:box('equipment-toggle'),board:box('board-wrap'),bench:box('bench'),shop:box('pc-play-dock'),ranking:box('player-ranking'),overflow:document.documentElement.scrollWidth>innerWidth};});
   const overlaps=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
   assert.equal(geometry.overflow,false);assert.ok(geometry.banner.bottom<=geometry.board.y);assert.equal(overlaps(geometry.banner,geometry.equipment),false);assert.ok(geometry.back.width>=44&&geometry.back.height>=44);assert.ok(geometry.bench.bottom<=height&&!overlaps(geometry.bench,geometry.shop)&&geometry.ranking.x>=geometry.board.right,JSON.stringify({mode,width,height,geometry}));
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-prepare-opponent.png`,animations:'disabled'});prepareResults.push({mode,width,height,units,geometry});
  }
  await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));await assertBoard(enemy);
  const initial=structuredClone(lastReal);let moved=false,damaged=false;
  for(let i=0;i<12&&!(moved&&damaged);i++){await step();await assertBoard(enemy);moved=lastReal.fighters.some(f=>{const old=initial.fighters.find(v=>v.id===f.id);return old.x!==f.x||old.y!==f.y;});damaged=lastReal.fighters.some(f=>f.hp<f.maxHp);}
  assert.ok(moved&&damaged,'opponent viewpoint updates movement and actual damage');assert.equal(lastReal.phase,'combat');assert.ok(lastReal.events.some(e=>e.type==='attack'||e.type==='skillDamage'));
  for(const [width,height] of frames){
   await p.setViewportSize({width,height});await p.waitForTimeout(180);await watch(enemy);const watched=await assertBoard(enemy);
   assert.equal(watched.length,2);assert.equal(await p.locator('#synergy-heading').textContent(),'전투 조합');assert.equal(await p.locator('#my-synergies [data-trait="bulwark"]').count(),1);assert.equal(await p.locator('#my-synergies [data-trait="arcane"]').count(),0);
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-opponent.png`,animations:'disabled'});
   for(const owner of [viewer,enemy]){
    await press(`#cells [data-board-owner="${owner}"]`);if(mode==='pc')await press('#selected-unit-content img[role="button"]');await p.locator('#unit-dialog').waitFor({state:'visible'});
    assert.equal(await p.locator('#unit-dialog').getAttribute('data-read-only'),'true');assert.equal(await p.locator('#sell-unit').isVisible(),false);assert.doesNotMatch((await p.locator('#unit-detail .skill-status').allTextContents()).join(' '),/전투 시작 대기/);await closeUnit();
   }
   const beforeActions=actions;for(const id of ['ready','buy-experience','reroll'])assert.equal(await p.locator('#'+id).isDisabled(),true);await p.evaluate(()=>{for(const id of ['ready','buy-experience','reroll'])document.getElementById(id).onclick?.();});await p.waitForTimeout(80);assert.equal(actions,beforeActions);
   await press('#scout-return');const home=await assertBoard(viewer);assert.deepEqual(home.map(u=>u.id),watched.map(u=>u.id));for(const unit of watched){const other=home.find(u=>u.id===unit.id);assert.equal(unit.x,7-other.x);assert.equal(unit.y,7-other.y);assert.equal(unit.hp,other.hp);}
   const geometry=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return {board:r('board-wrap'),bench:r('bench'),shop:r('pc-play-dock'),ranking:r('player-ranking'),overflow:document.documentElement.scrollWidth>innerWidth,shopTargets:[...document.querySelectorAll('#shop-offers [data-offer]')].map(e=>e.getBoundingClientRect().toJSON())};});
   assert.equal(geometry.overflow,false);assert.ok(geometry.bench.bottom<=height&&geometry.ranking.right<=width&&geometry.ranking.x>=geometry.board.right);assert.ok(geometry.shopTargets.every(r=>r.width>=44&&r.height>=44));assert.equal(await p.locator('#room-code').textContent(),room);results.push({mode,width,height,watched,home,geometry});
  }
  extended=true;await p.waitForFunction(()=>document.querySelectorAll('.ranking-row').length===6);
  for(const id of ['scout-ui-c','scout-ui-d']){await watch(id);const units=await assertBoard(id);assert.equal(units.length,2);assert.ok(units.every(u=>u.owner==='scout-ui-c'||u.owner==='scout-ui-d'));await p.screenshot({path:`${shots}/${mode}-${id}-six-ui.png`,animations:'disabled'});sixResults.push({mode,id,units});}
  await step(100);await assertBoard('scout-ui-d');extended=false;await p.waitForFunction(()=>document.querySelectorAll('.ranking-row').length===2);await watch(enemy);await assertBoard(enemy);
  await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('라운드 결과'));await assertBoard(enemy);
  await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));const nextPrepare=await assertPreparation(enemy);assert.ok(nextPrepare.some(u=>u.owner===viewer)&&nextPrepare.some(u=>u.owner===enemy));assert.equal(await p.locator('#cells button[aria-label*="체력"]').count(),0);assert.equal(await p.locator('#synergy-heading').textContent(),'출전 조합');
  await context.close();console.log('PASS',mode,'real combat movement/damage from opponent viewpoint, both teams inspection, mirrored return/rotation, current opponent traits, read-only controls, six-player UI arena isolation, result/prepare transition');
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),sixPlayerData:'UI-only copies of the real two-player fight; gameplay server remains two-player',prepareResults,results,sixResults,errors},null,2));
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
