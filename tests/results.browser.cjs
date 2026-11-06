const {debugClick}=require('./ui-helpers.cjs');
const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2595',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
(async()=>{let browser;try{
 for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:2595/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:2595');await page.locator('#nickname').fill('<b>A</b>');await page.locator('#practice').tap();await page.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));
 assert.equal(await page.locator('#final-dialog').isHidden(),true);assert.equal(await page.locator('#final-summary').isHidden(),true);
 const oldRoom=await page.locator('#room-code').textContent();await debugClick(page,'debug-pause');await page.waitForFunction(()=>document.querySelector('#debug-pause').getAttribute('aria-pressed')==='true');
 for(let i=0;i<120;i++){
  const phase=await page.locator('#phase').textContent();if(phase==='경기 종료')break;
  if(await page.locator('#reward-dialog').evaluate(el=>el.open))await page.locator('#reward-later').tap();
  await debugClick(page,'debug-next');await page.waitForFunction(previous=>document.querySelector('#phase').textContent!==previous,phase);
 }
 assert.equal(await page.locator('#phase').textContent(),'경기 종료');await page.locator('#final-dialog').waitFor({state:'visible'});
 assert.match(await page.locator('#final-title').textContent(),/최종 (승리|패배|무승부)/);assert.equal(await page.locator('.final-player').count(),2);assert.equal(await page.locator('#final-players b').count(),0);assert.ok((await page.locator('#final-players').textContent()).includes('<b>A</b>'));
 assert.equal(await page.locator('#history-panel').isHidden(),true);const title=await page.locator('#final-title').textContent();
 await page.keyboard.press('Escape');await page.locator('#final-dialog').waitFor({state:'hidden'});await page.waitForTimeout(300);assert.equal(await page.locator('#final-dialog').isHidden(),true);assert.equal(await page.locator('#final-summary').isVisible(),true);
 await page.locator('#final-open').tap();assert.equal(await page.locator('#final-title').textContent(),title);
 for(const viewport of [{width:320,height:740},{width:480,height:320},{width:844,height:390},{width:1440,height:1000}]){
  await page.setViewportSize(viewport);assert.ok(await page.evaluate(()=>{const d=document.querySelector('#final-dialog');return d.scrollWidth<=d.clientWidth&&document.documentElement.scrollWidth<=innerWidth;}));
 }
 await page.locator('#final-history').tap();await page.waitForFunction(()=>document.activeElement?.id==='combat-sheet-title');assert.equal(await page.locator('#final-dialog').isHidden(),true);assert.equal(await page.locator('#history-detail').isVisible(),true);assert.equal(await page.locator('.contribution-team').count(),1);
 const selected=await page.locator('#history-detail-title').textContent();await page.locator('#combat-sheet-close').tap();await page.locator('#final-open').tap();await page.locator('#final-history').tap();assert.equal(await page.locator('#history-detail-title').textContent(),selected);
 await page.locator('#combat-sheet-close').tap();await page.locator('#final-open').tap();await page.locator('#final-replay').tap();await page.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비')&&document.querySelector('#lobby').classList.contains('hidden'));
 assert.notEqual(await page.locator('#room-code').textContent(),oldRoom);assert.match(await page.locator('#round').textContent(),/라운드 1 /);assert.equal(await page.locator('#final-summary').isHidden(),true);assert.equal(await page.locator('#final-dialog').isHidden(),true);assert.equal(await page.locator('#history-panel').isHidden(),true);
 await page.locator('#history-toggle').tap();assert.equal(await page.locator('#history-rounds button:not(:disabled)').count(),0);assert.equal(await page.locator('#history-detail').isHidden(),true);await page.locator('#combat-sheet-close').tap();
 await page.locator('#leave').tap();await page.locator('#lobby').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#practice').disabled);
 assert.equal(await page.locator('#nickname').inputValue(),'<b>A</b>');assert.equal(await page.evaluate(()=>sessionStorage.getItem('duel-token')),null);assert.ok(await page.evaluate(()=>document.querySelector('main').inert));
 await page.reload();assert.equal(await page.locator('#lobby').isVisible(),true);await page.locator('#practice').tap();await page.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));assert.equal(await page.locator('#final-dialog').isHidden(),true);
 assert.deepEqual(errors,[]);console.log('PASS: final modal, close/reopen, safe names, history, viewport overflow, replay, lobby and fresh session');
 }finally{await browser?.close();proc.kill('SIGTERM');}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
