const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const url='http://127.0.0.1:2623';
const proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2623',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
let output='';proc.stderr.on('data',d=>output+=d);
(async()=>{let browser;try{
 let healthy=false;for(let i=0;i<60;i++){try{if((await fetch(url+'/health')).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(healthy,output);
 browser=await chromium.launch(browserOptions());const errors=[],results=[];fs.mkdirSync('test-results/home-page',{recursive:true});
 for(const mode of ['pc','mobile']){
  const viewport=mode==='pc'?{width:1440,height:1000}:{width:390,height:844};
  const ctx=await browser.newContext({viewport,isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36'});
  const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  async function click(sel){const el=p.locator(sel);await el.scrollIntoViewIfNeeded();if(mode==='mobile')await el.tap();else await el.click();}
  async function home(){await p.locator('#lobby').waitFor({state:'visible'});assert.equal(await p.locator('#game-view').isVisible(),false);assert.equal(await p.locator('#pc-play-dock').isVisible(),false);assert.equal(await p.locator('#screen-mode-footer').evaluate(e=>e.inert),false);assert.equal(await p.locator('dialog[open]').count(),0);assert.equal(await p.locator('#lobby').evaluate(e=>getComputedStyle(e).position),'static');}
  async function game(){await p.locator('#game-view').waitFor({state:'visible'});await p.locator('#lobby').waitFor({state:'hidden'});assert.equal(await p.locator('#pc-play-dock').isVisible(),true);assert.equal(await p.locator('#game-view').evaluate(e=>e.inert),false);}
  await p.goto(url);await home();await p.waitForFunction(()=>document.documentElement.classList.contains('pc-layout')||document.documentElement.classList.contains('mobile-layout'));
  const geometry=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,home:document.querySelector('#lobby').getBoundingClientRect().toJSON(),footer:document.querySelector('#screen-mode-footer').getBoundingClientRect().toJSON(),pageHeight:document.documentElement.scrollHeight}));assert.equal(geometry.overflow,false);assert.ok(geometry.footer.y>=geometry.home.y+geometry.home.height);
  await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:`test-results/home-page/${mode}-home-0.19.0.png`,fullPage:true,animations:'disabled'});
  // Footer mode controls are usable before joining a room.
  await click(mode==='pc'?'#screen-mode-mobile':'#screen-mode-pc');await p.waitForFunction(mode=>document.documentElement.dataset.screenMode===mode,mode==='pc'?'mobile':'pc');await home();
  await click('#screen-mode-auto');await p.waitForFunction(mode=>document.documentElement.dataset.screenMode===mode,mode);await home();
  await p.locator('#nickname').focus();await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.id),'practice');await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.id),'create');
  await p.locator('#code').fill('ABC');await p.keyboard.press('Enter');assert.match(await p.locator('#lobby-status').textContent(),/4자리/);assert.equal(await p.locator('#code').getAttribute('aria-invalid'),'true');await home();
  await p.locator('#code').fill('DEAD');await click('#join');await p.waitForFunction(()=>document.querySelector('#lobby-status').textContent.startsWith('접속 실패:'));assert.equal(await p.locator('#join').isDisabled(),false);await home();
  await p.locator('#nickname').fill('메인 '+mode);await click('#practice');await game();await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));assert.match(await p.locator('.ranking-row[data-self="true"]').getAttribute('aria-label'),new RegExp('메인 '+mode));
  await debugClick(p,'debug-pause');const board=await p.locator('#board-wrap').evaluate(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,available:e.parentElement.clientWidth})),width=board.width;assert.ok(width>0&&width<=board.available&&Math.abs(width-board.height)<1,'square board fits the current layout');
  await p.reload();await game();await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));assert.match(await p.locator('.ranking-row[data-self="true"]').getAttribute('aria-label'),new RegExp('메인 '+mode));
  await click('#leave');await home();assert.equal(await p.locator('#nickname').inputValue(),'메인 '+mode);assert.equal(await p.evaluate(()=>document.activeElement.id),'nickname');assert.equal(await p.evaluate(()=>sessionStorage.getItem('duel-token')),null);
  // A friend starts from the same main page and submits the room code with Enter.
  await click('#create');await game();await p.waitForFunction(()=>document.querySelector('#phase').textContent==='상대 입장 대기');const code=(await p.locator('#room-code').textContent()).trim();
  assert.match(code,/^[A-F0-9]{4}$/);const guest=await ctx.newPage();guest.on('pageerror',e=>errors.push(e.message));await guest.goto(url);await guest.locator('#nickname').fill('친구 '+mode);await guest.locator('#code').fill(code.toLowerCase());await guest.locator('#code').press('Enter');
  await guest.locator('#game-view').waitFor({state:'visible'});await guest.locator('#lobby').waitFor({state:'hidden'});await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));assert.match(await p.locator('#phase').textContent(),/미니언전/);assert.equal(await p.locator('.player-vitals').count(),0);assert.ok((await p.locator('.ranking-row').allTextContents()).some(t=>t.includes('친구')));assert.equal(await p.locator('[data-opponent="true"]').count(),0);
  await guest.locator('#leave').click();await guest.locator('#lobby').waitFor({state:'visible'});await guest.close();
  await p.locator('#final-dialog').waitFor({state:'visible'});await click('#final-lobby');await home();
  for(const size of mode==='pc'?[{width:1024,height:768},{width:844,height:390}]:[{width:320,height:740},{width:844,height:390}]){
   await p.setViewportSize(size);await home();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.locator('#join').scrollIntoViewIfNeeded();assert.equal(await p.locator('#join').isVisible(),true);
  }
  results.push({mode,viewport,homeGeometry:geometry,boardWidth:width,entryModes:true,inlineErrors:true,modeBeforeEntry:true,reloadRestore:true,lobbyReturn:true,keyboard:true});await ctx.close();console.log('PASS:',mode,'inline main page, practice/create/join, error feedback, mode switching, keyboard, restore and return');
 }
 assert.deepEqual(errors,[]);fs.writeFileSync('test-results/home-page/results.json',JSON.stringify({version:require('../package.json').version,browser:browser.version(),results,errors},null,2));
 }finally{await browser?.close();proc.kill('SIGTERM');}})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
