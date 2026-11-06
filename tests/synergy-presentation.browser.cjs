const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {decode}=require('@colyseus/schema'),{unpack}=require('@colyseus/msgpackr');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots=`docs/screenshots/refinements-${version}`,url='http://127.0.0.1:2695';
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2695',DEBUG_GAME:'0',NODE_ENV:'production'},stdio:'pipe'});fs.mkdirSync(shots,{recursive:true});
function snapshot(raw){if(typeof raw==='string')return;const b=Buffer.from(raw);if(b[0]!==13)return;const it={offset:1},type=decode.stringCheck(b,it)?decode.string(b,it):decode.number(b,it);if(type==='snapshot')return unpack(b,{start:it.offset});}
(async()=>{let browser;try{
 for(let i=0;i<90;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const results=[],errors=[];
 const focused=process.env.SYNERGY_QA_FOCUS==='narrow';
 for(const mode of focused?['mobile']:['pc','mobile']){
  const ctx=await browser.newContext({viewport:mode==='pc'?{width:1400,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  let last;await ctx.routeWebSocket('**/*',ws=>{const peer=ws.connectToServer();ws.onMessage(raw=>peer.send(raw));peer.onMessage(raw=>{const s=snapshot(raw);if(s)last=s;ws.send(raw);});});
  await ctx.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url,protocols){if(protocols&&typeof protocols==='object'&&!Array.isArray(protocols))throw new TypeError('Invalid browser protocols');super(url,protocols);}};});
  const p=await ctx.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));const own=()=>last.players.find(p=>p.visibility==='self');
  const press=async sel=>{const el=typeof sel==='string'?p.locator(sel):sel;await el.scrollIntoViewIfNeeded();return mode==='mobile'?el.tap():el.click();};
  const waitState=async check=>{for(let i=0;i<200&&!check();i++)await p.waitForTimeout(30);assert.ok(check(),'fresh server state');};
  async function closeUnit(){if(await p.locator('#unit-dialog').evaluate(e=>e.open))await press('#close-unit-dialog');}
  const frames=focused?[[480,320],[390,844]]:mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]];
  await p.goto(url);await press('#pvp-practice');await waitState(()=>last?.debug);await debugClick(p,'debug-pause');await waitState(()=>last.debug.paused);const room=last.roomId,bot=last.players.find(v=>v.bot).id;
  for(const [width,height] of frames){
   console.log('CHECK synergy presentation',mode,width,height);await p.setViewportSize({width,height});await p.waitForTimeout(120);assert.equal(last.roomId,room);assert.equal(await p.locator('html').getAttribute('data-screen-mode'),mode);
   if(last.phase==='matching')assert.equal(await p.locator(`[data-player-id="${bot}"]`).getAttribute('aria-pressed'),'true');
   if(await p.locator('#scout-return').isVisible())await press('#scout-return');
   const generation=last.debug.generation;await debugPreset(p,'synergy');await waitState(()=>last.debug.generation>generation&&last.phase==='prepare');
   await press(p.locator(`#cells [data-board-owner="${own().id}"]`).first());if(mode==='mobile')await p.locator('#unit-dialog').waitFor({state:'visible'});
   const detail=p.locator(mode==='pc'?'#selected-unit-content':'#unit-dialog');await p.waitForFunction(sel=>document.querySelector(sel).dataset.unitSide==='self',mode==='pc'?'#selected-unit-content':'#unit-dialog');
   assert.equal(await detail.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(22, 40, 63)');assert.doesNotMatch(await detail.locator('.selection .eyebrow').textContent(),/내 유닛|적 유닛|상대 ·/);
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-self.png`});await closeUnit();
   await press(`[data-player-id="${bot}"]`);await press(p.locator(`#cells [data-board-owner="${bot}"]`).first());if(mode==='mobile')await p.locator('#unit-dialog').waitFor({state:'visible'});
   await p.waitForFunction(sel=>document.querySelector(sel).dataset.unitSide==='enemy',mode==='pc'?'#selected-unit-content':'#unit-dialog');assert.equal(await detail.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(52, 33, 42)');assert.doesNotMatch(await detail.locator('.selection .eyebrow').textContent(),/내 유닛|적 유닛|상대 ·/);
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-enemy.png`});await closeUnit();
   assert.equal(await p.locator('#my-synergies .synergy-state').count(),0);assert.doesNotMatch(await p.locator('#my-synergies').textContent(),/활성/);
   const trait=p.locator('#my-synergies [data-trait="bulwark"]');
   const count=Number(await trait.getAttribute('data-synergy-count'));assert.ok(count===1||count===2);
   await checkTiers(trait,count);await press(trait);const tip=p.locator('#game-help-tooltip');await tip.waitFor({state:'visible'});
   await checkTiers(tip,count,true);assert.match(await tip.textContent(),/수호 유닛의 강화 기본 체력 \+15%\/30%\/50%/);
   const t=await tip.boundingBox();assert.ok(t.x>=0&&t.y>=0&&t.x+t.width<=width&&t.y+t.height<=height);
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-trait.png`});await press(trait);await tip.waitFor({state:'hidden'});
   let gold=own().gold,revision=own().shopRevision,xp=own().experienceRevision;
   await press('#buy-experience');await waitState(()=>own().experienceRevision>xp);assert.equal(own().gold,gold-4);gold=own().gold;
   await press('#reroll');await waitState(()=>own().shopRevision>revision);assert.equal(own().gold,gold-5);
   await press('#ready');await waitState(()=>last.phase==='matching');await p.waitForFunction(()=>document.getElementById('phase').textContent.startsWith('매칭'));const deadline=last.deadline,gameNow=last.gameNow;assert.equal(deadline-gameNow,5000);
   for(const id of ['buy-experience','reroll','ready'])assert.equal(await p.locator('#'+id).isEnabled(),true);
   gold=own().gold;xp=own().experienceRevision;await press('#buy-experience');await waitState(()=>own().experienceRevision>xp);assert.equal(own().gold,gold-4);
   gold=own().gold;revision=own().shopRevision;await press('#reroll');await waitState(()=>own().shopRevision>revision);assert.equal(own().gold,gold-5);
   await press('#ready');await p.waitForTimeout(150);assert.equal(last.deadline,deadline);assert.equal(last.phase,'matching');assert.equal(last.gameNow,gameNow);for(const id of ['buy-experience','reroll','ready'])assert.equal(await p.locator('#'+id).isEnabled(),true);
   assert.equal(await p.locator(`[data-player-id="${bot}"]`).getAttribute('aria-pressed'),'true');assert.equal(await p.locator('#shop-offers [data-offer][aria-disabled="false"]').count(),0);
   const g=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return{overflow:document.documentElement.scrollWidth>innerWidth,board:r('board-wrap'),bench:r('bench'),shop:r('pc-play-dock'),rank:r('player-ranking'),targets:[...document.querySelectorAll('.ranking-row,#buy-experience,#reroll,#ready,#my-synergies button')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().toJSON())};});
   assert.equal(g.overflow,false);assert.ok(g.targets.every(t=>t.width>=44&&t.height>=44));const overlap=(a,b)=>a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1;for(const [a,b] of [['board','bench'],['board','shop'],['board','rank'],['bench','shop'],['bench','rank'],['shop','rank']])assert.equal(overlap(g[a],g[b]),false,`${a}/${b}`);
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-matching.png`});results.push({mode,width,height,geometry:g,selfColor:'dark blue',enemyColor:'dark red',noOwnerLabels:true,noActiveLabel:true,compactThresholds:[2,4,6],thresholdAndEffectColors:true,scoutEconomyAndReady:true,matchingEconomyAndReady:true,matchingDeadlineUnchanged:true,rotationPreserved:true});
  }
  // A real placement changes both milestone and tooltip colors immediately.
  await press('#scout-return');await debugPreset(p,'synergy');
  await p.setViewportSize(mode==='mobile'?{width:844,height:390}:{width:1400,height:1000});
  await p.waitForTimeout(150);
  const warden=own().units.find(u=>u.kind==='warden');
  const origin=await p.locator(`#cells button[data-board-unit="${warden.id}"]`).evaluate(e=>`#cells button[data-x="${e.dataset.x}"][data-y="${e.dataset.y}"]`);
  const cdp=mode==='mobile'?await ctx.newCDPSession(p):null;
  async function drag(source,target){
   const a=await p.locator(source).boundingBox(),b=await p.locator(target).boundingBox();assert.ok(a&&b);
   const start={x:a.x+a.width/2,y:a.y+a.height/2},end={x:b.x+b.width/2,y:b.y+b.height/2};
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});await p.waitForTimeout(80);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   else{await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(end.x,end.y,{steps:10});await p.mouse.up();}
  }
  await drag(origin,'[data-bench-slot="0"]');await waitState(()=>own().units.find(u=>u.id===warden.id).x<0);
  const liveTrait=p.locator('#my-synergies [data-trait="bulwark"]');await checkTiers(liveTrait,1);await press(liveTrait);await p.locator('#game-help-tooltip').waitFor({state:'visible'});await checkTiers(p.locator('#game-help-tooltip'),1,true);await press(liveTrait);
  await drag('[data-bench-slot="0"]',origin);await waitState(()=>own().units.find(u=>u.id===warden.id).x>=0);await checkTiers(liveTrait,2);
  await press(liveTrait);await p.locator('#game-help-tooltip').waitFor({state:'visible'});await checkTiers(p.locator('#game-help-tooltip'),2,true);await press(liveTrait);
  results.push({mode,livePlacementAndColorUpdate:true,landscapeTouch:mode==='mobile'});
  await press(`[data-player-id="${bot}"]`);await press('#ready');await waitState(()=>last.phase==='matching');
  await debugClick(p,'debug-next');await waitState(()=>last.phase==='combat');assert.equal(await p.locator(`[data-player-id="${bot}"]`).getAttribute('aria-pressed'),'true');
  await p.reload();await p.locator('#game-view').waitFor({state:'visible'});assert.equal(last.roomId,room);await press('#leave');await p.locator('#lobby').waitFor({state:'visible'});await ctx.close();
 }
 // Isolated edge-count renderer cases complement the real 18-kind roster checks.
 const {synergyCards,synergyHelpHTML}=await import('../client/synergy-ui.ts');
 const fixture=await browser.newPage({viewport:{width:390,height:844}});
 const stylesheet=fs.readFileSync('client/style.css','utf8');
 const fixtureResults=[];
 for(const width of [1400,320,480])for(const count of [1,2,3,4,5,6,7]){
  await fixture.setViewportSize({width,height:740});
  await fixture.setContent(`<style>${stylesheet}</style><section id="synergy-panel" style="width:min(100%,280px);box-sizing:border-box"><div id="my-synergies">${synergyCards([{trait:'bulwark',count,active:count>=2}])}</div></section><div id="game-help-tooltip" class="help-tooltip" style="position:relative;left:0;top:0">${synergyHelpHTML('bulwark',count)}</div>`);
  await checkTiers(fixture.locator('#my-synergies'),count);await checkTiers(fixture.locator('#game-help-tooltip'),count,true);
  assert.equal(await fixture.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  fixtureResults.push({width,count,thresholds:[2,4,6],current:[2,4,6].filter(n=>count>=n).at(-1)??null});
  if(count===4)await fixture.screenshot({path:`${shots}/renderer-fixture-${width}-4-types.png`});
 }
 await fixture.close();assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),focused,results,fixtureResults,errors,source:'Actual one-human/five-bot rooms; unmodified authoritative snapshots. Separate renderer fixtures cover edge counts; the actual catalogue contains eighteen kinds.'},null,2));console.log(`PASS synergy presentation: ${results.filter(r=>r.geometry).length} layouts/rotation, dark own/enemy colors, compact thresholds and matching effect colors, 21 renderer cases, scout/matching economy, reload`);
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});

async function checkTiers(root,count,effects=false){
 if(!effects){assert.equal(await root.locator('.synergy-count-now').textContent(),String(count));assert.equal(await root.locator('.synergy-thresholds').textContent(),'2/4/6');}
 for(const kind of effects?['synergy-effect-value']:['synergy-threshold'])for(const threshold of [2,4,6]){
  const current=[2,4,6].filter(n=>n<=count).at(-1),value=root.locator('.'+kind+'[data-threshold="'+threshold+'"]');
  assert.equal(await value.getAttribute('data-current'),String(current===threshold));assert.equal(await value.evaluate(e=>getComputedStyle(e).color),current===threshold?'rgb(255, 255, 255)':'rgb(89, 98, 114)');
 }
 if(effects){assert.match(await root.textContent(),/증가/);assert.doesNotMatch(await root.textContent(),/조합|종|[+−]|같은 계열의 서로 다른 종류만 셉니다/);assert.equal(await root.locator('.synergy-thresholds').count(),0);}
 else{const now=await root.locator('.synergy-count-now').boundingBox(),name=await root.locator('.synergy-name strong').boundingBox(),tiers=await root.locator('.synergy-thresholds').boundingBox();assert.ok(now.x+now.width<=name.x);assert.ok(tiers.width<50);assert.equal(await root.locator('.synergy-bonus').count(),0);assert.ok(await root.evaluate(e=>e.scrollWidth<=e.clientWidth));}
}
