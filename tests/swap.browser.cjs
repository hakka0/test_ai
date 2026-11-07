const {debugClick}=require('./ui-helpers.cjs');
const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2585',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
(async()=>{let browser;try{
 for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:2585/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());
 const context=await browser.newContext({viewport:{width:390,height:1800},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:2585');await page.locator('#practice').tap();await require('./ui-helpers.cjs').selectDock(page,'bench');await page.locator('[data-bench-slot="11"]').waitFor();
 await debugClick(page,'debug-pause');await require('./ui-helpers.cjs').debugPreset(page);await page.waitForFunction(()=>document.querySelector('#debug-pause').getAttribute('aria-pressed')==='true');
 const cdp=await context.newCDPSession(page);
 const center=async selector=>{const box=await page.locator(selector).boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=1800);return {x:box.x+box.width/2,y:box.y+box.height/2};};
 async function drag(from,to){
  const start=await page.locator(from).boundingBox(),end=await page.locator(to).boundingBox();
  const dock=await page.locator('.action-dock').boundingBox(),fixed=await page.locator('.action-dock').evaluate(e=>getComputedStyle(e).position==='fixed');
  const limit=fixed?dock.y-12:1800;
  const shift=Math.max(0,Math.max(start.y+start.height,end.y+end.height)-limit);
  assert.ok(Math.min(start.y,end.y)-shift>=0,'Both drag endpoints must fit above the fixed controls');
  if(shift)await page.evaluate(v=>scrollBy(0,v),shift);
  const a=await center(from),b=await center(to);
  for(const [selector,point] of [[from,a],[to,b]])assert.ok(await page.evaluate(({selector,point})=>!!document.elementFromPoint(point.x,point.y)?.closest(selector),{selector,point}),`Covered endpoint: ${selector}`);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...b,id:1}]});
  await page.locator('.unit-drag-ghost:not(.hidden)').waitFor();
  assert.equal(await page.locator('.unit-drag-ghost').getAttribute('data-valid'),'true');assert.match(await page.locator('.unit-drag-ghost').textContent(),/자리 교환/);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 const cell='#cells button[data-x="2"][data-y="6"]',slot0='[data-bench-slot="0"]',slot1='[data-bench-slot="1"]';
 const shiroko=await page.locator(slot0).getAttribute('data-unit'),hifumi=await page.locator(slot1).getAttribute('data-unit');
 await drag(slot0,cell);await page.waitForFunction(()=>document.querySelector('#cells button[data-x="2"][data-y="6"]').getAttribute('aria-label').includes('실바'));
 const yuuka=await page.locator(slot0).getAttribute('data-unit');assert.notEqual(yuuka,shiroko);assert.equal(await page.locator('#deployed').textContent(),'출전 1 / 1명');
 assert.equal(await page.locator('#unit-dialog').evaluate(el=>el.open),false);
 await drag(slot0,slot1);await page.waitForFunction(id=>document.querySelector('[data-bench-slot="0"]').dataset.unit===id,hifumi);
 assert.equal(await page.locator(slot1).getAttribute('data-unit'),yuuka);
 await drag(cell,slot1);await page.waitForFunction(id=>document.querySelector('[data-bench-slot="1"]').dataset.unit===id,shiroko);
 assert.match(await page.locator(cell).getAttribute('aria-label'),/루멘/);assert.equal(await page.locator('#deployed').textContent(),'출전 1 / 1명');
 await page.reload();await page.waitForFunction(id=>document.querySelector('[data-bench-slot="1"]')?.dataset.unit===id,shiroko);assert.match(await page.locator(cell).getAttribute('aria-label'),/루멘/);
 await page.locator('#ready').tap();await page.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));
 const a=await center(slot1),b=await center(cell);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...b,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.equal(await page.locator('.unit-drag-ghost.hidden').count(),1);assert.equal(await page.locator(slot1).getAttribute('data-unit'),shiroko);
 assert.deepEqual(errors,[]);console.log('PASS: mobile swap highlights, both directions, bench swap, reconnect, combat lock');
 }finally{await browser?.close();proc.kill('SIGTERM');}})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
