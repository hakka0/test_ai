const {openDebug,closeInfo}=require('./ui-helpers.cjs');
const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const pcUA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const mobileUA='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36';
const proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2597',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
(async()=>{let browser;try{
 for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:2597/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());
 const errors=[];
 async function open(userAgent,viewport){
  const context=await browser.newContext({viewport,userAgent}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:2597');await page.locator('#practice').click();await page.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));
  await openDebug(page);await page.locator('#debug-pause').click();await page.waitForFunction(()=>document.querySelector('#debug-pause').getAttribute('aria-pressed')==='true');
  await closeInfo(page);return {context,page};
 }
 async function mode(page,expected){await page.waitForFunction(v=>document.documentElement.dataset.screenMode===v,expected);assert.equal(await page.locator(`#screen-mode-${expected}`).getAttribute('aria-pressed'),'true');}
 const {context,page}=await open(pcUA,{width:1440,height:1000});await mode(page,'pc');assert.match(await page.locator('#screen-mode-status').textContent(),/자동/);
 assert.ok((await page.locator('#board-wrap').boundingBox()).width>500);
 const footer=await page.locator('#screen-mode-footer').boundingBox(),main=await page.locator('#game-view').boundingBox();assert.ok(footer.y>=main.y+main.height);
 await page.setViewportSize({width:844,height:390});await mode(page,'pc');await page.waitForTimeout(100);assert.equal(await page.locator('html').evaluate(e=>e.classList.contains('landscape-layout')),true);assert.ok((await page.locator('#board-wrap').boundingBox()).width>=120);
 await page.setViewportSize({width:390,height:844});await mode(page,'pc');assert.equal(await page.locator('.action-dock').evaluate(e=>getComputedStyle(e).position),'static');
 await page.locator('#screen-mode-mobile').click();await mode(page,'mobile');assert.equal(await page.locator('.action-dock').evaluate(e=>getComputedStyle(e).position),'static');assert.match(await page.locator('#screen-mode-status').textContent(),/직접 선택/);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));await mode(page,'mobile');
 await page.setViewportSize({width:1440,height:1000});await mode(page,'mobile');await page.waitForTimeout(100);
 assert.equal(await page.locator('#mobile-info-open').isVisible(),true);assert.equal(await page.locator('aside.side-panel').isVisible(),false);assert.equal(await page.locator('#shop-panel').isVisible(),true);
 await page.locator('#screen-mode-pc').click();await mode(page,'pc');assert.equal(await page.evaluate(()=>localStorage.getItem('autochess-screen-mode')),'pc');
 await page.locator('#screen-mode-auto').click();await mode(page,'pc');assert.equal(await page.evaluate(()=>localStorage.getItem('autochess-screen-mode')),null);
 await page.locator('#leave').click();await page.locator('#lobby').waitFor({state:'visible'});assert.equal(await page.locator('#screen-mode-footer').evaluate(e=>e.inert),false);await context.close();
 const phone=await open(mobileUA,{width:390,height:844});await mode(phone.page,'mobile');assert.equal(await phone.page.locator('.action-dock').evaluate(e=>getComputedStyle(e).position),'static');
 await phone.page.setViewportSize({width:844,height:390});await mode(phone.page,'mobile');await phone.page.waitForTimeout(100);assert.equal(await phone.page.locator('html').getAttribute('data-screen-orientation'),'landscape');assert.match(await phone.page.locator('#screen-mode-status').textContent(),/모바일 가로/);assert.ok((await phone.page.locator('#board-wrap').boundingBox()).width>=120);
 await phone.page.locator('#screen-mode-pc').click();await mode(phone.page,'pc');await phone.page.waitForTimeout(100);assert.equal(await phone.page.locator('html').evaluate(e=>e.classList.contains('landscape-layout')),true);assert.ok((await phone.page.locator('#board-wrap').boundingBox()).width>=120);
 await phone.page.reload();await phone.page.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));await mode(phone.page,'pc');
 await phone.page.locator('#screen-mode-auto').click();await mode(phone.page,'mobile');await phone.context.close();
 assert.deepEqual(errors,[]);console.log('PASS: UA defaults, footer selection, manual override/reload, stable mode on resize, desktop short-window regression, mobile dock/layout, restore auto and lobby focus');
 }finally{await browser?.close();proc.kill('SIGTERM');}})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
