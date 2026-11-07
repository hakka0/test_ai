const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {decode}=require('@colyseus/schema'),{unpack}=require('@colyseus/msgpackr');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots=`docs/screenshots/expanded-${version}`,url='http://127.0.0.1:2696';
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2696',DEBUG_GAME:'0',NODE_ENV:'production'},stdio:'pipe'});
fs.mkdirSync(shots,{recursive:true});
function snapshot(raw){if(typeof raw==='string')return;const b=Buffer.from(raw);if(b[0]!==13)return;const it={offset:1},type=decode.stringCheck(b,it)?decode.string(b,it):decode.number(b,it);if(type==='snapshot')return unpack(b,{start:it.offset});}
(async()=>{let browser;try{
 for(let i=0;i<90;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const {UNITS,UNIT_KINDS,CORE_UNIT_KINDS}=await import('../shared/catalog.ts');
 browser=await chromium.launch(browserOptions());const results=[],errors=[],presets=['synergyBulwark','synergyScout','synergyArcane'],traits=['bulwark','scout','arcane'];let step=0;
 for(const mode of ['pc','mobile']){
  const ctx=await browser.newContext({viewport:mode==='pc'?{width:1400,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36'});
  let last;await ctx.routeWebSocket('**/*',ws=>{const peer=ws.connectToServer();ws.onMessage(raw=>peer.send(raw));peer.onMessage(raw=>{const s=snapshot(raw);if(s)last=s;ws.send(raw);});});
  await ctx.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url,protocols){if(protocols&&typeof protocols==='object'&&!Array.isArray(protocols))throw new TypeError('Invalid browser protocols');super(url,protocols);}};});
  const p=await ctx.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().includes('/units/')&&r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  const own=()=>last.players.find(v=>v.visibility==='self');
  const press=async target=>{const e=typeof target==='string'?p.locator(target):target;await e.scrollIntoViewIfNeeded();await(mode==='mobile'?e.tap():e.click());};
  const fresh=async fn=>{for(let i=0;i<200&&!fn();i++)await p.waitForTimeout(30);assert.ok(fn(),'authoritative state update');};
  const reset=async preset=>{const g=last.debug.generation;await debugPreset(p,preset);await fresh(()=>last.debug.generation>g&&last.phase==='prepare');};
  await p.goto(url);await press('#pvp-practice');await fresh(()=>last?.debug);await debugClick(p,'debug-pause');await fresh(()=>last.debug.paused);
  const room=last.roomId,bot=last.players.find(v=>v.bot).id;
  const assets=await p.evaluate(async entries=>Promise.all(entries.map(async([kind,src])=>{const img=new Image();img.src=src;await img.decode();return{kind,width:img.naturalWidth,height:img.naturalHeight};})),UNIT_KINDS.map(k=>[k,UNITS[k].image]));
  assert.equal(assets.length,20);assert.ok(assets.filter(a=>!CORE_UNIT_KINDS.includes(a.kind)).every(a=>a.width===128&&a.height===128));
  const frames=mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]];
  for(const [width,height] of frames){
   console.log('CHECK expanded catalogue',mode,width,height);await p.setViewportSize({width,height});await p.waitForTimeout(150);
   assert.equal(last.roomId,room);assert.equal(await p.locator('html').getAttribute('data-screen-mode'),mode);
   if(step>0&&await p.locator('#scout-return').isVisible()){assert.equal(await p.locator(`[data-player-id="${bot}"]`).getAttribute('aria-pressed'),'true');await press('#scout-return');}
   const i=step++%3;await reset(presets[i]);assert.equal(own().units.length,20);assert.equal(new Set(own().units.map(u=>u.kind)).size,20);
   const u=own().units.find(u=>u.x>=0&&!CORE_UNIT_KINDS.includes(u.kind));await press(`#cells [data-board-unit="${u.id}"]`);
   const detail=p.locator(mode==='pc'?'#selected-unit-content':'#unit-dialog');await detail.locator('.selection h2').filter({hasText:UNITS[u.kind].name}).waitFor();assert.equal(await detail.locator('.skill-card').count(),1);
   if(mode==='mobile')await press('#close-unit-dialog');
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-interface.png`});
   await press(`[data-player-id="${bot}"]`);
   const card=p.locator(`#my-synergies [data-trait="${traits[i]}"]`);await assertColors(card,[5,8,7][i]);await press(card);
   const tip=p.locator('#game-help-tooltip');await tip.waitFor({state:'visible'});await assertColors(tip,[5,8,7][i],true);
   const box=await tip.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-${traits[i]}.png`});await press(card);await tip.waitFor({state:'hidden'});
   const g=await p.evaluate(()=>{if(document.getElementById('player-ranking').parentElement.id!=='game-view')throw new Error('ranking must remain independent');for(const e of document.querySelectorAll('#units [data-bench-slot]')){const b=e.getBoundingClientRect();if(Math.abs(b.width-b.height)>1)throw new Error('reserve slots must remain square');}const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return{overflow:document.documentElement.scrollWidth>innerWidth,board:r('board-wrap'),bench:r('bench'),shop:r('pc-dock-reserve'),rank:r('player-ranking'),targets:[...document.querySelectorAll('.ranking-row,#shop-offers [data-offer],#my-synergies button')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().toJSON())};});
   assert.equal(g.overflow,false);assert.ok(g.targets.every(v=>v.width>=44&&v.height>=44));const overlap=(a,b)=>a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1;for(const [a,b] of [['board','bench'],['board','shop'],['board','rank'],['bench','shop'],['bench','rank'],['shop','rank']])assert.equal(overlap(g[a],g[b]),false,`${a}/${b}`);
   const headerBottom=await p.locator('header').evaluate(e=>e.getBoundingClientRect().bottom);
   if(mode==='pc'){
    assert.equal(await p.locator('.matchbar').evaluate(e=>e.parentElement.id),'game-view','shared status spans the PC workspace');
    assert.equal(await p.locator('#pc-bench').evaluate(e=>e.parentElement.id),'pc-play-dock','PC reserves belong to the supply station');
    assert.ok(g.bench.bottom<=g.shop.y,'PC reserves stay above the shop row');
    assert.ok(await p.locator('#units [data-bench-slot]').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect(),frame=e.closest('#bench').getBoundingClientRect();return r.top>=frame.top&&r.bottom<=frame.bottom-5;})),'PC reserve cards stay inside the frame with bottom padding');
   }else assert.equal(await p.locator('#pc-bench').evaluate(e=>e.parentElement.classList.contains('arena-panel')),true,'mobile reserves stay with the field');
   assert.ok(g.rank.y>=headerBottom,'ranking stays below header controls');
   assert.ok(g.rank.bottom<=height,'ranking stays within the viewport');
   if(mode==='mobile'&&width===480){
    const rail=await p.locator('#ranking-list').evaluate(e=>{e.scrollTop=e.scrollHeight;const last=e.lastElementChild.getBoundingClientRect(),r=e.getBoundingClientRect();return {scroll:e.scrollTop,inside:last.top>=r.top&&last.bottom<=r.bottom+1};});
    assert.ok(rail.scroll>0&&rail.inside,'six-player ranking scrolls inside the short landscape rail');
   }
   results.push({mode,width,height,preset:presets[i],actualTypes:20,focusedDeployed:[5,8,7][i],reserves:12,geometry:g,assets:assets.length,countBeforeName:true,onlyCurrentTierEmphasized:[4,6,6][i],helpExplanationRemoved:true});
  }
  // Real exchanges allow tier testing even with all twelve reserve slots filled.
  await press('#scout-return');await reset('synergyBulwark');await p.setViewportSize(mode==='pc'?{width:1400,height:1000}:{width:844,height:390});await p.waitForTimeout(150);
  const focused=own().units.filter(u=>u.x>=0),cdp=mode==='mobile'?await ctx.newCDPSession(p):null;
  for(let i=0;i<4;i++){
   const a=await p.locator(`#cells [data-board-unit="${focused[i].id}"]`).boundingBox(),b=await p.locator(`[data-bench-slot="${i}"]`).boundingBox();assert.ok(a&&b);
   const from={x:a.x+a.width/2,y:a.y+a.height/2},to={x:b.x+b.width/2,y:b.y+b.height/2};
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...to,id:1}]});await p.waitForTimeout(80);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   else{await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(to.x,to.y,{steps:10});await p.mouse.up();}
   await fresh(()=>own().units.find(u=>u.id===focused[i].id).x<0);
   const count=4-i;await p.waitForFunction(n=>document.querySelector('#my-synergies [data-trait="bulwark"]').dataset.synergyCount===String(n),count);
   const card=p.locator('#my-synergies [data-trait="bulwark"]');await assertColors(card,count);await press(card);await p.locator('#game-help-tooltip').waitFor({state:'visible'});await assertColors(p.locator('#game-help-tooltip'),count,true);await p.screenshot({path:`${shots}/${mode}-actual-${count}-bulwark.png`});await press(card);
  }
  await press('#ready');await fresh(()=>last.phase==='matching');await debugClick(p,'debug-next');await fresh(()=>last.phase==='combat');assert.equal(last.fighters.length,48);
  await debugClick(p,'debug-second');await p.screenshot({path:`${shots}/${mode}-combat.png`});await p.reload();await p.locator('#game-view').waitFor({state:'visible'});assert.equal(last.roomId,room);await press('#leave');await p.locator('#lobby').waitFor({state:'visible'});
  results.push({mode,actualTierExchanges:[5,4,3,2,1],mobileLandscapeTouch:mode==='mobile',combatFighters:48,reload:true});await ctx.close();
 }
 // Future fourth-tier presentation only: no server, units or effects are changed.
 const {TRAITS}=await import('../shared/synergy.ts'),{synergyCards}=await import('../client/synergy-ui.ts');
 const preview=await browser.newPage({viewport:{width:320,height:740}}),tiers=TRAITS.bulwark.tiers;let futureTierFixture;
 tiers.push({threshold:8,description:'향후 4단계 표시 확인용',bonus:{}});
 try{
  await preview.setContent(`<style>${fs.readFileSync('client/style.css','utf8')+fs.readFileSync('client/interface-theme.css','utf8')}</style><section id="synergy-panel" style="width:280px;margin:16px">${synergyCards([{trait:'bulwark',count:8,active:true}])}</section>`);
  const card=preview.locator('.synergy-card');assert.equal(await card.getAttribute('data-synergy-grade'),'purple');
  const color=await card.evaluate(e=>getComputedStyle(e).backgroundColor),shadow=await card.evaluate(e=>getComputedStyle(e).boxShadow);
  assert.equal(color,'rgb(218, 206, 230)');assert.notEqual(shadow,'none');
  await preview.screenshot({path:`${shots}/future-fourth-tier-fixture.png`});futureTierFixture={grade:'purple',color,glow:true,gameplayTierAdded:false};
 }finally{tiers.pop();await preview.close();}
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,futureTierFixture,errors,source:'Actual one-human/five-bot room snapshots, 20 real catalogue kinds. No synthetic extra units or snapshot alterations. Separate renderer-only future fourth-tier fixture.'},null,2));console.log('PASS expanded catalogue: 20 images, nine layouts/rotation, actual 5-to-1 exchanges, light inactive surface, three tinted stages, future purple fixture, skills, combat and reload');
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
async function assertColors(root,count,effect=false){
 if(!effect){
  assert.equal(await root.locator('.synergy-count-now').textContent(),String(count));
  const grade=count>=6?'gold':count>=4?'silver':count>=2?'bronze':'inactive';
  assert.equal(await root.getAttribute('data-synergy-grade'),grade);
  const colors={inactive:'rgb(211, 220, 221)',bronze:'rgb(234, 212, 189)',silver:'rgb(204, 214, 223)',gold:'rgb(233, 221, 172)'};
  assert.equal(await root.evaluate(e=>getComputedStyle(e).backgroundColor),colors[grade]);
  const glow=await root.evaluate(e=>getComputedStyle(e).boxShadow);assert.equal(glow==='none',grade==='inactive','only achieved stages glow');
 }

 const current=[2,4,6].filter(n=>n<=count).at(-1);
 for(const type of effect?['synergy-effect-value']:['synergy-threshold'])for(const threshold of [2,4,6]){
  const value=root.locator(`.${type}[data-threshold="${threshold}"]`);
  assert.equal(await value.getAttribute('data-current'),String(threshold===current));assert.equal(await value.evaluate(e=>getComputedStyle(e).color),threshold===current?'rgb(23, 57, 79)':'rgb(70, 89, 107)');
 }
 if(effect){assert.match(await root.textContent(),/증가/);assert.doesNotMatch(await root.textContent(),/조합|종|[+−]|같은 계열의 서로 다른 종류만 셉니다|중복 종류와 대기석은 제외합니다|가장 높은 달성 단계의 효과만 적용합니다/);assert.equal(await root.locator('.synergy-thresholds').count(),0);}
 else{assert.ok(await root.evaluate(e=>e.scrollWidth<=e.clientWidth));const n=await root.locator('.synergy-count-now').boundingBox(),name=await root.locator('.synergy-name strong').boundingBox();assert.ok(n.x+n.width<=name.x,'count is left of name');}
}
