const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots='docs/screenshots/mobile-landscape';
const url='http://127.0.0.1:2660',server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2660',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const errors=[],results=[];
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
 const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
 await p.goto(url);await p.locator('#practice').tap();await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));await debugClick(p,'debug-pause');await debugPreset(p,'early');
 const own=p.locator('#player-ranking [data-self="true"]'),enemy=p.locator('#player-ranking [data-self="false"]');
 const viewer=await own.getAttribute('data-player-id'),other=await enemy.getAttribute('data-player-id'),roomCode=await p.locator('#room-code').textContent();
 async function rotate(width,height){await p.setViewportSize({width,height});await p.waitForFunction(v=>document.documentElement.dataset.screenOrientation===v,width>height?'landscape':'portrait');await p.waitForTimeout(160);assert.equal(await p.locator('html').getAttribute('data-screen-mode'),'mobile');assert.equal(await p.locator('#room-code').textContent(),roomCode);}
 async function closeUnit(){if(await p.locator('#unit-dialog').evaluate(e=>e.open))await p.locator('#close-unit-dialog').tap();}
 async function drag(source,target){const a=await p.locator(source).boundingBox(),b=await p.locator(target).boundingBox();assert.ok(a&&b);const cdp=await context.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});await p.waitForTimeout(80);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
 await rotate(844,390);
 const original=p.locator('#cells button[aria-label*="아군 칸, 루멘,"]').first(),cell=await original.evaluate(e=>`#cells button[data-x="${e.dataset.x}"][data-y="${e.dataset.y}"]`),destination='#cells button[data-x="7"][data-y="7"]';
 await drag('[data-bench-slot="0"]',cell);await p.waitForFunction(sel=>document.querySelector(sel).getAttribute('aria-label').includes('실바'),cell);
 await drag(cell,'[data-bench-slot="2"]');await p.waitForFunction(()=>document.getElementById('deployed').textContent==='0/1');
 await drag('[data-bench-slot="2"]',destination);await p.waitForFunction(sel=>document.querySelector(sel).getAttribute('aria-label').includes('실바'),destination);
 await enemy.tap();assert.equal(await enemy.getAttribute('aria-pressed'),'true');
 await rotate(390,844);assert.equal(await enemy.getAttribute('aria-pressed'),'true');await rotate(844,390);assert.equal(await enemy.getAttribute('aria-pressed'),'true');
 await p.locator('#cells button[aria-label*="관전 칸,"]:not([aria-label*="빈 칸"])').first().tap();await p.locator('#unit-dialog').waitFor({state:'visible'});assert.equal(await p.locator('#unit-dialog').getAttribute('data-read-only'),'true');await closeUnit();await p.locator('#scout-return').tap();assert.equal(await own.getAttribute('aria-pressed'),'true');
 await p.locator('#equipment-toggle').tap();await p.waitForFunction(()=>document.getElementById('equipment-toggle').getAttribute('aria-expanded')==='true');
 const item=await p.locator('[data-equipment-item]').first().getAttribute('data-equipment-item');await drag(`[data-equipment-item="${item}"]`,destination);await p.locator(`[data-equipment-item="${item}"]`).waitFor({state:'detached'});
 if(await p.locator('#equipment-close').isVisible())await p.locator('#equipment-close').tap();
 const offer=p.locator('#shop-offers [data-offer]:enabled').first(),price=Number(await offer.locator('.shop-price').textContent()),before=Number(await p.locator('#gold').textContent());assert.ok(Number.isFinite(price)&&price>0);await offer.tap();await p.waitForFunction(g=>Number(document.getElementById('gold').textContent)===g,before-price);
 const beforeXP=Number(await p.locator('#gold').textContent()),levelBefore=Number((await p.locator('#level-label').textContent()).match(/레벨 (\d+)/)[1]);await p.locator('#buy-experience').tap();await p.waitForFunction(g=>Number(document.getElementById('gold').textContent)===g,beforeXP-4);assert.ok(Number((await p.locator('#level-label').textContent()).match(/레벨 (\d+)/)[1])>levelBefore);
 await debugPreset(p,'early');const beforeRoll=Number(await p.locator('#gold').textContent());await p.locator('#reroll').tap();await p.waitForFunction(g=>Number(document.getElementById('gold').textContent)===g,beforeRoll-5);
 for(const [width,height] of [[844,390],[740,360],[667,375],[480,320],[1024,768]]){
  await rotate(width,height);
  const m=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return {board:r('board-wrap'),bench:r('bench'),shop:r('pc-play-dock'),ranking:r('player-ranking'),gear:r('equipment-toggle'),controls:['buy-experience','reroll','ready','mobile-info-open','history-toggle'].map(id=>({id,rect:r(id)})),offers:[...document.querySelectorAll('#shop-offers [data-offer]')].map(e=>e.getBoundingClientRect().toJSON()),overflow:document.documentElement.scrollWidth>innerWidth};});
  await p.screenshot({path:`${shots}/${width}-${height}.png`,animations:'disabled'});
  assert.equal(m.overflow,false);assert.ok(m.bench.bottom<=height&&m.ranking.bottom<=height);assert.ok(m.board.right<=m.shop.x&&m.shop.right<=m.ranking.x);assert.ok(m.gear.y>=0&&m.gear.bottom<=height,JSON.stringify({width,height,m}));
  for(const control of m.controls)assert.ok(control.rect.width>=44&&control.rect.height>=44,JSON.stringify({width,height,control}));
  for(const offer of m.offers)assert.ok(offer.width>=44&&offer.height>=44,JSON.stringify({width,height,offer}));
  await p.locator('#mobile-info-open').tap();await p.locator('#pc-info-dialog').waitFor({state:'visible'});await p.locator('#pc-info-close').tap();
  await p.locator('#history-toggle').tap();await p.locator('#combat-record-dialog').waitFor({state:'visible'});await p.locator('#combat-sheet-close').tap();
  await p.locator('#cells button[aria-label*="아군 칸, 루멘,"]').first().tap();await p.locator('#unit-dialog').waitFor({state:'visible'});await closeUnit();
  await p.screenshot({path:`${shots}/${width}-${height}.png`,animations:'disabled'});results.push({width,height,...m});
 }
 await rotate(390,844);assert.equal(await p.locator('#player-ranking').evaluate(e=>e.parentElement.id),'game-view');assert.equal(await p.locator('#player-ranking [data-self="true"]').getAttribute('data-player-id'),viewer);assert.equal(await p.evaluate(()=>localStorage.getItem('autochess-screen-mode')),null);
 await p.reload();await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));assert.equal(await p.locator('html').getAttribute('data-screen-mode'),'mobile');assert.equal(await p.locator('#room-code').textContent(),roomCode);
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,errors},null,2));console.log('PASS mobile landscape touch placement/swap/equipment/purchase/XP/reroll, portrait-landscape rotation preserves room and scouting, five landscape sizes and all information dialogs');await context.close();
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
