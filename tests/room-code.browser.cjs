const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots='docs/screenshots/room-code-copy',url='http://127.0.0.1:2661';
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2661',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const errors=[],results=[];
 for(const mode of ['pc','mobile']){
  const ctx=await browser.newContext({viewport:mode==='pc'?{width:1400,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',permissions:['clipboard-read','clipboard-write'],userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  async function press(selector){if(mode==='mobile')await p.locator(selector).tap();else await p.locator(selector).click();}
  async function copied(code){await p.waitForFunction(async code=>(await navigator.clipboard.readText())===code,code);assert.equal(await p.locator('#room-code-copy').getAttribute('data-copied'),'true');}
  await p.goto(url);assert.equal(await p.locator('#room-code-control').isVisible(),false);assert.equal(await p.locator('#room-code-copy').isDisabled(),true);await press('#practice');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));await debugClick(p,'debug-pause');
  const code=await p.locator('#room-code').textContent();assert.equal(await p.locator('.room-code-label').textContent(),'방 코드');
  await press('#room-code-copy');await copied(code);assert.match(await p.locator('#notice').textContent(),/방 코드를 복사했습니다/);assert.equal(await p.locator('#room-code-toggle').getAttribute('aria-pressed'),'false');assert.match(await p.locator('#room-code').evaluate(e=>getComputedStyle(e).filter),/blur/);
  await p.locator('header').screenshot({path:`${shots}/${mode}-header.png`,animations:'disabled'});await p.waitForFunction(()=>document.getElementById('room-code-copy').dataset.copied==='false');
  await press('#room-code-toggle');await press('#room-code-copy');await copied(code);assert.equal(await p.locator('#room-code-toggle').getAttribute('aria-pressed'),'true');
  if(mode==='pc'){for(const key of ['Enter','Space']){await p.evaluate(()=>navigator.clipboard.writeText('keyboard-copy-check'));await p.locator('#room-code-copy').focus();await p.keyboard.press(key);await copied(code);}}
  await press('#room-code-toggle');
  await p.evaluate(()=>{navigator.clipboard.writeText('fallback-copy-check');});
  await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));await press('#room-code-copy');await p.waitForFunction(()=>document.getElementById('room-code-copy').dataset.copied==='true');await p.evaluate(()=>delete navigator.clipboard);await copied(code);
  assert.equal(await p.locator('#room-code-toggle').getAttribute('aria-pressed'),'false');
  await p.evaluate(async()=>{await navigator.clipboard.writeText('failed-copy-check');window.savedCopyCommand=document.execCommand;document.execCommand=()=>false;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('test denied');}}});});
  await press('#room-code-copy');await p.waitForFunction(()=>document.getElementById('notice').textContent.startsWith('복사하지 못했습니다'));assert.equal(await p.locator('#room-code-copy').getAttribute('data-copied'),'false');assert.equal(await p.locator('#room-code-copy').isDisabled(),false);
  await p.evaluate(()=>{delete navigator.clipboard;document.execCommand=window.savedCopyCommand;delete window.savedCopyCommand;});assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),'failed-copy-check');
  await press('#leave');await p.locator('#lobby').waitFor({state:'visible'});assert.equal(await p.locator('#room-code-copy').isDisabled(),true);await p.locator('#room-code-copy').evaluate(e=>e.onclick());assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),'failed-copy-check');
  await press('#practice');await p.locator('#game-view').waitFor({state:'visible'});await debugClick(p,'debug-pause');const nextCode=await p.locator('#room-code').textContent();assert.notEqual(nextCode,code);assert.equal(await p.locator('#room-code-toggle').getAttribute('aria-pressed'),'false');await press('#room-code-copy');await copied(nextCode);
  const frames=mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320]];
  for(const [width,height] of frames){await p.setViewportSize({width,height});await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(120);
   const m=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return {code:r('room-code-control'),copy:r('room-code-copy'),eye:r('room-code-toggle'),motion:r('motion'),leave:r('leave'),overflow:document.documentElement.scrollWidth>innerWidth};});
   assert.equal(m.overflow,false,JSON.stringify({mode,width,height,m}));assert.ok(m.code.x>=0&&m.code.right<=m.motion.x&&m.leave.right<=width,JSON.stringify({mode,width,height,m}));
   for(const rect of [m.copy,m.eye])assert.ok(rect.width>=32&&rect.height>=32&&rect.right<=width&&rect.bottom<=height);
   await p.evaluate(()=>navigator.clipboard.writeText('viewport-copy-check'));await press('#room-code-copy');await copied(nextCode);assert.equal(await p.locator('#room-code-toggle').getAttribute('aria-pressed'),'false');
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}.png`,animations:'disabled'});results.push({mode,width,height,...m});
  }
  await ctx.close();console.log('PASS',mode,'room-code label, actual clipboard copy while concealed/revealed, keyboard, HTTP fallback, honest failure, new room/reset and header layouts');
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,errors},null,2));
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
