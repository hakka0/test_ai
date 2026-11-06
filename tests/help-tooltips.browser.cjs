const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset,openDebug}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots='docs/screenshots/help-tooltips';
const url='http://127.0.0.1:2647',server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2647',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const errors=[],results=[];
 for(const mode of ['pc','mobile']){
  const base=mode==='pc'?{width:1400,height:1000}:{width:390,height:844};
  const context=await browser.newContext({viewport:base,isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  const tip=p.locator('#game-help-tooltip'),button=key=>p.locator(`.help-trigger[data-help="${key}"]`).filter({visible:true}).first();
  async function press(locator){if(mode==='mobile')await locator.tap();else await locator.click();}
  async function dismissHelp(key){if(mode==='mobile')await press(button(key));else await p.mouse.move(0,0);await tip.waitFor({state:'hidden'});}
  async function visibleHelp(key,match){
   await button(key).scrollIntoViewIfNeeded();await p.waitForTimeout(100);
   if(mode==='mobile')await press(button(key));else {await p.mouse.move(0,0);await button(key).hover();}
   await tip.waitFor({state:'visible'}).catch(async e=>{console.log('HELP STATE',mode,p.viewportSize(),key,await p.evaluate(()=>({mode:document.documentElement.dataset.screenMode,dialogs:[...document.querySelectorAll('dialog[open]')].map(e=>e.id),tip:document.getElementById('game-help-tooltip').outerHTML})));throw e;});assert.match(await tip.textContent(),match);
   assert.equal(await button(key).getAttribute('aria-expanded'),'true');
   const m=await tip.evaluate(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,overflow:e.scrollWidth>e.clientWidth,topLayer:e.matches(':popover-open'),hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
   assert.ok(m.x>=7&&m.y>=7&&m.right<=p.viewportSize().width-7&&m.bottom<=p.viewportSize().height-7,JSON.stringify(m));
   assert.equal(m.overflow,false);assert.equal(m.topLayer,true);assert.equal(m.hit,true,'tooltip is above its owning modal');
   results.push({mode,viewport:p.viewportSize(),key,...m});
  }
  await p.goto(url);await press(p.locator('#practice'));await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));
  await debugClick(p,'debug-pause');await debugPreset(p,'early');
  assert.equal(await p.locator('#help-sources').isVisible(),false);
  assert.equal(await p.locator('.equipment-help').isVisible(),false);assert.equal(await p.locator('#synergy-timing').isVisible(),false);
  assert.equal(await p.locator('#equipment-selection').isVisible(),false);
  if(mode==='mobile'){assert.equal(await button('equipment').count(),0);await press(p.locator('#equipment-toggle'));}
  await visibleHelp('equipment',/장비는 유닛 위로 드래그/);assert.equal(await p.locator('dialog[open]').count(),0);
  await p.waitForTimeout(180);assert.equal(await tip.isVisible(),true,'hover or mobile selection survives snapshots');
  await p.screenshot({path:`${shots}/${mode}-equipment-help.png`,animations:'disabled'});
  await dismissHelp('equipment');
  // Escape dismisses help before cancelling an equipment selection.
  await press(p.locator('[data-equipment-item]').first());
  await p.locator('#craft-dialog').waitFor({state:'visible'});await press(p.locator('#item-equip'));
  assert.equal(await p.locator('#equipment-selection').isVisible(),false);assert.equal(await p.locator('#equipment-selection').textContent(),'');
  await visibleHelp('equipment',/유닛당 장비 2개/);await p.keyboard.press('Escape');await tip.waitFor({state:'hidden'});
  assert.equal(await p.locator('#equipment-cancel').isVisible(),true);await press(p.locator('#equipment-cancel'));
  if(mode==='mobile')await press(p.locator('#equipment-close'));
  const unit=p.locator('#cells button[aria-label*="아군 칸, 루멘,"]').first();
  await visibleHelp('synergy',/중복 종류와 대기석 제외/);
  await press(unit);await tip.waitFor({state:'hidden'});assert.equal(await unit.getAttribute('aria-pressed'),'true','outside tap still selects unit');
  if(mode==='mobile'){await p.locator('#unit-dialog').waitFor({state:'visible'});await press(p.locator('#close-unit-dialog'));}
  if(mode==='pc'){
   await p.mouse.move(0,0);await button('synergy').hover();await tip.waitFor({state:'visible'});
   await p.mouse.move(0,0);await tip.waitFor({state:'hidden'});
   await button('synergy').focus();await p.keyboard.press('Enter');assert.equal(await tip.isVisible(),false,'PC keyboard click does not open a tooltip');
   await button('synergy').evaluate(e=>e.click());assert.equal(await tip.isVisible(),false,'PC click does not open a tooltip');
   await button('synergy').hover();await tip.waitFor({state:'visible'});await button('synergy').click();assert.equal(await tip.isVisible(),true,'PC click does not pin or dismiss hovered help');
   await p.mouse.move(0,0);await tip.waitFor({state:'hidden'});
   await visibleHelp('unit',/초상화를 누르면 장비·판매/);await p.keyboard.press('Escape');
  }
  for(const viewport of [base,{width:320,height:740},{width:480,height:320}]){
   await p.setViewportSize(viewport);await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(150);
   await visibleHelp('synergy',/배치 미리보기/);assert.equal(await p.locator('dialog[open]').count(),0);
   await p.screenshot({path:`${shots}/${mode}-${viewport.width}-${viewport.height}.png`,animations:'disabled'});
   await dismissHelp('synergy');
   await press(p.locator('#mobile-info-open'));
   await visibleHelp('rewardSummary',/5라운드마다/);
   await p.keyboard.press('Escape');await tip.waitFor({state:'hidden'});assert.equal(await p.locator('#pc-info-dialog').evaluate(e=>e.open),true);
   await p.screenshot({path:`${shots}/${mode}-modal-${viewport.width}-${viewport.height}.png`,animations:'disabled'});
   await press(p.locator('#pc-info-tabs [data-pc-info="help"]'));assert.match(await p.locator('#pc-info-help').textContent(),/키보드: Tab/);
   await press(p.locator('#pc-info-close'));
  }
  await p.setViewportSize(base);await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(100);
  // Explicit item selection remains usable after help; keyboard targeting also
  // works when the expanded mobile equipment drawer covers the battlefield.
  if(await p.locator('#equipment-toggle').getAttribute('aria-expanded')!=='true')await press(p.locator('#equipment-toggle'));
  await press(p.locator('[data-equipment-item]').first());await p.locator('#craft-dialog').waitFor({state:'visible'});await press(p.locator('#item-equip'));
  if(mode==='mobile'){await unit.focus();await p.keyboard.press('Enter');}else await press(unit);
  await p.waitForFunction(()=>document.querySelectorAll('[data-equipment-item]').length===2);
  if(await p.locator('#unit-dialog').evaluate(e=>e.open))await press(p.locator('#close-unit-dialog'));
  if(await p.locator('#equipment-close').isVisible())await press(p.locator('#equipment-close'));
  // Reward help is in the dialog's top layer and does not choose a reward.
  await openDebug(p);await p.locator('#debug-preset').selectOption('reward');await press(p.locator('#debug-apply'));
  await p.locator('#reward-dialog').waitFor({state:'visible'});await visibleHelp('reward',/골드를 자동 선택/);
  assert.equal(await p.locator('#reward-options button').count(),3);assert.equal(await p.locator('#reward-help').isVisible(),false);
  await p.screenshot({path:`${shots}/${mode}-reward-help.png`,animations:'disabled'});
  await p.keyboard.press('Escape');assert.equal(await p.locator('#reward-dialog').evaluate(e=>e.open),true);
  await visibleHelp('peek',/눈 버튼/);await dismissHelp('peek');
  await press(p.locator('#reward-peek'));assert.equal(await p.locator('#reward-peek').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('#reward-dialog').evaluate(e=>e.matches(':modal')),false);assert.equal(await p.locator('#reward-panel').isVisible(),false);
  await press(p.locator('#reward-peek'));
  assert.equal(await p.locator('#reward-peek').getAttribute('aria-pressed'),'false');
  await press(p.locator('#reward-options button').first());await p.locator('#reward-dialog').waitFor({state:'hidden'});
  await debugClick(p,'debug-next');await debugClick(p,'debug-next');
  await press(p.locator('#history-toggle'));await press(p.locator('#history-rounds button:not(:disabled)').first());await p.locator('#history-detail').waitFor({state:'visible'});
  await visibleHelp('contributions',/실제 체력 변화 기준/);await p.keyboard.press('Escape');assert.equal(await p.locator('#history-panel').isVisible(),true);
  assert.ok(await p.locator('[data-contribution-unit]').count()>0);await p.keyboard.press('Escape');
  await p.reload();
  await p.locator('#game-view').waitFor({state:'visible'});assert.equal(await tip.isVisible(),false);
  console.log('PASS',mode,'help tooltip touch/mouse/keyboard, dismissal, modal top layer, small viewports, selection/equipment/rewards/history and reload');
  await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,errors},null,2));
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
