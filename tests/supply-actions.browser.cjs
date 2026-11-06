const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {openDebug,closeInfo,debugClick}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const url='http://127.0.0.1:2622';
const proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2622',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
let output='';proc.stderr.on('data',d=>output+=d);
(async()=>{let browser;try{
 let healthy=false;for(let i=0;i<60;i++){try{if((await fetch(url+'/health')).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(healthy,output);
 browser=await chromium.launch(browserOptions());const errors=[],results=[];fs.mkdirSync('docs/screenshots/supply-actions',{recursive:true});
 for(const mode of ['pc','mobile']){
  const ctx=await browser.newContext({viewport:mode==='pc'?{width:1440,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36'});
  const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  const cdp=mode==='mobile'?await ctx.newCDPSession(p):null;
  async function click(sel){const loc=p.locator(sel);await loc.scrollIntoViewIfNeeded();if(mode==='mobile')await loc.tap();else await loc.click();}
  async function gold(){return parseInt(await p.locator('#gold').textContent());}
  async function openEquipment(){if(await p.locator('#equipment-toggle').getAttribute('aria-expanded')!=='true')await click('#equipment-toggle');}
  async function closeEquipment(){if(mode==='mobile'&&await p.locator('#equipment-toggle').getAttribute('aria-expanded')==='true')await click('#equipment-close');}
  async function closeModal(){if(await p.locator('#unit-dialog').evaluate(e=>e.open))await click('#close-unit-dialog');}
  async function buyXP(){const before=await gold(),xp=await p.locator('#experience-label').textContent();assert.equal(await p.locator('#buy-experience').isDisabled(),false);await click('#buy-experience');await p.waitForFunction(g=>parseInt(document.querySelector('#gold').textContent)===g,before-4);assert.notEqual(await p.locator('#experience-label').textContent(),xp);}
  async function buy(){await closeEquipment();await require('./ui-helpers.cjs').selectDock(p,'shop');const offer=p.locator('#shop-offers [data-offer]:not(:disabled)').first(),before=await gold();const label=await offer.getAttribute('aria-label'),cost=Number(label.match(/(\d+) 골드/)[1]),slot=await offer.getAttribute('data-shop-slot');await offer.click();await p.waitForFunction(({slot,g})=>document.querySelector(`[data-shop-slot="${slot}"]`).classList.contains('shop-sold')&&parseInt(document.querySelector('#gold').textContent)===g,{slot,g:before-cost});}
  async function drag(itemId,target){await openEquipment();const source=p.locator(`[data-equipment-item="${itemId}"]`);await source.scrollIntoViewIfNeeded();const a=await source.boundingBox(),b=await p.locator(target).boundingBox();assert.ok(a&&b);const start={x:a.x+a.width/2,y:a.y+a.height/2},end={x:b.x+b.width/2,y:b.y+b.height/2};
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});}else{await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(end.x,end.y,{steps:8});}
   await p.locator('#equipment-drag-ghost').waitFor({state:'visible'});assert.equal(await p.locator('#equipment-drag-ghost').getAttribute('data-valid'),'true');
   if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await p.mouse.up();await source.waitFor({state:'detached'});await closeEquipment();
  }
  await p.goto(url);await click('#practice');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));await debugClick(p,'debug-pause');
  await openDebug(p);await p.locator('#debug-preset').selectOption('mid');await p.locator('#debug-apply').click();await closeInfo(p);await p.waitForFunction(()=>document.querySelector('#level-label').textContent.includes('레벨 7'));
  const own='#cells button[aria-label*="아군 칸, 루멘,"][aria-label*="강화 1성"]';
  await click(own);await click('#selected-unit-content img[role="button"]');await click('#dialog-equipment-panel summary');
  const itemId=await p.locator('#dialog-inventory button[data-mode="unequip"]').getAttribute('data-item');await click(`#dialog-inventory button[data-item="${itemId}"]`);await p.waitForFunction(id=>!!document.querySelector(`[data-equipment-item="${id}"]`),itemId);await closeModal();
  const dockHeight=await p.locator('#pc-play-dock').evaluate(e=>e.getBoundingClientRect().height);
  await click('#ready');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));
  await buyXP();await buy();await drag(itemId,own);
  await click(own);assert.match(await p.locator('#selected-unit-content').textContent(),/다음 전투 기준/);assert.equal(await p.locator('#bench-button').isDisabled(),true);
  await click('#selected-unit-content img[role="button"]');assert.equal(await p.locator('#sell-unit').isDisabled(),false);
  if(!await p.locator('#dialog-equipment-panel').evaluate(e=>e.open))await click('#dialog-equipment-panel summary');
  assert.equal(await p.locator(`#dialog-inventory button[data-item="${itemId}"]`).isDisabled(),false);
  await click(`#dialog-inventory button[data-item="${itemId}"]`);await p.waitForFunction(id=>!!document.querySelector(`[data-equipment-item="${id}"]`),itemId);await closeModal();
  await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent==='라운드 결과');
  await buyXP();await buy();const beforeReroll=await gold();await click('#reroll');await p.waitForFunction(g=>parseInt(document.querySelector('#gold').textContent)===g,beforeReroll-5);
  const bench='[data-bench-slot="0"][data-unit]';
  // Two purchases of the same 1-star kind may merge into a deployed unit.
  // Buy once more from the refreshed shop to provide a bench target in that case.
  if(!await p.locator(bench).count())await buy();
  await require('./ui-helpers.cjs').selectDock(p,'bench');await p.locator(bench).waitFor();await drag(itemId,bench);await p.locator(bench+' .pc-bench-equipment').waitFor();
  await click(bench);await click('#selected-unit-content img[role="button"]');assert.equal(await p.locator('#sell-unit').isDisabled(),false);assert.equal(await p.locator('#bench-button').isDisabled(),true);
  if(!await p.locator('#dialog-equipment-panel').evaluate(e=>e.open))await click('#dialog-equipment-panel summary');
  await click(`#dialog-inventory button[data-item="${itemId}"]`);await p.waitForFunction(id=>!!document.querySelector(`[data-equipment-item="${id}"]`),itemId);await closeModal();
  // Tap/keyboard equipment selection also uses the new action window.
  await openEquipment();await p.locator(`[data-equipment-item="${itemId}"]`).focus();await p.keyboard.press('Enter');await p.locator(bench).focus();await p.keyboard.press('Enter');await p.locator(`[data-equipment-item="${itemId}"]`).waitFor({state:'detached'});await closeEquipment();
  assert.equal(await p.locator('#pc-play-dock').evaluate(e=>e.getBoundingClientRect().height),dockHeight);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));await p.locator(bench+' .pc-bench-equipment').waitFor();
  if(await p.locator('#reward-dialog').evaluate(e=>e.open))await click('#reward-later');
  await click('#leave');await p.locator('#lobby').waitFor({state:'visible'});results.push({mode,combatXP:true,resultXP:true,combatShop:true,resultShop:true,resultReroll:true,combatEquipUnequip:true,resultDragKeyboardEquipUnequip:true,placementLocked:true,combatSaleEnabled:true,dockHeight});await ctx.close();console.log('PASS:',mode,'combat/result XP, shop, reroll, equipment drag/unequip/keyboard, placement lock and combat sale enabled');
 }
 assert.deepEqual(errors,[]);fs.writeFileSync('docs/screenshots/supply-actions/results.json',JSON.stringify({version:require('../package.json').version,browser:browser.version(),results,errors},null,2));
 }finally{await browser?.close();proc.kill('SIGTERM');}})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
