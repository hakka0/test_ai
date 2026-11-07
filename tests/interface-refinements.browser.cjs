const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots='docs/screenshots/interface-refinements';
const url='http://127.0.0.1:2652',server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2652',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const errors=[],results=[];
 for(const mode of ['pc','mobile']){
  const base=mode==='pc'?{width:1400,height:1000}:{width:390,height:844};
  const ctx=await browser.newContext({viewport:base,isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  async function press(selector){const e=typeof selector==='string'?p.locator(selector):selector;if(mode==='mobile')await e.tap();else await e.click();}
  async function dismissHistory(){if(await p.locator('#combat-record-dialog').evaluate(e=>e.open))await press('#combat-sheet-close');else await press('#inspection-unit-tab');}
  async function next(phase){await debugClick(p,'debug-next');await p.waitForFunction(text=>document.querySelector('#phase').textContent.startsWith(text),phase);}
  async function traits(expected){await p.waitForFunction(values=>JSON.stringify([...document.querySelectorAll('#my-synergies [data-trait]')].map(e=>e.dataset.trait))===JSON.stringify(values),expected);assert.doesNotMatch(await p.locator('#my-synergies').textContent(),/대기/);}
  async function drag(source,target){
   const a=await p.locator(source).boundingBox(),b=await p.locator(target).boundingBox();assert.ok(a&&b);
   const start={x:a.x+a.width/2,y:a.y+a.height/2},end={x:b.x+b.width/2,y:b.y+b.height/2};
   if(mode==='mobile'){const cdp=await ctx.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});await p.waitForTimeout(70);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
   else{await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(end.x,end.y,{steps:8});await p.mouse.up();}
  }
  await p.goto(url);assert.equal(await p.locator('#room-code-control').isVisible(),false);await press('#practice');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));
  await traits([]);assert.match(await p.locator('#my-synergies').textContent(),/출전 유닛 없음/);
  const code=await p.locator('#room-code').textContent();assert.ok(code.length>=8);assert.equal(await p.locator('#pc-info-connection #room-code').count(),0);
  assert.equal(await p.locator('#room-code').getAttribute('aria-hidden'),'true');assert.match(await p.locator('#room-code').evaluate(e=>getComputedStyle(e).filter),/blur/);
  await press('#room-code-toggle');assert.equal(await p.locator('#room-code-toggle').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('#room-code').evaluate(e=>getComputedStyle(e).filter),'none');
  await debugClick(p,'debug-pause');assert.equal(await p.locator('#room-code-toggle').getAttribute('aria-pressed'),'true','snapshots retain user disclosure choice');await press('#room-code-toggle');
  await debugPreset(p,'early');await traits(['bulwark']);assert.match(await p.locator('#my-synergies').textContent(),/1\/2/);assert.doesNotMatch(await p.locator('#my-synergies').textContent(),/종 필요/);assert.equal(await p.locator('#my-synergies [data-active="false"] .synergy-state').count(),0);
  const own=p.locator('#cells button[aria-label*="아군 칸, 루멘,"]').first(),origin=await own.evaluate(e=>`#cells button[data-x="${e.dataset.x}"][data-y="${e.dataset.y}"]`);
  await drag(origin,'[data-bench-slot="2"]');await traits([]);
  await drag('[data-bench-slot="0"]',origin);await traits(['scout']);await drag(origin,'[data-bench-slot="0"]');await traits([]);
  await drag('[data-bench-slot="1"]',origin);await traits(['arcane']);
  await debugPreset(p,'synergy');await traits(['bulwark','scout','arcane']);assert.equal(await p.locator('#my-synergies [data-active="true"]').count(),3);
  await p.screenshot({path:`${shots}/${mode}-active.png`,animations:'disabled'});
  const frames=mode==='pc'?[[1400,1000],[1920,1080],[1366,768],[1024,768],[390,844],[320,740],[844,390],[480,320]]:[[390,844],[320,740],[360,640],[414,896],[768,1024],[844,390],[480,320]];
  for(const [width,height] of frames){
   await p.setViewportSize({width,height});await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(180);
   const m=await p.evaluate(()=>{const rect=id=>document.getElementById(id).getBoundingClientRect().toJSON();return{code:rect('room-code-control'),eye:rect('room-code-toggle'),motion:rect('motion'),traits:rect('synergy-panel'),board:rect('board-wrap'),bench:rect('bench'),dock:rect('pc-play-dock'),overflow:document.documentElement.scrollWidth>innerWidth,ids:[...document.querySelectorAll('[id]')].map(e=>e.id).filter((id,i,a)=>a.indexOf(id)!==i)};});
   assert.equal(m.overflow,false,JSON.stringify({mode,width,height,m}));assert.deepEqual(m.ids,[]);assert.ok(m.code.x>=0&&m.code.right<=m.motion.x&&Math.abs(m.code.y-m.motion.y)<=2,'room code left of motion button');assert.ok(m.eye.height>=32&&m.eye.width>=32);assert.ok(m.bench.bottom<=height+1,JSON.stringify({mode,width,height,m}));
   assert.equal(m.bench.x<m.dock.right&&m.bench.right>m.dock.x&&m.bench.y<m.dock.bottom&&m.bench.bottom>m.dock.y,false,JSON.stringify({message:'bench and shop do not overlap',mode,width,height,m}));
   for(const card of await p.locator('#my-synergies .synergy-card').all())assert.equal(await card.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'trait content fits');
   await press('#room-code-toggle');assert.equal(await p.locator('#room-code').evaluate(e=>getComputedStyle(e).filter),'none');await press('#room-code-toggle');
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}.png`,animations:'disabled'});results.push({mode,width,height,...m});
  }
  await p.setViewportSize(base);await p.waitForTimeout(150);
  const natsu=await p.locator('#cells button[aria-label*="아군 칸, 아르덴,"]').evaluate(e=>`#cells button[data-x="${e.dataset.x}"][data-y="${e.dataset.y}"]`);
  await drag(natsu,'[data-bench-slot="0"]');await p.waitForFunction(()=>document.querySelector('#my-synergies [data-trait="bulwark"] .synergy-count')?.textContent==='1/2');
  const yuuka=await p.locator('#cells button[aria-label*="아군 칸, 루멘,"]').evaluate(e=>`#cells button[data-x="${e.dataset.x}"][data-y="${e.dataset.y}"]`);
  await drag(yuuka,'[data-bench-slot="1"]');await traits(['scout','arcane']);await next('전투');await next('라운드 결과');await traits(['scout','arcane']);
  await debugPreset(p,'early');
  for(let round=1;round<=5;round++){
   if(round===5){await p.locator('#reward-dialog').waitFor({state:'visible'});await press(p.locator('#reward-options button').first());await p.locator('#reward-dialog').waitFor({state:'hidden'});}
   await next('전투');await next('라운드 결과');await next('준비');
  }
  assert.match(await p.locator('#round').textContent(),/스테이지 3-1 · 라운드 6/);
  await press('#history-toggle');assert.equal(await p.locator('#history-current').count(),0);assert.equal(await p.locator('#history-rounds button').count(),5);
  assert.equal(await p.locator('.history-navigation button').count(),2);assert.equal(await p.locator('.history-navigation').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),2);
  assert.deepEqual(await p.locator('#history-rounds button').evaluateAll(es=>es.map(e=>Number(e.dataset.historyRound))),[1,2,3,4,5]);assert.equal(await p.locator('#history-prev').isDisabled(),true);
  await press('#history-next');assert.deepEqual(await p.locator('#history-rounds button').evaluateAll(es=>es.map(e=>Number(e.dataset.historyRound))),[6,7,8,9,10]);assert.equal(await p.locator('#history-next').isDisabled(),true);assert.equal(await p.locator('#history-rounds button:enabled').count(),0);
  await press('#history-prev');await press('#history-rounds [data-history-round="5"]');assert.match(await p.locator('#history-detail-title').textContent(),/2-5/);
  await p.screenshot({path:`${shots}/${mode}-history-five.png`,animations:'disabled'});await dismissHistory();await next('전투');await next('라운드 결과');await press('#history-toggle');await press('#history-next');await press('#history-rounds [data-history-round="6"]');assert.match(await p.locator('#history-detail-title').textContent(),/3-1/);await dismissHistory();
  await press('#room-code-toggle');await p.reload();await p.locator('#game-view').waitFor({state:'visible'});assert.equal(await p.locator('#room-code-toggle').getAttribute('aria-pressed'),'false');assert.equal(await p.locator('#room-code').textContent(),code);
  await press('#room-code-toggle');await press('#leave');await p.locator('#lobby').waitFor({state:'visible'});assert.equal(await p.locator('#room-code-control').isVisible(),false);await press('#practice');await p.locator('#game-view').waitFor({state:'visible'});assert.notEqual(await p.locator('#room-code').textContent(),code);assert.equal(await p.locator('#room-code-toggle').getAttribute('aria-pressed'),'false');
  console.log('PASS',mode,'five-round records/navigation, concealed header room code/reset, deployed-only traits/withdrawal/combat roster, 15 responsive layouts');await ctx.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,errors},null,2));
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
