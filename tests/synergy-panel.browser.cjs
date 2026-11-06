const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots=process.env.SYNERGY_SCREENSHOTS||'docs/screenshots/main-synergy';
const url='http://127.0.0.1:2646',server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2646',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const errors=[],results=[];
 for(const mode of ['pc','mobile']){
  const base=mode==='pc'?{width:1400,height:1000}:{width:390,height:844};
  const context=await browser.newContext({viewport:base,isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url);await p.locator('#practice').click();await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));
  assert.equal(await p.locator('#my-synergies [data-active="true"]').count(),0);
  await debugClick(p,'debug-pause');await debugPreset(p,'early');
  assert.equal(await p.locator('[data-pc-info="synergy"],#pc-info-synergy,#pc-synergy-summary').count(),0);
  const frames=mode==='pc'?[[1400,1000],[1920,1080],[1366,768],[1024,768],[390,844],[320,740],[844,390],[480,320]]:[[390,844],[320,740],[360,640],[414,896],[768,1024],[844,390],[480,320]];
  for(const [width,height] of frames){
   await p.setViewportSize({width,height});await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(200);await p.evaluate(()=>document.fonts.ready);
   const m=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON(),panel=document.getElementById('synergy-panel');return{
    panel:r('synergy-panel'),parent:panel.parentElement.id||panel.parentElement.className,gear:r('equipment-sidebar'),board:r('board-wrap'),bench:r('bench'),dock:r('pc-play-dock'),gold:r('dock-gold'),xp:r('buy-experience'),roll:r('reroll'),ready:r('ready'),streak:r('dock-streak'),
    help:document.querySelector('#synergy-panel [data-help="synergy"]').getBoundingClientRect().toJSON(),cards:[...document.querySelectorAll('#my-synergies .synergy-card')].map(e=>({rect:e.getBoundingClientRect().toJSON(),fits:e.scrollWidth<=e.clientWidth+1})),
    overflow:document.documentElement.scrollWidth>innerWidth,duplicateIDs:[...document.querySelectorAll('[id]')].map(e=>e.id).filter((id,i,all)=>all.indexOf(id)!==i),inDialog:!!panel.closest('dialog')};});
   assert.equal(m.overflow,false,JSON.stringify({mode,width,height,m}));assert.deepEqual(m.duplicateIDs,[]);assert.equal(m.inDialog,false);assert.equal(m.cards.length,1);
   assert.equal(await p.locator('#synergy-panel').isVisible(),true);assert.ok(m.panel.x>=0&&m.panel.right<=width&&m.panel.bottom<=height,'composition visible without opening popup');
   assert.ok(m.cards.every(({rect,fits})=>fits&&rect.x>=m.panel.x&&rect.right<=m.panel.right&&rect.bottom<=m.panel.bottom),JSON.stringify({message:'all trait rows fit',mode,width,height,panel:m.panel,cards:m.cards}));
   assert.ok(m.cards.every(({rect})=>!(m.help.x<rect.right&&m.help.right>rect.x&&m.help.y<rect.bottom&&m.help.bottom>rect.y)),'inline explanation does not cover trait counts');
   const wide=mode==='pc'&&width>700&&!(height<=540&&width>height);
   if(wide){assert.equal(m.parent,'pc-left-rail');assert.ok(m.panel.bottom<=m.gear.y,'composition above equipment');assert.ok(m.panel.right<=m.board.x,'composition to the left of battlefield');}
   else{assert.equal(m.parent,'arena-panel');if(width>height&&(mode==='mobile'||height<=540))assert.ok(m.panel.x>=m.board.right,'landscape composition beside battlefield');else assert.ok(m.panel.bottom<=m.board.y,'compact composition above battlefield');assert.ok(m.gear.y>=m.panel.bottom,'equipment control below composition');}
   if(m.bench.bottom>height)await p.screenshot({path:`${shots}/failure-${mode}-${width}-${height}.png`,fullPage:true});assert.ok(m.bench.bottom<=height,JSON.stringify({message:'bench fits viewport',mode,width,height,m}));
   const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;if(overlap(m.bench,m.dock))await p.screenshot({path:`${shots}/failure-${mode}-${width}-${height}.png`,fullPage:true});assert.equal(overlap(m.bench,m.dock),false,JSON.stringify({message:'bench and unchanged shop stay separate',mode,width,height,m}));
   for(const id of ['xp','roll','ready'])assert.ok(m[id].width>=44&&m[id].height>=44,'shop controls retain usable touch targets');
   assert.equal(await p.locator('#synergy-details,#synergy-reference,#enemy-synergies').count(),0);
   if(height<=540)await p.screenshot({path:`${shots}/${mode}-${width}-${height}.png`,animations:'disabled'});
   results.push({mode,width,height,...m});
  }
  await p.setViewportSize(base);await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(180);
  // Information/history dialogs no longer contain composition or its navigation tab.
  for(const selector of ['#mobile-info-open']){
   await p.locator(selector).click();assert.equal(await p.locator('#pc-info-dialog').evaluate(e=>e.open),true);
   assert.equal(await p.locator('#pc-info-dialog #synergy-panel,#pc-info-tabs [data-pc-info="synergy"]').count(),0);await p.locator('#pc-info-close').click();await p.locator('#pc-info-dialog').waitFor({state:'hidden'});
  }
  await p.locator('#history-toggle').click();assert.equal(await p.locator('#history-panel').isVisible(),true);assert.equal(await p.locator('#pc-info-dialog').evaluate(e=>e.open),false);await p.keyboard.press('Escape');
  assert.equal(await p.locator('#synergy-details,#synergy-reference,#enemy-synergies').count(),0);
  const cdp=mode==='mobile'?await context.newCDPSession(p):null;
  async function drag(source,target){
   const a=await p.locator(source).boundingBox(),b=await p.locator(target).boundingBox();assert.ok(a&&b,JSON.stringify({source,target,a,b}));
   const start={x:a.x+a.width/2,y:a.y+a.height/2},end={x:b.x+b.width/2,y:b.y+b.height/2};
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});await p.waitForTimeout(80);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   else{await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(end.x,end.y,{steps:10});await p.mouse.up();}
  }
  const knight=p.locator('#cells button[aria-label*="아군 칸, 루멘,"]').first(),gearTarget='#cells button[data-x="7"][data-y="6"]';
  await drag(await knight.evaluate(e=>`#cells button[data-x="${e.dataset.x}"][data-y="${e.dataset.y}"]`),gearTarget);
  await p.waitForFunction(sel=>document.querySelector(sel).getAttribute('aria-label').includes('루멘'),gearTarget);
  if(await p.locator('#equipment-toggle').getAttribute('aria-expanded')!=='true')await p.locator('#equipment-toggle').click();
  assert.equal(await p.locator('[data-equipment-item]').count(),3);const item=await p.locator('[data-equipment-item]').first().getAttribute('data-equipment-item');await drag(`[data-equipment-item="${item}"]`,gearTarget);
  await p.waitForFunction(()=>document.querySelectorAll('[data-equipment-item]').length===2);
  if(await p.locator('#equipment-close').isVisible())await p.locator('#equipment-close').click();
  await debugPreset(p,'synergy');await p.waitForFunction(()=>document.querySelectorAll('#my-synergies [data-active="true"]').length===3);
  assert.equal(await p.locator('#my-synergies .synergy-count').allTextContents().then(v=>v.join(',')),'2/2,2/2,2/2');
  await p.mouse.move(0,0);await p.screenshot({path:`${shots}/${mode}-active.png`,animations:'disabled'});
  if(mode==='pc')await p.locator('#pc-left-rail').screenshot({path:`${shots}/pc-composition-equipment.png`,animations:'disabled'});
  else await p.locator('#synergy-panel').screenshot({path:`${shots}/mobile-composition.png`,animations:'disabled'});
  const warden=p.locator('#cells button[aria-label*="아군 칸, 아르덴,"]').first(),origin=await warden.evaluate(e=>`#cells button[data-x="${e.dataset.x}"][data-y="${e.dataset.y}"]`);
  await drag(origin,'[data-bench-slot="0"]');
  await p.waitForFunction(()=>document.querySelector('#my-synergies [data-trait="bulwark"]').dataset.active==='false');
  assert.equal(await p.locator('#my-synergies [data-trait="bulwark"] .synergy-count').textContent(),'1/2');assert.equal(await p.locator('dialog[open]').count(),0);
  await drag('[data-bench-slot="0"]',origin);await p.waitForFunction(()=>document.querySelector('#my-synergies [data-trait="bulwark"]').dataset.active==='true');
  await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));assert.equal(await p.locator('#synergy-heading').textContent(),'전투 조합');
  await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('라운드 결과'));assert.equal(await p.locator('#my-synergies [data-active="true"]').count(),3,'combat starting composition persists through casualties');
  await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));assert.equal(await p.locator('#synergy-heading').textContent(),'출전 조합');
  await p.locator(mode==='pc'?'#screen-mode-mobile':'#screen-mode-pc').click();assert.equal(await p.locator('#synergy-panel').isVisible(),true);await p.locator(`#screen-mode-${mode}`).click();
  await p.reload();await p.locator('#game-view').waitFor({state:'visible'});await p.locator('#synergy-panel').waitFor({state:'visible'});assert.equal(await p.locator('#my-synergies [data-active="true"]').count(),3);assert.equal(await p.locator('#pc-info-dialog #synergy-panel').count(),0);
  console.log('PASS',mode,'main composition, activation/bench feedback, combat roster, gear attachment, inline help, information/history dialogs, layout and unchanged shop, mode switch/reload');await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,errors},null,2));
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
