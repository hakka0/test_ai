const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots='docs/screenshots/battle-review';
const baseline=require('../docs/screenshots/shop-streak-header/results.json').results;
const url='http://127.0.0.1:2648',server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2648',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const errors=[],results=[];
 for(const mode of ['pc','mobile']){
  const base=mode==='pc'?{width:1400,height:1000}:{width:390,height:844};
  const context=await browser.newContext({viewport:base,isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  async function press(selector){const el=typeof selector==='string'?p.locator(selector):selector;if(mode==='mobile')await el.tap();else await el.click();}
  async function next(phase){await debugClick(p,'debug-next');await p.waitForFunction(text=>document.querySelector('#phase').textContent.startsWith(text),phase);}
  async function dismiss(){await p.mouse.move(0,0);if(await p.locator('#game-help-tooltip').isVisible())await p.keyboard.press('Escape');await p.keyboard.press('Escape');await p.locator('#history-panel').waitFor({state:'hidden'});}
  await p.goto(url);await press('#practice');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));
  await debugClick(p,'debug-pause');await debugPreset(p,'synergy');
  assert.equal(await p.locator('#pc-info-history,[data-pc-info="history"]').count(),0);
  await press('#history-toggle');assert.equal(await p.locator('#history-empty').isVisible(),true);assert.equal(await p.locator('#pc-info-dialog').evaluate(e=>e.open),false);await dismiss();
  const unit=p.locator('#cells button[aria-label*="아군 칸, 루멘,"]').first();await press(unit);const selected=await p.locator('#selected-unit-content h2').textContent();
  await next('전투');await next('라운드 결과');
  assert.equal(await p.locator('#history-panel').isVisible(),false);assert.equal(await p.locator('#history-toggle').getAttribute('data-unread'),null);
  assert.equal(await p.locator('#selected-unit-content h2').textContent(),selected);
  if(mode==='pc')assert.equal(await p.locator('#inspection-unit-tab').getAttribute('aria-selected'),'true');
  assert.equal(await p.locator('#round-result-summary').isVisible(),true);assert.match(await p.locator('#round-result-summary').textContent(),/(승리|패배|무승부).*체력/);
  await p.screenshot({path:`${shots}/${mode}-result.png`,animations:'disabled'});
  await press('#history-toggle');await p.locator('#history-detail').waitFor({state:'visible'});assert.equal(await p.locator('#history-toggle').getAttribute('data-unread'),null);
  assert.equal(await p.locator('#history-outcome-details').evaluate(e=>e.open),false);
  assert.equal(await p.locator('#contribution-metrics [aria-pressed="true"]').getAttribute('data-contribution-select'),'damageDealt');
  assert.equal(await p.locator('[data-contribution-unit]').count(),6);assert.equal(await p.locator('#pc-info-dialog').evaluate(e=>e.open),false);
  if(mode==='pc'){assert.equal(await p.locator('#combat-record-dialog').evaluate(e=>e.open),false);assert.equal(await p.locator('#combat-content #history-panel').count(),1);}
  else{assert.equal(await p.locator('#combat-record-dialog').evaluate(e=>e.open),true);assert.equal(await p.locator('#combat-sheet-body #history-panel').count(),1);}
  for(const metric of ['damageDealt','damageTaken','healing','shieldBlocked'])for(const team of ['self','opponent']){
   await press(`[data-contribution-select="${metric}"]`);await press(`[data-contribution-team="${team}"]`);
   const graph=await p.locator('#history-contributions').evaluate(e=>({metric:e.querySelector('[data-metric]').dataset.metric,team:e.querySelector('[data-team]').dataset.team,values:[...e.querySelectorAll('[data-contribution-unit]')].map(row=>Number(row.dataset.value)),widths:[...e.querySelectorAll('.contribution-track > span')].map(bar=>parseFloat(bar.style.width)),total:Number(e.querySelector('[data-contribution-total]').textContent.replaceAll(',',''))}));
   assert.equal(graph.metric,metric);assert.equal(graph.team,team);assert.equal(graph.values.length,6);assert.deepEqual(graph.values,[...graph.values].sort((a,b)=>b-a));assert.ok(graph.widths.every(v=>Number.isFinite(v)&&v>=0&&v<=100));assert.ok(Math.abs(graph.total-graph.values.reduce((sum,v)=>sum+v,0))<.11);
   results.push({mode,metric,team,...graph});
  }
  await press('[data-contribution-select="damageDealt"]');await press('[data-contribution-team="self"]');
  await press('#history-outcome-details > summary');assert.equal(await p.locator('.history-player-result').count(),2);assert.match(await p.locator('#history-detail-body').textContent(),/체력 감소/);await press('#history-outcome-details > summary');
  await press('[data-help="contributions"]');await p.locator('#game-help-tooltip').waitFor({state:'visible'});await p.keyboard.press('Escape');assert.equal(await p.locator('#history-panel').isVisible(),true);
  await p.evaluate(()=>{document.getElementById('selected-unit-panel').scrollTop=0;document.getElementById('combat-record-dialog').scrollTop=0;});
  await p.screenshot({path:`${shots}/${mode}-graph.png`,animations:'disabled'});
  const frames=mode==='pc'?[[1400,1000],[1920,1080],[1366,768],[1024,768],[390,844],[320,740],[844,390],[480,320]]:[[390,844],[320,740],[360,640],[414,896],[768,1024],[844,390],[480,320]];
  for(const [width,height] of frames){
   await p.setViewportSize({width,height});await p.waitForTimeout(180);
   const m=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON(),sheet=document.getElementById('combat-record-dialog');return{wide:document.getElementById('history-panel').parentElement.id==='combat-content',sheetOpen:sheet.open,sheet:r('combat-record-dialog'),history:r('history-panel'),overflow:document.documentElement.scrollWidth>innerWidth,innerOverflow:document.getElementById('history-panel').scrollWidth>document.getElementById('history-panel').clientWidth,bench:r('bench'),dock:r('pc-play-dock'),gold:r('dock-gold'),xp:r('buy-experience'),roll:r('reroll'),ready:r('ready'),streak:r('dock-streak'),ids:[...document.querySelectorAll('[id]')].map(e=>e.id).filter((id,i,all)=>all.indexOf(id)!==i)};});
   assert.equal(m.overflow,false,JSON.stringify(m));assert.equal(m.innerOverflow,false,JSON.stringify(m));assert.deepEqual(m.ids,[]);assert.equal(m.sheetOpen,!m.wide);
   if(m.sheetOpen)assert.ok(m.sheet.x>=0&&m.sheet.right<=width&&m.sheet.y>=0&&m.sheet.bottom<=height+1,JSON.stringify(m));
   const old=baseline.find(row=>row.mode===mode&&row.width===width&&row.height===height);for(const id of ['dock','gold','xp','roll','ready','streak'])for(const key of ['x','y','width','height'])assert.ok(Math.abs(m[id][key]-old[id][key])<1,JSON.stringify({mode,width,height,id,key,actual:m[id][key],before:old[id][key]}));
   await p.screenshot({path:`${shots}/${mode}-${width}-${height}.png`,animations:'disabled'});results.push({mode,width,height,...m});
  }
  await p.setViewportSize(base);await p.waitForTimeout(100);
  if(mode==='mobile'){
   await p.locator('#combat-record-dialog').evaluate(e=>e.scrollTop=0);const before=await p.locator('#combat-record-dialog').boundingBox();await press('#combat-sheet-expand');const after=await p.locator('#combat-record-dialog').boundingBox();assert.ok(after.height>=before.height);await press('#combat-sheet-expand');
  }
  await dismiss();assert.equal(await p.locator('#selected-unit-content h2').textContent(),selected);
  await next('준비');assert.equal(await p.locator('#round-result-summary').isVisible(),false);await next('전투');await next('라운드 결과');
  assert.equal(await p.locator('#history-panel').isVisible(),false);assert.equal(await p.locator('#history-toggle').getAttribute('data-unread'),null);
  await press(p.locator('#recent-results button').last());assert.match(await p.locator('#history-detail-title').textContent(),/3-3/);
  await press('[data-contribution-select="healing"]');await press('[data-contribution-team="opponent"]');await dismiss();
  await p.reload();await p.locator('#game-view').waitFor({state:'visible'});assert.equal(await p.locator('#history-panel').isVisible(),false);await press('#history-toggle');assert.match(await p.locator('#history-detail-title').textContent(),/3-3/);assert.equal(await p.locator('.contribution-team').getAttribute('data-metric'),'healing');assert.equal(await p.locator('.contribution-team').getAttribute('data-team'),'opponent');await dismiss();
  if(mode==='pc'){
   await press('#inspection-unit-tab');await p.locator('#inspection-unit-tab').focus();await p.keyboard.press('ArrowRight');assert.equal(await p.locator('#history-panel').isVisible(),true);await p.keyboard.press('ArrowLeft');assert.equal(await p.locator('#selected-unit-content').isVisible(),true);
   await press('#history-toggle');await press('#screen-mode-mobile');await p.locator('#combat-record-dialog').waitFor({state:'visible'});await dismiss();await press('#screen-mode-pc');
  }
  if(mode==='mobile'){
   await debugPreset(p,'level10');for(let i=0;i<48;i++){if(await p.locator('#phase').textContent()==='경기 종료')break;if(await p.locator('#reward-dialog').evaluate(e=>e.open))await press('#reward-later');await debugClick(p,'debug-next');}
   await p.locator('#final-dialog').waitFor({state:'visible'});await press('#final-history');await p.locator('#combat-record-dialog').waitFor({state:'visible'});assert.equal(await p.locator('#history-detail').isVisible(),true);assert.equal(await p.locator('#pc-info-dialog').evaluate(e=>e.open),false);await dismiss();
   await press('#final-open');await press('#final-replay');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));assert.equal(await p.locator('#history-panel').isVisible(),false);assert.equal(await p.locator('#recent-results button').count(),0);assert.equal(await p.locator('#history-toggle').getAttribute('data-unread'),null);
  }
  console.log('PASS',mode,'dedicated review, results/selection without notification dots, all graphs/teams, responsive geometry, keyboard/tooltip, previous record/reload, mode switch/final review/replay');await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,errors},null,2));
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
