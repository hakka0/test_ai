const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {decode}=require('@colyseus/schema'),{unpack}=require('@colyseus/msgpackr');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots=`docs/screenshots/bot-practice-${version}`,url='http://127.0.0.1:2691';
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2691',DEBUG_GAME:'0',NODE_ENV:'production'},stdio:'pipe'});fs.mkdirSync(shots,{recursive:true});
function snapshot(raw,wanted='snapshot'){if(typeof raw==='string')return;const b=Buffer.from(raw);if(b[0]!==13)return;const it={offset:1},type=decode.stringCheck(b,it)?decode.string(b,it):decode.number(b,it);if(type===wanted)return unpack(b,{start:it.offset});}
(async()=>{let browser;try{
 for(let i=0;i<80;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const results=[],errors=[];
 for(const mode of ['pc','mobile']){
  const ctx=await browser.newContext({viewport:mode==='pc'?{width:1400,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  let last;const notices=[];await ctx.routeWebSocket('**/*',ws=>{const peer=ws.connectToServer();ws.onMessage(raw=>peer.send(raw));peer.onMessage(raw=>{const s=snapshot(raw);if(s)last=s;const n=snapshot(raw,'notice');if(n)notices.push(n);ws.send(raw);});});
  await ctx.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url,protocols){if(protocols&&typeof protocols==='object'&&!Array.isArray(protocols))throw new TypeError('Invalid browser protocols');super(url,protocols);}};});
  const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));const own=()=>last.players.find(p=>p.visibility==='self');
  const press=async sel=>{const el=typeof sel==='string'?p.locator(sel):sel;await el.scrollIntoViewIfNeeded();return mode==='mobile'?el.tap():el.click();};
  const waitState=async check=>{for(let i=0;i<160&&!check();i++)await p.waitForTimeout(30);assert.ok(check(),'fresh server state');};
  async function closeUnit(){if(await p.locator('#unit-dialog').evaluate(e=>e.open))await press('#close-unit-dialog');}
  await p.goto(url);await p.locator('#pvp-practice').scrollIntoViewIfNeeded();const home=await p.locator('#pvp-practice').boundingBox();assert.ok(home.width>=44&&home.height>=44);await p.screenshot({path:`${shots}/${mode}-home.png`,fullPage:true});await press('#pvp-practice');await waitState(()=>last?.debug&&last.players.length===6);
  assert.equal(last.mode,'botPractice');assert.equal(await p.locator('.ranking-row').count(),6);await debugClick(p,'debug-pause');const room=last.roomId;
  await debugPreset(p,'early');assert.ok(last.players.slice(1).every(v=>v.rosterVisible===true&&v.units.length>0&&v.bench.length>0));
  await debugClick(p,'debug-next');await waitState(()=>last.phase==='matching');assert.deepEqual(last.battlePairs,[]);await debugClick(p,'debug-next');await waitState(()=>last.phase==='combat');
  const firstBot=last.players.find(v=>v.bot).id;await press(`[data-player-id="${firstBot}"]`);assert.equal(await p.locator('#units [data-unit]').count(),2);await press('#scout-return');
  await debugPreset(p,'mid');await debugClick(p,'debug-next');await debugClick(p,'debug-next');await waitState(()=>last.phase==='combat'&&last.fighters.length===42);
  const beforeStep=last.gameNow;await debugClick(p,'debug-second');await waitState(()=>last.gameNow===beforeStep+1000);const savedFighters=JSON.stringify(last.fighters);await debugClick(p,'debug-save');await waitState(()=>last.debug.hasCheckpoint);const watched=last.players.find(v=>v.bot&&v.id!==last.opponentId).id;
  await press(`[data-player-id="${watched}"]`);
  const frames=mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]];
  for(const [width,height] of frames){
   console.log('CHECK bots',mode,width,height);await closeUnit();await p.setViewportSize({width,height});await p.waitForTimeout(150);
   assert.equal(last.roomId,room);assert.equal(await p.locator('html').getAttribute('data-screen-mode'),mode);assert.equal(await p.locator(`[data-player-id="${watched}"]`).getAttribute('aria-pressed'),'true');assert.equal(await p.locator('.ranking-row').count(),6);
   const pair=last.battlePairs.find(b=>b.includes(watched));assert.equal(pair.length,2);const owners=await p.locator('#cells [data-board-owner]').evaluateAll(es=>[...new Set(es.map(e=>e.dataset.boardOwner))]);assert.ok(owners.length&&owners.every(id=>pair.includes(id)));
   const cell=p.locator('#cells [data-board-owner]').first();await press(cell);const detail=p.locator(mode==='pc'?'#selected-unit-content':'#unit-detail');await detail.locator('h2').waitFor({state:'visible'});await closeUnit();
   const geometry=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return{overflow:document.documentElement.scrollWidth>innerWidth,board:r('board-wrap'),bench:r('bench'),shop:r('pc-play-dock'),rank:r('player-ranking'),targets:[...document.querySelectorAll('.ranking-row,#shop-offers [data-offer]')].map(e=>e.getBoundingClientRect().toJSON())};});
   assert.equal(geometry.overflow,false);assert.ok(geometry.targets.every(t=>t.width>=44&&t.height>=44));const overlap=(a,b)=>a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1;for(const [a,b] of [['board','bench'],['board','shop'],['board','rank'],['bench','shop'],['bench','rank'],['shop','rank']])assert.equal(overlap(geometry[a],geometry[b]),false,`${a}/${b}`);
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-scouting.png`});results.push({mode,width,height,geometry,realSixParticipants:true,scoutingPair:pair,rotationPreserved:true,unitDetails:true});
  }
  // Every rank points to its own actual two-sided battlefield, including other pairs.
  for(const bot of last.players.filter(v=>v.bot)){await press(`[data-player-id="${bot.id}"]`);const pair=last.battlePairs.find(b=>b.includes(bot.id));const owners=await p.locator('#cells [data-board-owner]').evaluateAll(es=>[...new Set(es.map(e=>e.dataset.boardOwner))]);assert.ok(owners.every(id=>pair.includes(id)));}
  const offer=own().shop.find(o=>!o.sold&&o.cost<=own().gold),gold=own().gold;assert.ok(offer);assert.equal(await p.locator(`[data-offer="${offer.id}"]`).isEnabled(),true);await require('./ui-helpers.cjs').buyOffer(p,p.locator(`[data-offer="${offer.id}"]`));try{await waitState(()=>own().gold===gold-offer.cost);}catch(e){throw new Error(JSON.stringify({mode,offer,gold,after:own().gold,phase:last.phase,notices}));}assert.equal(last.mode,'botPractice');
  await press('#scout-return');await debugClick(p,'debug-next');await waitState(()=>last.phase==='result');assert.equal(last.roundHistory.at(-1).players.length,6);
  await press('#history-toggle');await p.locator('#history-panel').waitFor({state:'visible'});assert.equal(await p.locator('#history-detail-body .history-player-result').count(),2);await press(mode==='pc'?'#inspection-unit-tab':'#combat-sheet-close');
  await debugClick(p,'debug-load');await waitState(()=>last.phase==='combat');assert.ok(JSON.stringify(last.fighters)===savedFighters,'restored fighters equal checkpoint');assert.equal(last.players.length,6);
  await p.reload();await waitState(()=>last.players.some(v=>v.visibility==='self'&&v.connected));await p.locator('#game-view').waitFor({state:'visible'});assert.equal(last.roomId,room);assert.equal(last.mode,'botPractice');assert.equal(await p.locator('.ranking-row').count(),6);
  await press('#leave');await p.locator('#lobby').waitFor({state:'visible'});assert.equal(await p.locator('#pvp-practice').isDisabled(),false);await ctx.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,errors,source:'Actual one-human/five-server-bot rooms; unmodified server snapshots; no ranking fixtures.'},null,2));console.log('PASS bot practice: nine layouts/rotation, all five scouting views, preparation visibility/matching, bench/details, own purchases while scouting, history/save/load/reload/lobby');
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
