const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const url='http://127.0.0.1:2624';
const proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2624',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
(async()=>{let browser;try{
 let healthy=false;for(let i=0;i<60;i++){try{if((await fetch(url+'/health')).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(healthy);
 browser=await chromium.launch(browserOptions());const errors=[],results=[];fs.mkdirSync('docs/screenshots/empty-start',{recursive:true});
 async function empty(p){
  await p.waitForFunction(()=>document.querySelector('#gold').textContent==='10');
  assert.equal(await p.locator('#units [data-unit]').count(),0);
  assert.equal((await p.locator('#bench-count').textContent()).trim(),'0 / 12');
  assert.equal(await p.locator('#equipment-count').textContent(),'0');
  assert.equal(await p.locator('[data-equipment-item]').count(),0);
  assert.equal(await p.locator('#cells button[aria-label*="아군 칸,"][aria-label*="체력"]').count(),0);
  assert.match(await p.locator('#deployed').textContent(),/출전 0/);
  assert.match(await p.locator('#level-label').textContent(),/레벨 1/);
  assert.equal(await p.locator('#shop-offers [data-offer]').count(),5);
 }
 for(const mode of ['pc','mobile']){
  const ctx=await browser.newContext({viewport:mode==='pc'?{width:1440,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36'});
  const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url);await p.locator('#practice').click();await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));await debugClick(p,'debug-pause');await empty(p);
  await require('./ui-helpers.cjs').selectDock(p,'bench');await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:`docs/screenshots/empty-start/${mode}-empty-0.19.3.png`,fullPage:true,animations:'disabled'});
  await require('./ui-helpers.cjs').selectDock(p,'shop');const offer=p.locator('#shop-offers [data-offer]:not(:disabled)').first(),cost=Number((await offer.getAttribute('aria-label')).match(/(\d+) 골드/)[1]);await offer.click();
  await p.waitForFunction(()=>document.querySelectorAll('#units [data-unit]').length===1);assert.equal(await p.locator('#gold').textContent(),String(10-cost));assert.match(await p.locator('#deployed').textContent(),/출전 0/);
  await require('./ui-helpers.cjs').selectDock(p,'bench');await p.locator('[data-bench-slot="0"][data-unit]').click();await p.locator('#cells button[data-x="2"][data-y="6"]').click();await p.waitForFunction(()=>document.querySelector('#deployed').textContent.includes('출전 1'));
  assert.equal(await p.locator('#equipment-count').textContent(),'0');await p.reload();await p.waitForFunction(()=>document.querySelector('#deployed').textContent.includes('출전 1'));assert.equal(await p.locator('#gold').textContent(),String(10-cost));
  await p.locator('#leave').click();await p.locator('#lobby').waitFor({state:'visible'});await p.locator('#practice').click();await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));await debugClick(p,'debug-pause');await empty(p);
  await p.locator('#leave').click();await p.locator('#lobby').waitFor({state:'visible'});await p.locator('#create').click();await p.waitForFunction(()=>document.querySelector('#phase').textContent==='상대 입장 대기');await empty(p);
  const code=(await p.locator('#room-code').textContent()).trim(),guest=await ctx.newPage();guest.on('pageerror',e=>errors.push(e.message));await guest.goto(url);await guest.locator('#code').fill(code);await guest.locator('#join').click();await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));await guest.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));await empty(p);await empty(guest);
  results.push({mode,practiceEmpty:true,firstPurchaseAndPlacement:true,reconnectPreservesOwnedUnit:true,newGameEmpty:true,duelBothPlayersEmpty:true,startingGold:10});await ctx.close();console.log('PASS:',mode,'empty practice/duel/restart, paid purchase, placement and reconnect');
 }
 assert.deepEqual(errors,[]);fs.writeFileSync('docs/screenshots/empty-start/results.json',JSON.stringify({version:'0.19.3',browser:browser.version(),results,errors},null,2));
 }finally{await browser?.close();proc.kill('SIGTERM');}})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
