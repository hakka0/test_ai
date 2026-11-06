const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset,selectDock}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const url='http://127.0.0.1:2625',proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2625',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
(async()=>{let browser;try{
 let healthy=false;for(let i=0;i<60;i++){try{if((await fetch(url+'/health')).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(healthy);
 browser=await chromium.launch(browserOptions());const errors=[],results=[];fs.mkdirSync('docs/screenshots/gold-dock',{recursive:true});
 for(const mode of ['pc','mobile']){
  const base=mode==='pc'?{width:1440,height:1000}:{width:390,height:844},ctx=await browser.newContext({viewport:base,isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36'});
  const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  async function click(sel){const e=p.locator(sel);await e.scrollIntoViewIfNeeded();if(mode==='mobile')await e.tap();else await e.click();}
  const gold=async()=>parseInt(await p.locator('#gold').textContent());
  async function updated(value){await p.waitForFunction(v=>parseInt(document.querySelector('#gold').textContent)===v,value);assert.equal(await p.locator('#gold').getAttribute('aria-label'),`보유 골드 ${value}`);}
  async function switchView(next){const current=await p.locator('#dock-view-switch').getAttribute('data-view');assert.notEqual(current,next);await click('#dock-view-switch');assert.equal(await p.locator('#dock-view-switch').getAttribute('data-view'),next);assert.equal(await p.locator('#dock-view-switch').textContent(),next==='shop'?'⇄ 대기석 보기':'⇄ 상점 보기');assert.equal(await p.locator('#pc-dock-reserve > :visible').count(),1);}
  await p.goto(url);await click('#practice');await p.locator('#game-view').waitFor({state:'visible'});await debugClick(p,'debug-pause');await updated(10);
  assert.equal(await p.locator('#dock-view-switch').count(),1);assert.equal(await p.locator('[data-dock-tab]').count(),0);assert.equal(await p.locator('#dock-gold .gold-coin').isVisible(),true);assert.equal(await p.locator('#units [data-unit]').count(),0);
  const height=await p.locator('#pc-play-dock').evaluate(e=>e.getBoundingClientRect().height);await switchView('bench');assert.equal(await p.locator('#dock-gold').isVisible(),true);await switchView('shop');assert.equal(await p.locator('#pc-play-dock').evaluate(e=>e.getBoundingClientRect().height),height);
  const offer=p.locator('#shop-offers [data-offer]:not(:disabled)').first(),cost=Number((await offer.getAttribute('aria-label')).match(/(\d+) 골드/)[1]);await offer.click();await updated(10-cost);await switchView('bench');
  const beforeXP=await gold();await click('#buy-experience');await updated(beforeXP-4);assert.equal(await p.locator('#dock-view-switch').getAttribute('data-view'),'bench');
  await click('#pc-dock-toggle');assert.equal(await p.locator('#pc-dock-reserve').isVisible(),false);assert.equal(await p.locator('#dock-gold').isVisible(),true);await click('#dock-view-switch');assert.equal(await p.locator('#pc-dock-reserve').isVisible(),true);assert.equal(await p.locator('#dock-view-switch').getAttribute('data-view'),'shop');
  await p.locator('#dock-view-switch').focus();await p.keyboard.press('Enter');assert.equal(await p.locator('#dock-view-switch').getAttribute('data-view'),'bench');await p.keyboard.press('Space');assert.equal(await p.locator('#dock-view-switch').getAttribute('data-view'),'shop');await switchView('bench');
  const savedGold=await gold();await p.reload();await p.locator('#game-view').waitFor({state:'visible'});await updated(savedGold);assert.equal(await p.locator('#dock-view-switch').getAttribute('data-view'),'bench');
  await click(mode==='pc'?'#screen-mode-mobile':'#screen-mode-pc');assert.equal(await p.locator('#dock-view-switch').getAttribute('data-view'),'bench');assert.equal(await p.locator('#dock-gold').isVisible(),true);await click('#screen-mode-'+mode);await p.evaluate(()=>scrollTo(0,0));
  await debugPreset(p,'mid');await p.waitForFunction(()=>document.querySelector('#level-label').textContent.includes('레벨 7'));await selectDock(p,'shop');
  const geometry=[];
  for(const [width,height] of mode==='pc'?[[1440,1000],[1920,1080],[1366,768],[1024,768],[390,844]]:[[390,844],[320,740],[360,640],[414,896],[768,1024],[844,390]]){
   await p.setViewportSize({width,height});await p.evaluate(()=>scrollTo(0,0));let dockHeight;
   for(const view of ['shop','bench']){await selectDock(p,view);await p.waitForTimeout(80);
    const m=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect(),d=r('pc-play-dock'),g=r('dock-gold'),b=r('dock-view-switch'),xp=r('buy-experience'),ready=r('ready');return {overflow:document.documentElement.scrollWidth>innerWidth,dockHeight:d.height,boardWidth:r('board-wrap').width,goldFont:parseFloat(getComputedStyle(document.getElementById('gold')).fontSize),goldVisible:g.width>0&&g.left>=0&&g.right<=innerWidth,goldFits:document.getElementById('dock-gold').scrollWidth<=g.width,switchWidth:b.width,switchHeight:b.height,actionsGap:ready.left-xp.right,actionsDetached:xp.bottom<d.top&&ready.bottom<d.top};});
    assert.equal(m.overflow,false);assert.equal(m.goldVisible,true);assert.equal(m.goldFits,true);assert.ok(m.goldFont>=24);assert.ok(m.switchWidth>=44&&m.switchHeight>=44);assert.ok(m.actionsGap>=24);assert.equal(m.actionsDetached,true);if(dockHeight!==undefined)assert.equal(m.dockHeight,dockHeight);dockHeight=m.dockHeight;if(mode==='pc'&&width===1440)assert.equal(m.boardWidth,560);
    for(const sel of ['#dock-view-switch','#pc-dock-toggle']){const rect=await p.locator(sel).boundingBox();assert.ok(await p.evaluate(({sel,x,y})=>!!document.elementFromPoint(x,y)?.closest(sel),{sel,x:rect.x+rect.width/2,y:rect.y+rect.height/2}));}
    geometry.push({width,height,view,...m});
   }
  }
  await p.setViewportSize(base);await p.evaluate(()=>scrollTo(0,0));await selectDock(p,'shop');await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:`docs/screenshots/gold-dock/${mode}-shop-0.19.3.png`,fullPage:true,animations:'disabled'});await switchView('bench');await p.screenshot({path:`docs/screenshots/gold-dock/${mode}-bench-0.19.3.png`,fullPage:true,animations:'disabled'});
  // The maximum-level preset remains readable in the same header.
  await debugPreset(p,'level10');await p.waitForFunction(()=>document.querySelector('#level-label').textContent.includes('레벨 10'));assert.equal(await p.locator('#dock-gold').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
  if(await p.locator('#reward-dialog').evaluate(e=>e.open))await click('#reward-later');
  await debugPreset(p,'mid');await selectDock(p,'shop');await click('#ready');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));let before=await gold();await click('#reroll');await updated(before-5);
  await switchView('bench');before=await gold();await click('#buy-experience');await updated(before-4);await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent==='라운드 결과');
  await switchView('shop');before=await gold();const resultOffer=p.locator('#shop-offers [data-offer]:not(:disabled)').first(),resultCost=Number((await resultOffer.getAttribute('aria-label')).match(/(\d+) 골드/)[1]);await resultOffer.click();await updated(before-resultCost);await switchView('bench');
  before=await gold();await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));assert.ok(await gold()>before);assert.equal(await p.locator('#dock-view-switch').getAttribute('data-view'),'bench');
  results.push({mode,geometry,liveGold:true,singleSwitch:true,keyboard:true,foldedGold:true,reloadAndModePreserved:true,combatResultPurchases:true,nextRoundIncome:true});await ctx.close();console.log('PASS:',mode,'large persistent live gold, single switch, purchase/XP/reroll/income, fold, keyboard, reload, mode and viewport matrix');
 }
 assert.deepEqual(errors,[]);fs.writeFileSync('docs/screenshots/gold-dock/results.json',JSON.stringify({version:'0.19.3',browser:browser.version(),results,errors},null,2));
 }finally{await browser?.close();proc.kill('SIGTERM');}})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
