const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {decode}=require('@colyseus/schema'),{unpack,Packr}=require('@colyseus/msgpackr');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots=`docs/screenshots/skill-details-${version}`,url='http://127.0.0.1:2698';
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2698',DEBUG_GAME:'0',NODE_ENV:'production'},stdio:'pipe'});
fs.mkdirSync(shots,{recursive:true});
function message(raw){if(typeof raw==='string')return;const b=Buffer.from(raw);if(b[0]!==13)return;const it={offset:1},type=decode.stringCheck(b,it)?decode.string(b,it):decode.number(b,it);if(type==='snapshot')return{data:unpack(b,{start:it.offset}),prefix:b.subarray(0,it.offset)};}
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const {SKILLS}=await import('../shared/skill-catalog.ts');
 browser=await chromium.launch(browserOptions());const results=[],errors=[],feedback=[];
 for(const mode of ['pc','mobile']){
  const ctx=await browser.newContext({viewport:mode==='pc'?{width:1400,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36'});
  let last,control=null,packets=0;const packr=new Packr({useRecords:false});
  await ctx.routeWebSocket('**/*',ws=>{const peer=ws.connectToServer();ws.onMessage(raw=>peer.send(raw));peer.onMessage(raw=>{
   const m=message(raw);if(m){last=m.data;packets++;if(control){const s=structuredClone(last);for(const f of s.fighters){const c=control[f.id];if(!c)continue;if(c.hp!==undefined)f.hp=c.hp;for(const skill of f.skills)if(c[skill.id])Object.assign(skill,c[skill.id]);if(c.animate)f.skills[0].cost=20+packets%40;}ws.send(Buffer.concat([m.prefix,Buffer.from(packr.pack(s))]));return;}}ws.send(raw);
  });});
  await ctx.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url,protocols){if(protocols&&typeof protocols==='object'&&!Array.isArray(protocols))throw new TypeError('Invalid browser protocols');super(url,protocols);}};});
  const p=await ctx.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().includes('/skills/')&&r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  const press=async target=>{const e=typeof target==='string'?p.locator(target):target;await e.scrollIntoViewIfNeeded();await(mode==='mobile'?e.tap():e.click());};
  const fresh=async fn=>{for(let i=0;i<200&&!fn();i++)await p.waitForTimeout(30);assert.ok(fn(),'authoritative state update');};
  const own=()=>last.players.find(v=>v.visibility==='self');
  const popup=p.locator('#skill-detail-tooltip');
  const unitOpen=()=>p.locator('#unit-dialog').evaluate(e=>e.open);
  const closeUnit=async()=>{if(await unitOpen())await press('#close-unit-dialog');};
  const root=()=>p.locator(mode==='mobile'?'#unit-dialog':'#selected-unit-content');
  const pick=async(kind,owner=own().id)=>{await closeUnit();const u=last.players.find(v=>v.id===owner).units.find(u=>u.kind===kind&&u.x>=0);assert.ok(u);await press(`#cells [data-board-unit="${u.id}"]`);await root().locator(`[data-skill-unit="${u.id}"]`).first().waitFor();return u;};
  let skillSource;
  const openSkill=async source=>{skillSource=source;await source.scrollIntoViewIfNeeded();await(mode==='mobile'?source.tap():source.hover());await popup.waitFor({state:'visible'});assert.equal(await popup.getAttribute('role'),'tooltip');};
  const closePopup=async key=>{if(key)await p.keyboard.press('Escape');else if(mode==='mobile')await press(skillSource);else await p.mouse.move(2,2);await popup.waitFor({state:'hidden'});};
  const within=async locator=>{const b=await locator.boundingBox(),v=p.viewportSize();assert.ok(b&&b.x>=0&&b.y>=0&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1,JSON.stringify(b));assert.ok(await locator.evaluate(e=>e.scrollWidth<=e.clientWidth+1));return b;};
  await p.goto(url);await press('#pvp-practice');await fresh(()=>last?.debug);await debugClick(p,'debug-pause');await fresh(()=>last.debug.paused);await debugPreset(p,'synergy');
  const room=last.roomId,bot=last.players.find(v=>v.bot).id;
  const assets=await p.evaluate(async entries=>Promise.all(entries.map(async([id,src])=>{const img=new Image();img.src=src;await img.decode();return{id,width:img.naturalWidth,height:img.naturalHeight};})),[...Object.values(SKILLS).map(s=>[s.id,s.image]),['fallback','/skills/default.svg']]);
  assert.equal(assets.length,13);assert.ok(assets.every(a=>a.width===64&&a.height===64));
  const frames=mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]];
  for(const [width,height] of frames){
   console.log('CHECK skill details',mode,width,height);await p.setViewportSize({width,height});await p.waitForTimeout(160);assert.equal(last.roomId,room);assert.equal(await p.locator('html').getAttribute('data-screen-mode'),mode);
   if(await p.locator('#scout-return').isVisible()){assert.equal(await p.locator(`[data-player-id="${bot}"]`).getAttribute('aria-pressed'),'true');await press('#scout-return');}
   await pick('skirmisher');const r=root();assert.equal(await r.locator('button.skill-card').count(),2);assert.equal(await r.locator('.skill-card p,.skill-card .cost-track,.skill-card .cost-value,.skill-card .skill-status,.skill-card .skill-used').count(),0);
   const cards=await r.locator('.skill-card').evaluateAll(es=>es.map(e=>({name:e.querySelector('strong').textContent,kind:e.querySelector('.skill-kind').textContent,cost:e.querySelector('.skill-required-cost').textContent,img:e.querySelector('img').naturalWidth,width:e.clientWidth,scroll:e.scrollWidth,height:e.getBoundingClientRect().height})));
   const skillRow=await r.locator('.skill-card').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
   assert.equal(skillRow.length,2);assert.ok(Math.abs(skillRow[0].y-skillRow[1].y)<1,'active and passive share one row');assert.ok(Math.abs(skillRow[0].height-skillRow[1].height)<1,'skill controls have equal height');assert.ok(skillRow[0].right<=skillRow[1].x-5,'two controls do not overlap');assert.ok(Math.abs(skillRow[0].width-skillRow[1].width)<1,'two equal columns');
   assert.ok(cards.every(c=>c.img===64&&c.width>=44&&c.height>=44&&c.scroll<=c.width+1));assert.deepEqual(cards.map(c=>c.cost),['코스트 60','코스트 0']);
   await openSkill(r.locator('[data-skill-id="quickstep"]'));await popup.waitFor({state:'visible'});assert.equal(await p.locator('#skill-detail-name').textContent(),'재빠른 발걸음');assert.match(await p.locator('#skill-detail-description').textContent(),/공격 주기 22\.2% 감소, 이동 주기 25% 감소/);assert.doesNotMatch(await popup.textContent(),/−\d+ms/);assert.equal(await popup.locator('.cost-track,.cost-value').count(),0,'passive has no stale resource from previous skill');assert.equal(await p.locator('#skill-detail-unit,#skill-detail-dialog').count(),0);assert.equal(await p.locator('dialog[open]').count(),mode==='mobile'?1:0,'tooltip adds no modal');assert.doesNotMatch(await popup.textContent(),/카이|전투 불능/);const passive=await within(popup);
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-skill-tooltip.png`});await closePopup(true);if(mode==='mobile')assert.equal(await unitOpen(),true,'Escape keeps parent unit dialog');
   await openSkill(r.locator('[data-skill-id="doubleStrike"]'));await popup.waitFor({state:'visible'});assert.match(await p.locator('#skill-detail-meta').textContent(),/액티브 · 필요 코스트 60/);assert.match(await p.locator('#skill-detail-description').textContent(),/공격력 1\.6배/);await within(popup);await closePopup();
   await openSkill(r.locator('[data-skill-id="quickstep"]'));await popup.waitFor({state:'visible'});assert.equal(await popup.locator('.cost-track,.cost-value').count(),0,'active to passive clears resource');if(mode==='mobile')await press('#unit-dialog-title');else await p.mouse.click(2,2);await popup.waitFor({state:'hidden'});if(mode==='mobile')assert.equal(await unitOpen(),true,'touching outside tooltip inside unit dialog keeps unit detail');
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}-compact-skills.png`});await closeUnit();
   const combo=p.locator('#my-synergies [data-trait="bulwark"]');assert.equal(await combo.locator('.synergy-thresholds').textContent(),'2/4/6');await press(combo);const tip=p.locator('#game-help-tooltip');await tip.waitFor({state:'visible'});assert.equal(await tip.locator(':scope > strong').textContent(),'수호 2');assert.equal((await tip.locator('.synergy-help-effect').textContent()).trim(),'수호 유닛의 강화 기본 체력 15%/30%/50% 증가');assert.doesNotMatch(await tip.textContent(),/수호 조합|2\/4\/6|종|[+−]/);assert.equal(await tip.locator('.synergy-effect-value[data-current="true"]').textContent(),'15%');await within(tip);await p.screenshot({path:`${shots}/${mode}-${width}-${height}-synergy.png`});await press(combo);
   await press(`[data-player-id="${bot}"]`);await pick('knight',bot);await openSkill(root().locator('[data-skill-id="guardian"]'));await popup.waitFor({state:'visible'});assert.equal(await p.locator('#skill-detail-name').textContent(),'여명의 수호');assert.match(await popup.textContent(),/받는 피해 45% 감소/);await within(popup);await closePopup();await closeUnit();
   const geometry=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return{overflow:document.documentElement.scrollWidth>innerWidth,board:r('board-wrap'),bench:r('bench'),shop:r('pc-dock-reserve'),rank:r('player-ranking'),targets:[...document.querySelectorAll('.ranking-row,#shop-offers [data-offer],#mobile-info-open,#my-synergies button')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().toJSON())};});
   assert.equal(geometry.overflow,false);assert.ok(geometry.targets.every(t=>t.width>=44&&t.height>=44));const overlap=(a,b)=>a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1;for(const [a,b] of [['board','bench'],['board','shop'],['board','rank'],['bench','shop'],['bench','rank'],['shop','rank']])assert.equal(overlap(geometry[a],geometry[b]),false,`${a}/${b}`);
   results.push({mode,width,height,cards,skillRow,singleSkillRow:true,passive,geometry,opponentSkills:true,escapeKeepsParent:true,outsideClosesOnlyTooltip:true,nonmodal:true,unitNameRemoved:true,compactSynergy:true,room});
  }
  // Keep a nested popup, the room and watched player intact across rotation.
  if(mode==='mobile'){
   const u=await pick('knight',bot);await openSkill(root().locator('[data-skill-id="guardian"]'));await popup.waitFor({state:'visible'});
   for(const v of [{width:844,height:390},{width:390,height:844}]){await p.setViewportSize(v);await p.waitForTimeout(160);if(!await popup.isVisible())await openSkill(root().locator('[data-skill-id="guardian"]'));assert.equal(await unitOpen(),true);assert.equal(last.roomId,room);assert.equal(await p.locator(`[data-player-id="${bot}"]`).getAttribute('aria-pressed'),'true');assert.equal(await root().locator(`[data-skill-unit="${u.id}"]`).count(),2);await within(popup);}
   await closePopup();await closeUnit();
  }
  await press('#scout-return');await press('#ready');await fresh(()=>last.phase==='matching');await debugClick(p,'debug-next');await fresh(()=>last.phase==='combat');
  const w=last.fighters.find(f=>f.owner===own().id&&f.kind==='warden'),k=last.fighters.find(f=>f.owner===own().id&&f.kind==='knight');assert.ok(w&&k);
  // Only this feedback section controls incoming UI skill states; the nine
  // layouts above use the actual one-human/five-server-bot snapshots unchanged.
  control={[w.id]:{ironWard:{cost:40,active:false,activations:0,cooldownUntil:0},steadfast:{active:false,activations:0}},[k.id]:{guardian:{cost:30,active:false,activations:0,cooldownUntil:0}}};
  await pick('warden');await p.waitForTimeout(600);const card=root().locator('[data-skill-id="ironWard"]');control[w.id].ironWard.activations=1;await card.locator(':scope.skill-cast').waitFor({state:'attached'});await p.waitForTimeout(600);assert.equal(await card.evaluate(e=>e.classList.contains('skill-cast')),false);
  await openSkill(card);await popup.waitFor({state:'visible'});assert.equal(await popup.locator('.cost-value').textContent(),'코스트 40/80');control[w.id].animate=true;await p.waitForTimeout(350);assert.equal(await popup.isVisible(),true);assert.notEqual(await popup.locator('.cost-value').textContent(),'코스트 40/80');control[w.id].animate=false;control[w.id].ironWard.cooldownUntil=last.gameNow+1500;await p.waitForFunction(()=>document.querySelector('#skill-detail-status').textContent==='재사용 대기 2초');await closePopup();
  control[w.id].steadfast.activations=1;await openSkill(root().locator('[data-skill-id="steadfast"]'));await popup.waitFor({state:'visible'});await p.waitForFunction(()=>document.querySelector('#skill-detail-status').textContent==='이번 전투 사용 완료');await closePopup();
  await pick('warden');await openSkill(root().locator('[data-skill-id="ironWard"]'));control[w.id].hp=0;await p.waitForTimeout(250);assert.doesNotMatch(await popup.textContent(),/전투 불능/);assert.equal(await p.locator('#skill-detail-status').textContent(),'');await closePopup();await closeUnit();
  await pick('knight');control[k.id].guardian.active=true;control[k.id].guardian.activations=1;const running=root().locator('[data-skill-id="guardian"]');await p.waitForFunction(()=>[...document.querySelectorAll('[data-skill-id="guardian"]')].some(e=>e.classList.contains('skill-running')));await p.waitForTimeout(600);assert.equal(await running.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(201, 223, 208)');await openSkill(running);await popup.waitFor({state:'visible'});assert.equal(await p.locator('#skill-detail-status').textContent(),'효과 유지 중');control[k.id].guardian.active=false;await p.waitForFunction(()=>document.querySelector('#skill-detail-status').hidden);await closePopup();await closeUnit();
  await press('#motion');await pick('knight');control[k.id].guardian.activations++;await p.waitForTimeout(180);assert.equal(await root().locator('[data-skill-id="guardian"]').evaluate(e=>e.classList.contains('skill-cast')),false);await closeUnit();
  feedback.push({mode,fixture:'Receive-side skill states only',flashExpiry:true,liveCostPopup:true,cooldown:true,consumed:true,sustain:true,reducedMotion:true});
  control=null;await p.reload();await p.locator('#game-view').waitFor({state:'visible'});assert.equal(last.roomId,room);assert.equal(await popup.isVisible(),false);await press('#leave');await p.locator('#lobby').waitFor({state:'visible'});await ctx.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,feedback,errors,scope:'Nine layouts with unchanged snapshots from actual one-human/five-bot rooms. Separate controlled receive-side combat-feedback checks.'},null,2));console.log('PASS compact skill cards, 13 icons, hover/touch nonmodal tooltips/Escape, synergy wording, nine layouts/rotation/scouting, live feedback, no death text and reload');
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
