const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {Client}=require('colyseus.js');
const {decode}=require('@colyseus/schema'),{unpack}=require('@colyseus/msgpackr');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots=`docs/screenshots/pvp-matching-${version}`,url='http://127.0.0.1:2676';
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2676',NODE_ENV:'development'},stdio:'pipe'});fs.mkdirSync(shots,{recursive:true});
function snapshot(raw){if(typeof raw==='string')return;const bytes=Buffer.from(raw);if(bytes[0]!==13)return;const it={offset:1},type=decode.stringCheck(bytes,it)?decode.string(bytes,it):decode.number(bytes,it);if(type==='snapshot')return unpack(bytes,{start:it.offset});}
const delay=ms=>new Promise(r=>setTimeout(r,ms)),own=s=>s.players.find(p=>p.visibility==='self');
(async()=>{let browser;try{
 let healthy=false;for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok){healthy=true;break;}}catch{}await delay(100);}assert.ok(healthy);
 browser=await chromium.launch(browserOptions());const errors=[],results=[];
 for(const mode of ['pc','mobile'])for(const [width,height] of mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]]){
  if(process.env.PVP_QA_SIZES&&!process.env.PVP_QA_SIZES.split(',').includes(`${width}x${height}`))continue;
  console.log('CHECK real PvP',mode,width,height);let opponent,opponentState,last;
  const context=await browser.newContext({viewport:{width,height},isMobile:mode==='mobile',hasTouch:mode==='mobile',permissions:['clipboard-read','clipboard-write'],userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  try{
   await context.routeWebSocket('**/*',ws=>{const peer=ws.connectToServer();ws.onMessage(raw=>peer.send(raw));peer.onMessage(raw=>{const s=snapshot(raw);if(s)last=s;ws.send(raw);});});
   await context.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url,protocols){if(protocols&&typeof protocols==='object'&&!Array.isArray(protocols))throw new TypeError('Browser WebSocket protocols must be a string or array');super(url,protocols);}};});
   const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
   const press=async el=>{if(typeof el==='string')el=p.locator(el);return mode==='mobile'?el.tap():el.click();};
   async function waitFor(condition){for(let i=0;i<300&&!condition();i++)await delay(25);assert.ok(condition(),'server state received');}
   async function closeUnit(){if(await p.locator('#unit-dialog').evaluate(e=>e.open))await press('#close-unit-dialog');}
   async function command(action,condition){opponent.send('action',action);await waitFor(()=>condition(opponentState));}
   async function watch(){await press(`[data-player-id="${opponent.sessionId}"]`);await p.waitForFunction(()=>document.body.classList.contains('scouting-player'));}
   function privatePayload(){assert.equal(last.opponentId,null);assert.deepEqual(last.battlePairs,[]);assert.deepEqual(last.fighters,[]);assert.deepEqual(last.events,[]);const foreign=last.players.find(p=>p.visibility==='opponent');assert.equal(foreign.rosterVisible,false);assert.deepEqual(foreign.units,[]);assert.deepEqual(foreign.bench,[]);assert.deepEqual(foreign.inventory,[]);}
   async function purchase(){const before=own(last),offer=before.shop.find(o=>!o.sold&&o.cost<=before.gold);assert.ok(offer);await require('./ui-helpers.cjs').buyOffer(p,p.locator(`#shop-offers [data-offer="${offer.id}"]`));await waitFor(()=>own(last).gold===before.gold-offer.cost&&own(last).shop.find(o=>o.id===offer.id)?.sold);assert.equal(await p.locator(`[data-player-id="${opponent.sessionId}"]`).getAttribute('aria-pressed'),'true');return offer;}
   await p.goto(url);assert.equal(await p.locator('#code').getAttribute('maxlength'),'4');await press('#create');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('상대 입장'));
   const code=last.roomId;assert.match(code,/^[A-F0-9]{4}$/);await press('#room-code-copy');assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),code);
   opponent=await new Client(url).joinById(code,{name:'실제 상대'});opponent.onMessage('snapshot',s=>opponentState=s);opponent.onMessage('notice',n=>errors.push(n));await waitFor(()=>opponentState?.phase==='prepare'&&last?.phase==='prepare');
   // Reach the first player duel through the production intro, without rewards
   // or server-state overrides. This suite specifically exercises PvP privacy.
   for(let round=1;round<=3;round++){
    await waitFor(()=>last.round===round&&last.phase==='prepare'&&opponentState.round===round&&opponentState.phase==='prepare');
    opponent.send('action',{type:'ready'});await press('#ready');await waitFor(()=>last.round===round&&last.phase==='result');
    await waitFor(()=>last.round===round+1&&last.phase==='prepare');
   }
   for(let i=0;i<2;i++){const peer=own(opponentState),offer=peer.shop.find(o=>!o.sold);await command({type:'buy',offerId:offer.id,revision:peer.shopRevision},s=>own(s).units.length===i+1);}
   const enemy=own(opponentState).units[0];await command({type:'place',unitId:enemy.id,x:0,y:0},s=>own(s).units[0].x===0);await delay(120);
   await watch();privatePayload();assert.equal(await p.locator('#cells [data-board-unit]').count(),0);assert.equal(await p.locator('#units [data-unit]').count(),0);assert.equal(await p.locator('[data-opponent="true"]').count(),0);assert.match(await p.locator('#bench-count').textContent(),/비공개/);
   if(mode==='mobile'&&width===390){for(const viewport of [{width:844,height:390},{width:390,height:844}]){await p.setViewportSize(viewport);await delay(150);assert.equal(await p.locator('#room-code').textContent(),code);assert.equal(await p.locator('html').getAttribute('data-screen-mode'),'mobile');assert.equal(await p.locator(`[data-player-id="${opponent.sessionId}"]`).getAttribute('aria-pressed'),'true');privatePayload();}}
   const preparePurchase=await purchase();assert.equal(own(last).units.length,1);assert.equal(own(last).units[0].x,-1);assert.equal(own(opponentState).units.length,2);privatePayload();
   await press('#scout-return');const unit=own(last).units[0],source=p.locator(`[data-bench-slot="${unit.benchSlot}"]`);await source.scrollIntoViewIfNeeded();const a=await source.boundingBox(),b=await p.locator('#cells button[data-x="2"][data-y="6"]').boundingBox();
   if(mode==='mobile'){const cdp=await context.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});await delay(60);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else{await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await p.mouse.up();}
   await waitFor(()=>own(last).units[0].x===2);await watch();assert.equal(await p.locator('#cells [data-board-unit]').count(),0);await p.screenshot({path:`${shots}/${mode}-${width}-${height}-prepare.png`,animations:'disabled'});
   await press('#scout-return');await command({type:'ready'},s=>own(s).ready);await press('#ready');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('매칭'));
   const matching=structuredClone(last);assert.equal(matching.phase,'matching');assert.ok(matching.deadline-matching.gameNow>=4500);await watch();privatePayload();assert.equal(await p.locator('#shop-offers [data-offer][aria-disabled="false"]').count(),0);await p.screenshot({path:`${shots}/${mode}-${width}-${height}-matching.png`,animations:'disabled'});await delay(700);assert.equal(last.phase,'matching');
   await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'),null,{timeout:8000});await waitFor(()=>last.phase==='combat');assert.ok(last.gameNow>=matching.deadline);assert.equal(last.opponentId,opponent.sessionId);
   await p.locator(`#cells [data-board-owner="${opponent.sessionId}"]`).waitFor();assert.equal(await p.locator('#cells [data-board-unit]').count(),2);assert.equal(await p.locator('#units [data-unit]').count(),1);
   const reserve=own(opponentState).units.find(u=>u.x<0);await press(`#units [data-unit="${reserve.id}"]`);if(mode==='mobile'){await p.locator('#unit-dialog').waitFor({state:'visible'});assert.equal(await p.locator('#unit-dialog').getAttribute('data-read-only'),'true');await closeUnit();}
   assert.equal(await p.locator(`#units [data-unit="${reserve.id}"]`).getAttribute('aria-pressed'),'true');const fighters=last.fighters.map(f=>[f.id,f.rank,f.maxHp,f.equipment]),combatPurchase=await purchase();assert.deepEqual(last.fighters.map(f=>[f.id,f.rank,f.maxHp,f.equipment]),fighters);assert.equal(await p.locator(`#units [data-unit="${reserve.id}"]`).getAttribute('aria-pressed'),'true');for(const id of ['reroll','buy-experience','ready'])assert.equal(await p.locator('#'+id).isDisabled(),true);
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-combat.png`,animations:'disabled'});
   const geometry=await p.evaluate(()=>{const box=id=>document.getElementById(id).getBoundingClientRect().toJSON();return {board:box('board-wrap'),bench:box('bench'),shop:box('pc-play-dock'),ranking:box('player-ranking'),banner:box('scout-banner'),overflow:document.documentElement.scrollWidth>innerWidth,targets:[...document.querySelectorAll('.ranking-row,#shop-offers [data-offer],#mobile-info-open,#history-toggle,#room-code-copy,#room-code-toggle')].filter(e=>e.getClientRects().length).map(e=>({id:e.id,class:e.className,...e.getBoundingClientRect().toJSON()}))};});
   const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;assert.equal(geometry.overflow,false);assert.ok(geometry.banner.bottom<=geometry.board.y);assert.ok(geometry.bench.bottom<=height);assert.ok(geometry.ranking.x>=geometry.board.right);assert.ok(!overlap(geometry.bench,geometry.shop)&&!overlap(geometry.board,geometry.shop));assert.ok(geometry.targets.every(r=>r.width>=44&&r.height>=44),JSON.stringify({mode,width,height,targets:geometry.targets.filter(r=>r.width<44||r.height<44)}));
   results.push({mode,width,height,code,preparePurchase,combatPurchase,matchingDuration:5000,matchingDeadline:matching.deadline,combatNow:last.gameNow,geometry});fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),fixture:'Actual two-player PvP server; received snapshots are unchanged',results,errors},null,2));console.log('PASS real PvP',mode,width,height);
  }finally{await opponent?.leave();await context.close();}
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
