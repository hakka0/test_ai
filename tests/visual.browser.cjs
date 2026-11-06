const {openDebug,closeInfo,debugClick}=require('./ui-helpers.cjs');
const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const pcUA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const mobileUA='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36';
const proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2598',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
(async()=>{let browser;try{
 for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:2598/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());
 fs.mkdirSync('docs/screenshots/verified',{recursive:true});const cases=[],errors=[];
 async function shot(page,name){await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`docs/screenshots/verified/${name}.png`,animations:'disabled'});}
 async function debug(page,id){await debugClick(page,id);}
 const viewports=[['pc-wide',1440,1000,'pc'],['pc-short',844,390,'pc'],['pc-portrait',390,844,'pc'],['mobile-portrait',390,844,'mobile'],['mobile-short',844,390,'mobile'],['mobile-small',320,740,'mobile']];
 for(const [name,width,height,mode] of viewports){
  const context=await browser.newContext({viewport:{width,height},userAgent:mode==='pc'?pcUA:mobileUA}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:2598');await page.locator('#practice').click();await page.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));
  await debug(page,'debug-pause');await page.waitForFunction(()=>document.querySelector('#debug-pause').getAttribute('aria-pressed')==='true');await closeInfo(page);await page.evaluate(()=>scrollTo(0,0));
  await page.waitForFunction(()=>document.querySelector('#board canvas')?.width>0);
  const metrics=await page.evaluate(()=>{const b=document.querySelector('#board-wrap').getBoundingClientRect();return {mode:document.documentElement.dataset.screenMode,boardWidth:b.width,boardHeight:b.height,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,actionDock:getComputedStyle(document.querySelector('.action-dock')).position};});
  assert.equal(metrics.mode,mode);assert.equal(metrics.horizontalOverflow,false);assert.ok(Math.abs(metrics.boardWidth-metrics.boardHeight)<1);
  if(name==='pc-wide')assert.ok(metrics.boardWidth>500);if(name==='pc-short')assert.ok(metrics.boardWidth>350);if(mode==='pc')assert.notEqual(metrics.actionDock,'fixed');
  await shot(page,name);cases.push({name,width,height,...metrics});
  if(name==='pc-wide'){
   await page.locator('#screen-mode-footer').scrollIntoViewIfNeeded();await shot(page,'mode-footer');
   await debug(page,'debug-next');await page.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));await debug(page,'debug-next');await page.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('라운드 결과'));
   await page.locator('#history-toggle').click();await page.locator('[data-history-round="1"]').click();await page.locator('#history-detail').scrollIntoViewIfNeeded();await shot(page,'history-contributions');await page.locator('#history-close').click();
   await openDebug(page);await page.locator('#debug-preset').selectOption('reward');await page.locator('#debug-apply').click();await page.locator('#reward-dialog').waitFor({state:'visible'});
   await shot(page,'reward-popup');const r=await page.locator('#reward-peek').boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.waitForFunction(()=>document.querySelector('#reward-panel').inert);await shot(page,'reward-peek');await page.mouse.up();await page.locator('#reward-later').click();
   await openDebug(page);await page.locator('#debug-preset').selectOption('early');await page.locator('#debug-apply').click();
   for(let i=0;i<120;i++){const phase=await page.locator('#phase').textContent();if(phase==='경기 종료')break;if(await page.locator('#reward-dialog').evaluate(e=>e.open))await page.locator('#reward-later').click();await debug(page,'debug-next');await page.waitForFunction(v=>document.querySelector('#phase').textContent!==v,phase);}
   await page.locator('#final-dialog').waitFor({state:'visible'});await shot(page,'final-results');
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync('docs/screenshots/verified/metrics.json',JSON.stringify({browser:browser.version(),cases,errors},null,2));console.log('PASS: six viewport renders, footer, rewards/peek, history/contributions and final-results screenshots');
 }finally{await browser?.close();proc.kill('SIGTERM');}})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
