const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {openDebug,closeInfo,debugClick}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const url='http://127.0.0.1:2621';
const proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2621',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
let output='';proc.stderr.on('data',d=>output+=d);
(async()=>{let browser;try{
 let healthy=false;
 for(let i=0;i<60;i++){try{if((await fetch(url+'/health')).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.ok(healthy,output);browser=await chromium.launch(browserOptions());
 const errors=[],results=[];fs.mkdirSync('docs/screenshots/opponent-inspection',{recursive:true});
 for(const mode of ['pc','mobile']){
  const ctx=await browser.newContext({viewport:mode==='pc'?{width:1440,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36'});
  const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url);await p.locator('#practice').click();await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));
  await debugClick(p,'debug-pause');
  await openDebug(p);await p.locator('#debug-preset').selectOption('mid');await p.locator('#debug-apply').click();await closeInfo(p);
  await p.waitForFunction(()=>document.querySelector('#level-label').textContent.includes('레벨 7'));
  const enemy=p.locator('#cells button[aria-label*="상대 칸, 루멘,"][aria-label*="강화 1성"]').first(),own=p.locator('#cells button[aria-label*="아군 칸, 루멘,"][aria-label*="강화 1성"]').first();
  const panel=p.locator('#selected-unit-content');
  const boardWidth=await p.locator('#board-wrap').evaluate(e=>e.getBoundingClientRect().width),dockHeight=await p.locator('#pc-play-dock').evaluate(e=>e.getBoundingClientRect().height);
  async function choose(locator){await locator.scrollIntoViewIfNeeded();if(mode==='mobile')await locator.tap();else await locator.click();}
  async function cleared(){await p.waitForFunction(()=>document.querySelector('#selected-unit-content .empty')?.textContent==='캐릭터를 선택하세요.');assert.equal(await p.locator('#cells [aria-pressed="true"]').count(),0);}
  await choose(own);assert.match(await panel.textContent(),/내 유닛/);
  const ownStats=await panel.locator('.stats').textContent(),gear=await panel.locator('.selected-unit-equipment strong').allTextContents();assert.ok(gear.length);
  await panel.locator('img[role="button"]').click();assert.equal(await p.locator('#unit-dialog').evaluate(e=>e.open),true);await p.locator('#close-unit-dialog').click();
  await choose(enemy);await p.waitForFunction(()=>document.querySelector('#selected-unit-content').textContent.includes('상대 ·'));
  assert.equal(await enemy.getAttribute('aria-pressed'),'true');assert.equal(await panel.locator('.stats').textContent(),ownStats);
  assert.deepEqual(await panel.locator('.selected-unit-equipment strong').allTextContents(),gear);
  assert.ok(await panel.locator('.skill-card').count());assert.doesNotMatch(await panel.textContent(),/판매 \d/);
  assert.equal(await panel.locator('img[role="button"]').count(),0);await panel.locator('img').click();assert.equal(await p.locator('#unit-dialog').evaluate(e=>e.open),false);
  assert.equal(await p.locator('#bench-button').isDisabled(),true);assert.equal(await p.locator('#inventory button:enabled').count(),0);
  await p.keyboard.press('Escape');await cleared();await enemy.focus();await p.keyboard.press('Enter');assert.match(await panel.textContent(),/상대 ·/);
  await p.waitForTimeout(250);assert.match(await panel.textContent(),/상대 ·/,'Repeated snapshots preserve inspection');
  assert.equal(await p.locator('#board-wrap').evaluate(e=>e.getBoundingClientRect().width),boardWidth);
  assert.equal(await p.locator('#pc-play-dock').evaluate(e=>e.getBoundingClientRect().height),dockHeight);
  // Capture the information itself without the fixed controls covering it.
  // Visibility does not change their measured height or the live app layout.
  const captureStyle=await p.addStyleTag({content:'#pc-play-dock,#equipment-sidebar{visibility:hidden!important}'});
  await panel.screenshot({path:`docs/screenshots/opponent-inspection/${mode}-opponent-info-0.17.6.png`,animations:'disabled'});
  await captureStyle.evaluate(e=>e.remove());
  await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));
  assert.match(await panel.textContent(),/상대 ·/,'Prepare to combat preserves inspection');
  await p.keyboard.press('Escape');await cleared();await choose(enemy);assert.match(await panel.textContent(),/상대 ·/,'Combat opponents are selectable');
  await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent==='라운드 결과');await cleared();
  // A surviving enemy can be inspected anew during results; next round clears it.
  const botSurvivor=p.locator('#cells button[aria-label*="상대 칸,"][aria-label*="체력"]');
  if(await botSurvivor.count()){await choose(botSurvivor.first());if((await panel.textContent()).includes('상대 ·')){await debugClick(p,'debug-next');await cleared();}else await debugClick(p,'debug-next');}
  else await debugClick(p,'debug-next');
  await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));
  await choose(own);await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));
  await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent==='라운드 결과');assert.match(await panel.textContent(),/내 유닛/,'Own selection survives combat end');
  await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));assert.match(await panel.textContent(),/내 유닛/);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(await p.locator('#reward-dialog').evaluate(e=>e.open))await p.locator('#reward-later').click();
  await p.locator('#leave').click();await p.locator('#lobby').waitFor({state:'visible'});await cleared();
  results.push({mode,boardWidth,dockHeight,opponentReadOnly:true,combatEndCleared:true,ownSelectionPreserved:true});
  await ctx.close();console.log('PASS:',mode,'opponent click/touch/keyboard, owner stats/gear/skills, read-only, battle-end reset, own selection preserved');
 }
 // Both sides of a real duel: the second player has the reversed board view.
 const a=await browser.newPage({viewport:{width:1440,height:1000}}),b=await browser.newPage({viewport:{width:1440,height:1000}});
 for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
 await a.goto(url);await a.locator('#nickname').fill('플레이어 A');await a.locator('#create').click();
 await a.waitForFunction(()=>document.querySelector('#room-code').textContent.length>1);
 const code=(await a.locator('#room-code').textContent()).trim();
 await b.goto(url);await b.locator('#nickname').fill('플레이어 B');await b.locator('#code').fill(code);await b.locator('#join').click();
 await a.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));
 for(const p of [a,b]){
  await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));
  await p.locator('#shop-offers [data-offer]:not(:disabled)').first().click();
  await require('./ui-helpers.cjs').selectDock(p,'bench');await p.locator('[data-bench-slot="0"][data-unit]').click();
  await p.locator('#cells button[data-x="2"][data-y="6"]').click();
  await p.waitForFunction(()=>document.querySelector('#deployed').textContent.includes('출전 1'));
 }
 await a.locator('#cells button[data-x="2"][data-y="6"]').click();
 const aStats=await a.locator('#selected-unit-content .stats').textContent();
 for(const [p,name] of [[a,'플레이어 B'],[b,'플레이어 A']]){
  await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));
  await p.locator('#cells button[data-x="3"][data-y="1"]').click();
  assert.match(await p.locator('#selected-unit-content').textContent(),new RegExp('상대 · '+name));
 }
 assert.equal(await b.locator('#selected-unit-content .stats').textContent(),aStats,'Second player uses opponent stats');
 assert.equal(await a.locator('#selected-unit-content .selected-unit-equipment').count(),0);
 assert.equal(await b.locator('#selected-unit-content .selected-unit-equipment').count(),0);
 await a.locator('#ready').click();await b.locator('#ready').click();
 for(const p of [a,b]){await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));assert.match(await p.locator('#selected-unit-content').textContent(),/상대 ·/);}
 await a.close();await b.close();assert.deepEqual(errors,[]);
 fs.writeFileSync('docs/screenshots/opponent-inspection/results.json',JSON.stringify({version:'0.17.6',browser:browser.version(),results,duelBothPerspectives:true,errors},null,2));
 }finally{await browser?.close();proc.kill('SIGTERM');}})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
