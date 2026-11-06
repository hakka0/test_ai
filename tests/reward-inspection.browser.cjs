const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots='docs/screenshots/reward-inspection';
const url='http://127.0.0.1:2651',server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2651',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const errors=[],results=[];
 for(const mode of ['pc','mobile']){
  const base=mode==='pc'?{width:1400,height:1000}:{width:390,height:844};
  const context=await browser.newContext({viewport:base,isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  const eye=p.locator('#reward-peek'),reward=p.locator('#reward-dialog'),unitDialog=p.locator('#unit-dialog');
  async function press(selector){const el=typeof selector==='string'?p.locator(selector):selector;if(mode==='mobile')await el.tap();else await el.click();}
  function samePlace(a,b){for(const key of ['x','y','width','height'])assert.ok(Math.abs(a[key]-b[key])<1,`${key}: ${JSON.stringify({a,b})}`);}
  async function inspect(value){
   const geometry=()=>p.evaluate(()=>({viewport:[innerWidth,innerHeight],scrollY,board:document.getElementById('board-wrap').getBoundingClientRect().toJSON(),dialog:document.getElementById('reward-dialog').getBoundingClientRect().toJSON(),row:document.querySelector('.reward-peek-row').getBoundingClientRect().toJSON(),panel:document.getElementById('reward-panel').getBoundingClientRect().toJSON()}));
   const before=await eye.boundingBox(),beforeGeometry=await geometry();await press(eye);await p.waitForFunction(v=>document.body.classList.contains('reward-inspecting')===v,value);
   await p.waitForTimeout(60);assert.equal(await eye.getAttribute('aria-pressed'),String(value));assert.equal(await reward.evaluate(e=>e.matches(':modal')),!value);
   assert.equal(await p.locator('#reward-panel').isVisible(),!value);assert.equal(await eye.isVisible(),true);
   try{samePlace(before,await eye.boundingBox());}catch(e){console.log(JSON.stringify({mode,value,beforeGeometry,afterGeometry:await geometry()}));throw e;}
   assert.equal(await p.locator('#reward-open').isVisible(),false);assert.equal(await p.locator('#reward-inspection-tools').count(),0,'no separate return control');
  }
  async function state(){return p.evaluate(()=>({gold:document.getElementById('gold').textContent,level:document.getElementById('level-label').textContent,xp:document.getElementById('experience-label').textContent,ready:document.getElementById('ready').textContent,deployed:document.getElementById('deployed').textContent,offers:[...document.querySelectorAll('[data-shop-slot]')].map(e=>({slot:e.dataset.shopSlot,id:e.dataset.offer,revision:e.dataset.revision,sold:e.classList.contains('shop-sold')})),board:[...document.querySelectorAll('#cells button')].map(e=>({x:e.dataset.x,y:e.dataset.y,label:e.getAttribute('aria-label')})),bench:[...document.querySelectorAll('[data-bench-slot]')].map(e=>({slot:e.dataset.benchSlot,id:e.dataset.unit})),items:[...document.querySelectorAll('#inventory .item')].map(e=>({id:e.querySelector('[data-item]').dataset.item,text:e.querySelector('div').textContent})),candidates:[...document.querySelectorAll('#reward-options [data-reward]')].map(e=>e.dataset.reward)}));}
  async function closeUnit(){if(await unitDialog.evaluate(e=>e.open))await press('#close-unit-dialog');}
  async function viewUnit(team){
   const anchor=await eye.boundingBox(),cell=p.locator(`#cells button[aria-label*="${team} 칸, 루멘,"]`).first();await press(cell);
   if(!await unitDialog.evaluate(e=>e.open))await press('#selected-unit-content img[role="button"]');
   await unitDialog.waitFor({state:'visible'});await p.waitForFunction(()=>document.getElementById('reward-peek').closest('#unit-dialog'));
   assert.equal(await unitDialog.getAttribute('data-read-only'),'true');assert.equal(await eye.isVisible(),true);samePlace(anchor,await eye.boundingBox());
   assert.equal(await unitDialog.evaluate(e=>e.scrollWidth<=e.clientWidth),true);
   assert.equal(await unitDialog.getAttribute('data-unit-side'),team==='아군'?'self':'enemy');assert.match(await p.locator('#unit-detail').textContent(),/장착 장비/);
   for(const id of ['dialog-equipment-panel','sell-unit','equipment-shortcut','bench-button'])assert.equal(await p.locator('#'+id).isVisible(),false,`${id} hidden`);
   assert.equal(await p.locator('#dialog-inventory button').count(),0);
   await p.screenshot({path:`${shots}/${mode}-${team==='아군'?'allied':'enemy'}-unit.png`,animations:'disabled'});
  }
  async function blockedMenus(){
   for(const selector of ['#player-ranking','#history-toggle','#inspection-combat-tab','#mobile-info-open','#equipment-toggle','[data-equipment-item]']){
    assert.equal(await p.locator(selector).first().evaluate(e=>!!e.closest('[inert]')),true,`${selector} inert`);
    const box=await p.locator(selector).first().boundingBox();
    if(box){const x=box.x+box.width/2,y=box.y+box.height/2;if(x>=0&&y>=0&&x<p.viewportSize().width&&y<p.viewportSize().height){if(mode==='mobile')await p.touchscreen.tap(x,y);else await p.mouse.click(x,y);}}
   }
   await p.evaluate(()=>{for(const selector of ['#history-toggle','#inspection-combat-tab','#mobile-info-open','#equipment-toggle','[data-equipment-item]','#recent-results button'])document.querySelector(selector)?.click();});
   for(const id of ['combat-record-dialog','pc-info-dialog','craft-dialog'])assert.equal(await p.locator('#'+id).evaluate(e=>e.open),false);
   assert.equal(await p.locator('#history-panel').isVisible(),false);assert.equal(await p.locator('#equipment-selection').isVisible(),false);
   assert.equal(await p.locator('#scout-banner').isVisible(),false);
   assert.equal(await p.locator('#equipment-sidebar').evaluate(e=>e.classList.contains('is-open')),false);
   await p.locator('#history-toggle').evaluate(e=>e.focus());assert.equal(await p.locator('#history-toggle').evaluate(e=>e===document.activeElement),false,'locked controls cannot receive keyboard focus');
  }
  await p.goto(url);await press('#practice');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));
  await debugClick(p,'debug-pause');await debugPreset(p,'early');
  for(let round=1;round<=4;round++){
   await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));
   await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('라운드 결과'));await debugClick(p,'debug-next');
  }
  await reward.waitFor({state:'visible'});assert.equal(await p.locator('#recent-results button').count(),4);assert.equal(await p.locator('#reward-options button').count(),3);
  const before=await state();await p.screenshot({path:`${shots}/${mode}-reward.png`,animations:'disabled'});
  await inspect(true);await p.waitForTimeout(180);assert.equal(await eye.getAttribute('aria-pressed'),'true');
  for(const id of ['buy-experience','reroll','ready'])assert.equal(await p.locator('#'+id).isDisabled(),true);
  assert.equal(await p.locator('#shop-offers button:enabled').count(),0);await blockedMenus();
  await p.evaluate(()=>{for(const selector of ['#buy-experience','#reroll','#ready','#shop-offers [data-offer]']){const e=document.querySelector(selector);if(e){e.disabled=false;e.click();e.disabled=true;}}});
  await viewUnit('아군');await closeUnit();await viewUnit('상대');await inspect(false);assert.equal(await unitDialog.evaluate(e=>e.open),false);
  await inspect(true);await blockedMenus();assert.deepEqual(await state(),before);
  const own=p.locator('#cells button[aria-label*="아군 칸, 루멘,"]').first(),target=p.locator('#cells button[aria-label*="아군 칸, 빈 칸"]').last();
  const a=await own.boundingBox(),b=await target.boundingBox();
  if(mode==='mobile'){
   const cdp=await context.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await p.mouse.up();}
  await closeUnit();await press(target);await p.locator('[data-bench-slot="11"]').evaluate(e=>e.click());assert.deepEqual(await state(),before);
  await eye.focus();await p.keyboard.press('Enter');assert.equal(await eye.getAttribute('aria-pressed'),'false');
  await eye.focus();await p.keyboard.press('Space');assert.equal(await eye.getAttribute('aria-pressed'),'true');
  const frames=mode==='pc'?[[1400,1000],[1920,1080],[1366,768],[1024,768],[390,844],[320,740],[844,390],[480,320]]:[[390,844],[320,740],[360,640],[414,896],[768,1024],[844,390],[480,320]];
  for(const [width,height] of frames){
   await p.setViewportSize({width,height});await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(160);
   const m=await p.evaluate(()=>{const e=document.getElementById('reward-peek'),r=e.getBoundingClientRect();return{eye:r.toJSON(),pressed:e.getAttribute('aria-pressed'),modal:document.getElementById('reward-dialog').matches(':modal'),overflow:document.documentElement.scrollWidth>innerWidth,ids:[...document.querySelectorAll('[id]')].map(e=>e.id).filter((id,i,all)=>all.indexOf(id)!==i)};});
   assert.equal(m.pressed,'true');assert.equal(m.modal,false);assert.equal(m.overflow,false,JSON.stringify(m));assert.deepEqual(m.ids,[]);assert.ok(m.eye.x>=0&&m.eye.right<=width&&m.eye.y>=0&&m.eye.bottom<=height,JSON.stringify(m));
   await inspect(false);await inspect(true);
   if(width===320||(width===480&&height===320)){await viewUnit('상대');await inspect(false);await inspect(true);}
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}.png`,animations:'disabled'});results.push({mode,width,height,...m});
  }
  await p.setViewportSize(base);await p.waitForTimeout(150);assert.deepEqual(await state(),before);await p.screenshot({path:`${shots}/${mode}-inspection.png`,animations:'disabled'});
  await p.reload();await reward.waitFor({state:'visible'});assert.equal(await eye.getAttribute('aria-pressed'),'false');assert.deepEqual(await state(),before);
  // Exercise the deadline through the debug handler; its UI is intentionally locked.
  await p.evaluate(()=>document.getElementById('debug-save').onclick());await p.waitForFunction(()=>document.querySelector('#debug-status').textContent.includes('저장 상태 있음'));
  await inspect(true);await p.evaluate(()=>document.getElementById('debug-next').onclick());await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));
  assert.equal(await p.locator('body').evaluate(e=>e.classList.contains('reward-inspecting')),false);assert.equal(await eye.isVisible(),false);assert.match(await p.locator('#reward-receipt').textContent(),/자동 선택/);
  for(const id of ['buy-experience','equipment-toggle','history-toggle'])assert.equal(await p.locator('#'+id).evaluate(e=>!!e.closest('[inert]')),false,'inspection locks restored');
  await debugClick(p,'debug-load');await reward.waitFor({state:'visible'});
  const gold=Number(await p.locator('#gold').textContent()),amount=Number((await p.locator('#reward-options button').first().textContent()).match(/골드 (\d+)/)[1]);
  await press(p.locator('#reward-options button').first());await reward.waitFor({state:'hidden'});await p.waitForFunction(expected=>Number(document.querySelector('#gold').textContent)===expected,gold+amount);
  assert.equal(await p.locator('#buy-experience').isDisabled(),false);assert.doesNotMatch(await p.locator('#reward-receipt').textContent(),/자동 선택/);
  await press('#history-toggle');await p.locator('#history-detail').waitFor({state:'visible'});
  if(await p.locator('#combat-record-dialog').evaluate(e=>e.open))await press('#combat-sheet-close');else await press('#inspection-unit-tab');
  await press('#equipment-toggle');await press(p.locator('[data-equipment-item]').first());await p.locator('#craft-dialog').waitFor({state:'visible'});assert.equal(await p.locator('#equipment-selection').isVisible(),false,'ordinary item inspection does not arm an equip');await press('#craft-close');
  console.log('PASS',mode,'actual round-five unit-only inspection, eye remains in the same position, locked equipment/history/info/gameplay, 15 frames, keyboard, reload, deadline and normal control restoration');await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,errors},null,2));
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
