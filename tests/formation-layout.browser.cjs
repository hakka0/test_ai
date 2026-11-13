const {createServer}=require('node:http');
const {readFile,mkdir,writeFile}=require('node:fs/promises');
const {resolve,extname}=require('node:path');
const assert=require('node:assert/strict');
const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const root=resolve('dist-pages'),prefix='/test_ai/',shots='test-results/formation-layout';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf'};
const failures=[],server=createServer(async(req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 const file=resolve(root,decodeURIComponent(name.slice(prefix.length))||'index.html');
 if(!name.startsWith(prefix)||!file.startsWith(root+'/')){res.writeHead(404).end();return;}
 try{res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}
 catch{failures.push(name);res.writeHead(404).end();}
});
(async()=>{let browser;const errors=[],results=[];try{
 await mkdir(shots,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=process.env.GAME_URL||`http://127.0.0.1:${server.address().port}${prefix}`;
 browser=await chromium.launch(browserOptions());
 for(const mobile of (process.env.FORMATION_TEST_MODE?[process.env.FORMATION_TEST_MODE==='mobile']:[false,true])){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1400,height:1000},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',
   ...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/156.0.0.0 Mobile Safari/537.36'}:{})});
  const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));
  const press=async locator=>{const el=typeof locator==='string'?p.locator(locator):locator;await el.scrollIntoViewIfNeeded();await(mobile?el.tap():el.click());};
  const phase=()=>p.locator('body').getAttribute('data-game-phase');
  const closeUnit=async()=>{if(await p.locator('#unit-dialog').evaluate(e=>e.open))await press('#close-unit-dialog');};
  const waitCount=n=>p.waitForFunction(n=>document.querySelectorAll('#units [data-unit]').length===n,n);
  const deployed=n=>p.waitForFunction(n=>document.querySelector('#deployed').textContent.startsWith(n+'/'),n);
  async function placeFirst(){
   await press(p.locator('#units [data-unit]').first());await closeUnit();
   await press('#cells button[data-x="2"][data-y="6"]');
  }
  async function returnSelected(){
   if(mobile){await press('#cells button[data-x="2"][data-y="6"]');await press('#bench-button');await closeUnit();}
   else await press('[data-formation-bench]');
  }
  await p.goto(url);await press('#pvp-practice');
  await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));
  await debugClick(p,'debug-pause');
  assert.equal(await p.locator('.ranking-row').count(),6,'actual one-human/five-bot practice');
  assert.equal(await p.locator('#gold').textContent(),'10');
  const offer=p.locator('#shop-offers [data-offer]').first();
  const cost=Number((await offer.getAttribute('aria-label')).match(/(\d+) 골드에 구매/)[1]);
  await press(offer);await waitCount(1);assert.equal(await p.locator('#gold').textContent(),String(10-cost));
  await placeFirst();await deployed(1);await waitCount(0);
  await returnSelected();await deployed(0);await waitCount(1);
  const gold=Number(await p.locator('#gold').textContent());
  if(gold>=4){await press('#buy-experience');await p.waitForFunction(gold=>Number(document.querySelector('#gold').textContent)===gold-4,gold);assert.match(await p.locator('#level-label').textContent(),/레벨 3/);}
  await debugPreset(p,'catalog');
  const room=await p.evaluate(()=>sessionStorage.getItem('duel-token'));
  const board=await p.locator('#board-wrap').elementHandle();
  const sizes=mobile?[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]]:[[1400,1000],[1024,768]];
  for(const [width,height] of sizes){
   await p.setViewportSize({width,height});await p.waitForTimeout(180);
   await placeFirst();await deployed(9);await returnSelected();await deployed(8);await closeUnit();
   const geometry=await p.evaluate(()=>{
    const box=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    return{overflow:document.documentElement.scrollWidth>innerWidth,board:box('board-wrap'),bench:box('bench'),shop:box('pc-dock-reserve'),ranking:box('player-ranking'),inspector:box('selected-unit-panel'),supply:box('formation-supply'),dock:box('pc-play-dock'),header:document.querySelector('header').getBoundingClientRect().toJSON(),targets:[...document.querySelectorAll('.ranking-row,#shop-offers [data-offer],#ready,#mobile-info-open')].filter(e=>e.getClientRects().length).map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))};
   });
   assert.equal(geometry.overflow,false);assert.ok(geometry.targets.every(r=>r.width>=44&&r.height>=44));
   const overlap=(a,b)=>a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1;
   for(const [a,b] of [['board','bench'],['board','shop'],['board','ranking'],['bench','shop'],['shop','ranking']])assert.equal(overlap(geometry[a],geometry[b]),false,`${width}x${height} ${a}/${b}`);
   if(!mobile){
    assert.equal(await p.locator('#formation-deployment #deployed').count(),1);
    assert.equal(await p.locator('header .matchbar').count(),1);
    assert.equal(await p.locator('#formation-supply #shop-panel').count(),1);
    assert.ok(Math.abs(geometry.header.height-72)<1);assert.ok(Math.abs(geometry.dock.height-248)<1);
    if(width===1400){assert.ok(Math.abs(geometry.supply.x-260)<2);assert.ok(Math.abs(geometry.supply.width-922)<2);assert.ok(geometry.board.width>=630);assert.ok(Math.abs(geometry.ranking.x-1216)<2);}
    await press('[data-formation-details]');await p.locator('#unit-dialog').waitFor({state:'visible'});
    assert.equal(await p.locator('#unit-detail .stat').count(),7,'all stats remain available in full detail');await closeUnit();
    assert.equal(await p.locator('#selected-unit-content .formation-equipment-slot').count(),2);
   }
   assert.equal(await p.evaluate(()=>sessionStorage.getItem('duel-token')),room);
   await p.screenshot({path:`${shots}/${mobile?'mobile':'pc'}-${width}-${height}-formation.png`});
   results.push({mobile,width,height,geometry,realPlacementAndBenchReturn:true});console.log('PASS formation',mobile?'mobile':'pc',width,height);
  }
  // Same live board and supply station continue through matching, combat and results.
  await closeUnit();await p.evaluate(()=>document.getElementById('phase').focus());await p.keyboard.press('Enter');
  await p.waitForFunction(()=>['matching','combat'].includes(document.body.dataset.gamePhase));
  if(await phase()==='matching')await debugClick(p,'debug-next');
  await p.waitForFunction(()=>document.body.dataset.gamePhase==='combat');
  assert.equal(await p.locator('#board-wrap').evaluate((el,old)=>el===old,board),true);
  assert.equal(await p.locator('#deployed').isVisible(),false,'combat hides preparation count');
  assert.equal(await p.locator('#ready').isDisabled(),true);
  await press(p.locator('#units [data-unit]').first());
  const sale=p.locator(mobile?'#unit-title-sell':'#selected-unit-content [data-quick-sell]');
  const price=Number((await sale.getAttribute('aria-label')).match(/ (\d+)골드/)[1]),beforeGold=Number(await p.locator('#gold').textContent());
  await press(sale);await waitCount(11);await closeUnit();assert.equal(Number(await p.locator('#gold').textContent()),beforeGold+price);
  await press(p.locator('#shop-offers [data-offer][aria-disabled="false"]').first());await waitCount(12);
  const bot=p.locator('.ranking-row[data-self="false"]').first();await press(bot);await p.locator('#scout-return').waitFor({state:'visible'});
  await press(p.locator('#cells [data-board-unit]').first());
  if(mobile){assert.equal(await p.locator('#unit-dialog').getAttribute('data-read-only'),'true');await closeUnit();}
  else assert.equal(await p.locator('#selected-unit-content [data-quick-sell]').count(),0);
  await press('#scout-return');await debugClick(p,'debug-second');
  await p.screenshot({path:`${shots}/${mobile?'mobile':'pc'}-combat.png`});
  await debugClick(p,'debug-next');await p.waitForFunction(()=>document.body.dataset.gamePhase==='result');
  await press('#history-toggle');await p.locator('#history-panel').waitFor({state:'visible'});
  assert.ok(await p.locator('#history-rounds button:not(:disabled)').count());
  await press(mobile?'#combat-sheet-close':'#inspection-unit-tab');
  await debugPreset(p,'reward');
  if(await p.locator('#reward-dialog').evaluate(e=>e.open))await press('#reward-later');
  if(mobile)await press('#equipment-toggle');
  await press(p.locator('[data-equipment-item]').first());await p.locator('#craft-dialog').waitFor({state:'visible'});await press('#craft-close');
  await p.reload();await p.locator('#game-view').waitFor({state:'visible'});
  const restoredToken=await p.evaluate(()=>sessionStorage.getItem('duel-token'));
  // Colyseus renews the reconnection session after a reload; the room stays.
  if(process.env.GAME_URL)assert.equal(restoredToken.split(':')[0],room.split(':')[0]);
  else assert.equal(restoredToken,room);
  if(await p.locator('#reward-dialog').evaluate(e=>e.open))await press('#reward-later');
  await press('#leave');await p.locator('#lobby').waitFor({state:'visible'});
  assert.equal(await p.locator('header .matchbar').isVisible(),false);
  await context.close();
 }
 if(process.env.GAME_URL){
  // The PC room control moves into the information dialog; keep real joining,
  // concealed copying and reconnection working across compact/desktop changes.
  const hostContext=await browser.newContext({viewport:{width:1400,height:1000},permissions:['clipboard-read','clipboard-write']});
  const guestContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
   userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/156.0.0.0 Mobile Safari/537.36'});
  const host=await hostContext.newPage(),guest=await guestContext.newPage();
  for(const page of [host,guest]){page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.goto(url);}
  await host.locator('#create').click();await host.locator('#game-view').waitFor({state:'visible'});
  await host.locator('#mobile-info-open').click();await host.locator('#pc-info-tabs [data-pc-info="connection"]').click();
  await host.locator('#pc-info-connection #room-code-control').waitFor({state:'visible'});
  const code=await host.locator('#room-code').textContent();assert.match(code,/^[A-Z0-9]{4}$/);
  await host.locator('#room-code-copy').click();await host.waitForFunction(async code=>(await navigator.clipboard.readText())===code,code);
  assert.equal(await host.locator('#room-code-toggle').getAttribute('aria-pressed'),'false');
  await host.locator('#pc-info-close').click();
  await guest.locator('#code').fill(code);await guest.locator('#join').tap();
  for(const page of [host,guest])await page.waitForFunction(()=>document.body.dataset.gamePhase==='prepare');
  const token=await host.evaluate(()=>sessionStorage.getItem('duel-token'));
  await host.setViewportSize({width:390,height:844});await host.locator('header #room-code-control').waitFor({state:'visible'});
  assert.equal(await host.locator('#room-code').textContent(),code);
  await host.setViewportSize({width:1400,height:1000});
  await host.locator('#mobile-info-open').click();await host.locator('#pc-info-tabs [data-pc-info="connection"]').click();
  await host.locator('#pc-info-connection #room-code-control').waitFor({state:'visible'});
  await host.locator('#pc-info-close').click();await host.reload();await host.locator('#game-view').waitFor({state:'visible'});
  assert.equal((await host.evaluate(()=>sessionStorage.getItem('duel-token'))).split(':')[0],token.split(':')[0]);
  assert.equal(await host.locator('#room-code').textContent(),code);
  assert.equal(await guest.locator('.ranking-row').count(),2);
  await hostContext.close();await guestContext.close();
  console.log('PASS real two-person room create, information-menu code/copy, mobile join, compact/PC relocation and reconnect');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
 await writeFile(`${shots}/results.json`,JSON.stringify({results,errors,failures,source:process.env.GAME_URL?'Node server and live snapshots':'Pages local engine; actual one-human/five-bot practice'},null,2));
 console.log(`PASS real purchases, XP, placement/return, ${results.length} layouts, same-board combat, reserve sale/buy, scouting, history, gear details, restore and lobby`);
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
