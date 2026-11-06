const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset,openDebug}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const url='http://127.0.0.1:2645',proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2645',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
const version=require('../package.json').version,shots='docs/screenshots/shop-streak-header';fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser;try{
 let healthy=false;for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(healthy);
 browser=await chromium.launch(browserOptions());const errors=[],results=[],streakResults=[];
 for(const mode of ['pc','mobile']){
  const base=mode==='pc'?{width:1400,height:1000}:{width:390,height:844};
  const ctx=await browser.newContext({viewport:base,isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/153.0.0.0 Mobile Safari/537.36'});
  const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url);await p.locator('#practice').click();await p.locator('#game-view').waitFor({state:'visible'});await p.waitForFunction(()=>document.querySelector('#deployed').textContent==='0/1');await debugClick(p,'debug-pause');await debugPreset(p,'early');
  assert.equal(await p.locator('#dock-view-switch,#reserve-toggle,#pc-dock-toggle').count(),0);
  const frames=mode==='pc'?[[1400,1000],[1920,1080],[1366,768],[1024,768],[390,844],[320,740],[844,390],[480,320]]:[[390,844],[320,740],[360,640],[414,896],[768,1024],[844,390],[480,320]];
  for(const [width,height] of frames){
   await p.setViewportSize({width,height});await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(180);await p.evaluate(async()=>{await document.fonts.ready;await new Promise(requestAnimationFrame);});
   const m=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return{board:r('board-wrap'),bench:r('bench'),shop:r('shop-panel'),dock:r('pc-play-dock'),caption:document.querySelector('.arena-caption')?.getBoundingClientRect().toJSON()??null,economy:r('shop-economy'),level:r('pc-growth'),track:r('experience-track'),xp:r('buy-experience'),control:r('shop-control-column'),roll:r('reroll'),readyCell:r('dock-ready'),streak:r('dock-streak'),ready:r('ready'),gold:r('dock-gold'),orientation:document.getElementById('experience-track').getAttribute('aria-orientation'),overflow:document.documentElement.scrollWidth>innerWidth,slots:[...document.querySelectorAll('[data-bench-slot]')].map(e=>e.getBoundingClientRect().toJSON()),duplicateIDs:[...document.querySelectorAll('[id]')].map(e=>e.id).filter((id,i,all)=>all.indexOf(id)!==i),card:document.querySelector('[data-offer]').getBoundingClientRect().toJSON()};});
   assert.equal(m.overflow,false,JSON.stringify({mode,width,height,m}));assert.deepEqual(m.duplicateIDs,[]);assert.equal(m.slots.length,12);assert.ok(m.slots.every(r=>Math.abs(r.y-m.slots[0].y)<1),'one bench row');
   assert.ok(m.bench.y>=m.board.bottom&&m.bench.y-m.board.bottom<60,JSON.stringify({mode,width,height,board:m.board,bench:m.bench,caption:m.caption}));assert.equal(await p.locator('#bench').isVisible(),true);assert.equal(await p.locator('#shop-panel').isVisible(),true);assert.ok(Math.abs(m.card.width-m.card.height)<1,'square shop button');
   if(height>540){if(m.bench.bottom>m.dock.y)await p.screenshot({path:`${shots}/failure-${mode}-${width}-${height}.png`,fullPage:true});assert.ok(m.bench.bottom<=m.dock.y,JSON.stringify({mode,width,height,m}));}
   assert.equal(await p.locator('#pc-progression').evaluate(e=>e.closest('#pc-play-dock')!==null),true);assert.equal(await p.locator('#compact-player-status').count(),0);assert.equal(await p.locator('#dock-gold').evaluate(e=>e.parentElement.id),'shop-economy');assert.equal(await p.locator('#deployed').evaluate(e=>e.closest('#deployment-overlay')!==null),true);
   assert.ok(Math.abs(m.gold.x-m.level.x)<1&&Math.abs(m.gold.right-m.roll.right)<1&&m.level.right<=m.roll.x,'shared gold header spans XP and reroll');
   assert.ok(m.gold.right<=m.shop.x&&m.xp.right<=m.shop.x,'growth controls before shop');
   assert.ok(Math.abs(m.gold.bottom-m.roll.y)<1&&Math.abs(m.gold.bottom-m.xp.y)<1,'gold above both buttons');
   assert.ok(Math.abs(m.xp.x-m.level.x)<1&&Math.abs(m.xp.width-m.level.width+1)<1&&Math.abs(m.xp.height-m.level.height)<1,JSON.stringify({message:'whole growth panel is the XP button',mode,width,height,button:m.xp,panel:m.level}));
   assert.equal(m.orientation,'vertical');assert.ok(m.track.height>m.track.width*2,'vertical XP gauge');
   assert.ok(Math.abs(m.track.x-(m.dock.x+1))<1&&Math.abs(m.track.y-m.gold.bottom)<1,'XP gauge touches the shop left edge below the header');
   assert.ok(Math.abs(m.track.height-m.xp.height)<1,'XP gauge spans the whole button');
   assert.equal(await p.locator('#dock-experience').count(),0);
   assert.equal(await p.locator('#buy-experience').evaluate(e=>e.tagName==='BUTTON'&&['level-label','experience-track','experience-label','experience-purchase'].every(id=>e.contains(document.getElementById(id)))&&!e.querySelector('button')),true,'single native button contains all growth information');
   const roll=await p.locator('#reroll').boundingBox();assert.ok(m.gold.right<=m.shop.x&&roll.x+roll.width<=m.shop.x,'gold/reroll left of offers');assert.ok(m.ready.x>=m.shop.right,'ready right of offers');
   assert.ok(['x','y','width','height'].every(key=>Math.abs(m.roll[key]-m.control[key])<1),'reroll fills its cell');
   assert.ok(Math.abs(m.streak.y-m.gold.y)<1&&Math.abs(m.streak.height-m.gold.height)<1,'streak and gold headers align');
   assert.ok(Math.abs(m.streak.width-m.readyCell.width)<1&&Math.abs(m.streak.x-m.readyCell.x)<1,'streak spans ready column');
   assert.ok(Math.abs(m.ready.x-m.readyCell.x)<1&&Math.abs(m.ready.width-m.readyCell.width)<1&&Math.abs(m.ready.y-m.streak.bottom)<1&&Math.abs(m.ready.bottom-(m.dock.bottom-1))<1,'ready fills its cell below the streak header');
   assert.equal(await p.locator('#dock-streak').evaluate(e=>e.closest('button')===null&&e.getAttribute('role')==='status'&&e.scrollWidth<=e.clientWidth+1),true,'streak header is readable display-only status');
   const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;assert.equal(overlap(m.bench,m.dock),false,JSON.stringify({mode,width,height,m}));
   assert.ok(m.bench.bottom<=height,'bench fits viewport');assert.ok(m.gold.width>=54,'gold stays readable');
   const overlay=await p.locator('#deployment-overlay').evaluate(e=>{const r=e.getBoundingClientRect(),board=e.parentElement.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width*.25,r.y+r.height*.25);return{centerX:r.x+r.width/2,centerY:r.y+r.height/2,expectedX:board.x+board.width/2,expectedY:board.y+board.height/2,pointerEvents:getComputedStyle(e).pointerEvents,opacity:Number(getComputedStyle(e).opacity),text:e.textContent,hitCell:!!hit?.closest('#cells button')};});
   assert.ok(Math.abs(overlay.centerX-overlay.expectedX)<1&&Math.abs(overlay.centerY-overlay.expectedY)<1,'entire battlefield center');assert.equal(overlay.pointerEvents,'none');assert.ok(overlay.opacity>0&&overlay.opacity<.5);assert.equal(overlay.text,'1/1');assert.equal(overlay.hitCell,true,JSON.stringify({mode,width,height,overlay}));
   const covered=await p.evaluate(()=>['buy-experience','ready','reroll'].map(id=>document.getElementById(id)).concat(document.querySelector('[data-offer]'),document.querySelector('[data-bench-slot][data-unit]')).filter(Boolean).filter(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !hit||!e.contains(hit);}).map(e=>e.id||e.dataset.benchSlot||e.dataset.offer));assert.deepEqual(covered,[],'controls remain reachable');
   const edges=await p.evaluate(()=>['buy-experience','reroll','ready'].flatMap(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return[[r.x+r.width/2,r.y+4],[r.x+r.width/2,r.bottom-4],[r.x+4,r.y+r.height/2],[r.right-4,r.y+r.height/2]].filter(([x,y])=>!e.contains(document.elementFromPoint(x,y))).map(([x,y])=>({id,x,y}));}));assert.deepEqual(edges,[],'top, bottom, left and right of all action cells remain reachable');
   const goldFits=await p.locator('#dock-gold').evaluate(e=>{const v=e.querySelector('#gold'),before=v.textContent;v.textContent='9999';const a=e.getBoundingClientRect(),b=v.getBoundingClientRect(),fits=e.scrollWidth<=e.clientWidth+1&&b.right<=a.right&&[...e.children].every(n=>n.scrollWidth<=n.clientWidth+1);v.textContent=before;return fits;});assert.equal(goldFits,true,'four-digit gold remains readable');
   if(height<=540){const info=await p.locator('.matchbar').boundingBox();assert.ok(info.y+info.height<=height,'side information fits viewport');await p.locator('#mobile-info-open').click();assert.equal(await p.locator('#pc-info-dialog').evaluate(e=>e.open),true);await p.locator('#pc-info-close').click();await p.evaluate(()=>{scrollTo(0,0);document.querySelector('.matchbar').scrollTop=0;});await p.screenshot({path:`${shots}/${mode}-${width}-${height}.png`,fullPage:false,animations:'disabled'});}
   results.push({mode,width,height,...m,overlay});
  }
  await p.setViewportSize(base);await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(180);
  // Move a unit onto a center cell beneath the number using the normal click/tap flow.
  const original=p.locator('#cells button[aria-label*="아군 칸, 루멘,"]').first(),centerCell=p.locator('#cells button[data-x="3"][data-y="5"]');
  if(mode==='mobile'){await original.tap();await centerCell.tap();}else{await original.click();await centerCell.click();}
  await p.waitForFunction(()=>document.querySelector('#cells button[data-x="3"][data-y="5"]').getAttribute('aria-label').includes('루멘'));assert.equal(await p.locator('#deployed').textContent(),'1/1');
  // Purchase and deploy without changing views; mouse/touch drag in both directions.
  const gold=()=>p.locator('#gold').textContent().then(Number);
  const headerGold=await gold();for(const selector of ['#dock-gold','#dock-streak'])await p.locator(selector)[mode==='mobile'?'tap':'click']();assert.equal(await gold(),headerGold);assert.equal(await p.locator('#ready').textContent(),'준비 완료');
  const offer=p.locator('[data-offer]:not(:disabled)').first(),cost=Number((await offer.getAttribute('aria-label')).match(/(\d+) 골드/)[1]),before=await gold();await offer.click();await p.waitForFunction(v=>Number(document.querySelector('#gold').textContent)===v,before-cost);
  const unit=p.locator('[data-bench-slot][data-unit]').last();assert.ok(await unit.isVisible());assert.equal(await p.locator('#shop-panel').isVisible(),true);
  const cdp=mode==='mobile'?await ctx.newCDPSession(p):null;
  async function drag(source,target){const a=await p.locator(source).boundingBox(),b=await p.locator(target).boundingBox();if(!a||!b)await p.screenshot({path:`${shots}/failure-${mode}-drag.png`,fullPage:true});assert.ok(a&&b,JSON.stringify({mode,source,target,a,b}));const start={x:a.x+a.width/2,y:a.y+a.height/2},end={x:b.x+b.width/2,y:b.y+b.height/2};
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});await p.waitForTimeout(80);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   else{await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(end.x,end.y,{steps:10});await p.mouse.up();}
  }
  // Capacity is one: swapping the original knight into the bench makes the purchase deployable.
  const sourceSlot=await unit.getAttribute('data-bench-slot'),boughtId=await unit.getAttribute('data-unit'),target=await p.locator('#cells button[aria-label*="아군 칸, 루멘,"]').first().evaluate(e=>`#cells button[data-x="${e.dataset.x}"][data-y="${e.dataset.y}"]`);
  await drag(`[data-bench-slot="${sourceSlot}"]`,target);
  await p.waitForFunction(id=>!document.querySelector(`[data-bench-slot][data-unit="${id}"]`),boughtId);
  await drag(target,'[data-bench-slot="3"]');await p.waitForFunction(id=>document.querySelector('[data-bench-slot="3"]').dataset.unit===id,boughtId);
  await p.waitForFunction(()=>document.querySelector('#deployed').textContent==='0/1');
  async function buyAt(selector,options){const before=await gold();await p.locator(selector)[mode==='mobile'?'tap':'click'](options);await p.waitForFunction(v=>Number(document.querySelector('#gold').textContent)===v,before-4);}
  await buyAt('#level-label');
  await p.waitForFunction(()=>document.querySelector('#deployed').textContent==='0/3');assert.equal(await p.locator('#deployed').getAttribute('aria-label'),'현재 출전 0명, 최대 출전 3명');
  assert.equal(await p.locator('#pc-dock-toggle').count(),0);assert.equal(await p.locator('#gold').isVisible(),true);
  await debugPreset(p,'mid');await buyAt('#experience-track');await p.waitForFunction(()=>document.querySelector('#experience-track').getAttribute('aria-valuenow')==='4');
  const gauge=await p.locator('#experience-track').evaluate(e=>{const f=e.firstElementChild,r=e.getBoundingClientRect(),v=f.getBoundingClientRect();return{value:+e.getAttribute('aria-valuenow'),max:+e.getAttribute('aria-valuemax'),ratio:v.height/e.clientHeight,bottomError:Math.abs(v.bottom-r.bottom),fullWidth:Math.abs(v.width-e.clientWidth)<1};});
  assert.ok(Math.abs(gauge.ratio-gauge.value/gauge.max)<.02);assert.ok(gauge.bottomError<1);assert.equal(gauge.fullWidth,true);
  for(const selector of ['#experience-label','#experience-purchase'])await buyAt(selector);
  const button=await p.locator('#buy-experience').boundingBox();await buyAt('#buy-experience',{position:{x:button.width-4,y:5}});
  for(const key of ['Space','Enter']){const before=await gold();await p.locator('#buy-experience').focus();await p.keyboard.press(key);await p.waitForFunction(v=>Number(document.querySelector('#gold').textContent)===v,before-4);}
  async function rerollAt(selector,options){const before=await gold();await p.locator(selector)[mode==='mobile'?'tap':'click'](options);await p.waitForFunction(v=>Number(document.querySelector('#gold').textContent)===v,before-5);}
  await rerollAt('#reroll');
  const rerollBox=await p.locator('#reroll').boundingBox();
  for(const y of [5,rerollBox.height-5])await rerollAt('#reroll',{position:{x:rerollBox.width/2,y}});
  for(const selector of ['#reroll .reroll-icon','#reroll .reroll-price'])await rerollAt(selector);
  assert.equal(await p.locator('#reroll').isDisabled(),true);assert.equal(await gold(),1);
  for(const edge of ['top','bottom']){
   if(edge==='bottom')await debugPreset(p,'mid');
   const ready=await p.locator('#ready').boundingBox();await p.locator('#ready')[mode==='mobile'?'tap':'click']({position:{x:ready.width/2,y:edge==='top'?5:ready.height-5}});
   await p.waitForFunction(()=>document.querySelector('#ready').textContent.includes('✓'));assert.equal(await p.locator('#shop-panel').isVisible(),true);
  }
  for(const key of ['Space','Enter']){await debugPreset(p,'mid');await p.locator('#ready').focus();await p.keyboard.press(key);await p.waitForFunction(()=>document.querySelector('#ready').textContent.includes('✓'));}
  // Switching modes keeps the existing nodes and selection, including gold visibility.
  await p.locator(mode==='pc'?'#screen-mode-mobile':'#screen-mode-pc').click();assert.equal(await p.locator('#bench').isVisible(),true);assert.equal(await p.locator('#shop-panel').isVisible(),true);await p.locator(`#screen-mode-${mode}`).click();
  await debugPreset(p,'mid');for(let i=0;i<3;i++){const before=await gold();await p.locator('#buy-experience').click();await p.waitForFunction(v=>Number(document.querySelector('#gold').textContent)===v,before-4);}
  await p.waitForTimeout(180);await p.evaluate(()=>scrollTo(0,0));await p.mouse.move(0,0);await p.screenshot({path:`${shots}/autochess-${mode}-v${version}.png`,fullPage:false,animations:'disabled'});
  await p.locator('#pc-play-dock').screenshot({path:`${shots}/${mode}-dock.png`,animations:'disabled'});
  await debugPreset(p,'mid');while(await gold()>=4)await buyAt('#level-label');
  assert.equal(await p.locator('#buy-experience').isDisabled(),true);assert.equal(await gold(),2);assert.equal(await p.locator('#experience-track').getAttribute('aria-valuenow'),'48');
  assert.equal(await p.locator('#level-label').isVisible(),true);assert.equal(await p.locator('#experience-label').isVisible(),true);assert.equal(await p.locator('#buy-experience').evaluate(e=>getComputedStyle(e).opacity),'1');
  // Round 25 also offers a reward, which may close the debug dialog before its close click.
  await openDebug(p);await p.locator('#debug-preset').selectOption('level10');await p.locator('#debug-apply').click();
  await p.waitForFunction(()=>document.querySelector('#experience-track').getAttribute('aria-valuetext')==='최대 레벨 10');
  if(await p.locator('#reward-dialog').evaluate(e=>e.open))await p.locator('#reward-later').click();
  if(await p.locator('#pc-info-dialog').evaluate(e=>e.open))await p.locator('#pc-info-close').click();
  assert.equal(await p.locator('#buy-experience').isDisabled(),true);assert.equal(await p.locator('#experience-track').getAttribute('aria-valuetext'),'최대 레벨 10');
  const maximum=await p.locator('#experience-track').evaluate(e=>({ratio:e.firstElementChild.getBoundingClientRect().height/e.clientHeight,labelFits:document.querySelector('#level-label').scrollWidth<=document.querySelector('#level-label').clientWidth+1}));assert.ok(Math.abs(maximum.ratio-1)<.02);assert.equal(maximum.labelFits,true);
  for(const viewport of [{width:320,height:740},{width:480,height:320}]){
   await p.setViewportSize(viewport);await p.waitForTimeout(160);
   const fit=await p.locator('#level-label').evaluate(e=>{const a=e.getBoundingClientRect(),b=document.querySelector('#pc-growth').getBoundingClientRect();return a.x>=b.x&&a.right<=b.right&&e.scrollWidth<=e.clientWidth+1;});assert.equal(fit,true,'level 10 stays readable on narrow screens');
  }await p.setViewportSize(base);
  await p.reload();await p.locator('#game-view').waitFor({state:'visible'});assert.equal(await p.locator('#bench').isVisible(),true);assert.equal(await p.locator('#shop-panel').isVisible(),true);
  // Actual server results: two wins, then two losses, followed by a fresh-state reset.
  if(await p.locator('#reward-dialog').evaluate(e=>e.open))await p.locator('#reward-later').click();
  await debugPreset(p,'early');assert.equal(await p.locator('#dock-streak-label').textContent(),'기록 없음');
  await buyAt('#level-label');
  await p.locator('#cells button[data-x="2"][data-y="5"]').waitFor({state:'visible'});
  for(const [slot,x] of [[0,2],[1,4]]){
   const target=`#cells button[data-x="${x}"][data-y="5"]`;
   await drag(`[data-bench-slot="${slot}"]`,target);
   await p.waitForFunction(target=>!document.querySelector(target).getAttribute('aria-label').includes('빈 칸'),target);
  }
  await p.waitForFunction(()=>document.querySelector('#deployed').textContent==='3/3');
  async function next(phase){await debugClick(p,'debug-next');await p.waitForFunction(text=>document.querySelector('#phase').textContent.startsWith(text),phase);}
  async function expectStreak(type,count){
   const label=`${count}${type==='win'?'연승':'연패'}`;
   await p.waitForFunction(label=>document.querySelector('#dock-streak-label').textContent===label,label);
   const status=await p.locator('#dock-streak').evaluate(e=>({type:e.dataset.streak,label:e.textContent,aria:e.getAttribute('aria-label'),color:getComputedStyle(e).backgroundColor,fire:!!e.querySelector('.streak-fire-core'),water:!!e.querySelector('.streak-water-shine')}));
   assert.equal(status.type,type);assert.equal(status.aria,label);assert.equal(status.fire,type==='win');assert.equal(status.water,type==='loss');
   const rgb=status.color.match(/\d+/g).map(Number);assert.ok(type==='win'?rgb[0]>rgb[2]:rgb[2]>rgb[0]);streakResults.push({mode,...status});
  }
  async function checkLongStreak(type){
   for(const viewport of [{width:320,height:740},{width:480,height:320}]){
    await p.setViewportSize(viewport);await p.waitForTimeout(160);
    const fits=await p.locator('#dock-streak').evaluate((e,type)=>{const label=e.querySelector('#dock-streak-label'),old=label.textContent;label.textContent=`40${type==='win'?'연승':'연패'}`;const a=e.getBoundingClientRect(),b=label.getBoundingClientRect(),ok=e.scrollWidth<=e.clientWidth+1&&b.right<=a.right;label.textContent=old;return ok;},type);
    assert.equal(fits,true,'two-digit streak and icon fit narrow screens');
   }await p.setViewportSize(base);await p.waitForTimeout(160);
  }
  for(const count of [1,2]){await next('전투');await next('라운드 결과');await expectStreak('win',count);if(count===1){await next('준비');await expectStreak('win',1);}}
  await checkLongStreak('win');await p.mouse.move(0,0);await p.locator('#pc-play-dock').screenshot({path:`${shots}/${mode}-dock-win.png`,animations:'disabled'});
  await next('준비');
  const deployedUnits='#cells button[aria-label*="아군 칸,"]:not([aria-label*="빈 칸"])';
  while(await p.locator(deployedUnits).count()){
   const source=await p.locator(deployedUnits).first().evaluate(e=>`#cells button[data-x="${e.dataset.x}"][data-y="${e.dataset.y}"]`);
   const slot=await p.locator('[data-bench-slot]:not([data-unit])').first().getAttribute('data-bench-slot');
   await drag(source,`[data-bench-slot="${slot}"]`);await p.waitForFunction(source=>document.querySelector(source).getAttribute('aria-label').includes('빈 칸'),source);
  }
  for(const count of [1,2]){await next('라운드 결과');await expectStreak('loss',count);if(count===1)await next('준비');}
  await checkLongStreak('loss');await p.mouse.move(0,0);await p.locator('#pc-play-dock').screenshot({path:`${shots}/${mode}-dock-loss.png`,animations:'disabled'});
  await p.locator(mode==='pc'?'#screen-mode-mobile':'#screen-mode-pc').click();await expectStreak('loss',2);await p.locator(`#screen-mode-${mode}`).click();
  await p.reload();await p.locator('#game-view').waitFor({state:'visible'});await expectStreak('loss',2);
  await debugPreset(p,'early');assert.equal(await p.locator('#dock-streak-label').textContent(),'기록 없음');assert.equal(await p.locator('#dock-streak').getAttribute('data-streak'),'none');assert.equal(await p.locator('#dock-streak svg').count(),0);
  console.log('PASS',mode,'layout matrix, gold/streak headers, full-cell actions, actual win/loss streaks, reset, narrow counts, keyboard, purchases, mode switch and reconnect');await ctx.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,streakResults,errors},null,2));
 }finally{await browser?.close();proc.kill('SIGTERM');}})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
