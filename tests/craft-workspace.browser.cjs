const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots='docs/screenshots/item-popup';
const url='http://127.0.0.1:2649',server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2649',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const errors=[],results=[];
 for(const mode of ['pc','mobile']){
  const base=mode==='pc'?{width:1400,height:1000}:{width:390,height:844};
  const context=await browser.newContext({viewport:base,isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  const dialog=p.locator('#craft-dialog');
  async function press(selector){const el=typeof selector==='string'?p.locator(selector):selector;if(mode==='mobile')await el.tap();else await el.click();}
  const item=name=>p.locator('[data-equipment-item]').filter({hasText:name});
  async function gear(){if(await p.locator('#equipment-toggle').getAttribute('aria-expanded')!=='true')await press('#equipment-toggle');}
  async function open(name,index=0){if(mode==='mobile'&&await dialog.evaluate(e=>e.open))await close();await gear();await press(item(name).nth(index));await dialog.waitFor({state:'visible'});assert.match(await p.locator('#craft-title').textContent(),new RegExp(name));assert.equal(await dialog.evaluate(e=>e.matches(':modal')),false);}
  async function close(){if(await dialog.evaluate(e=>e.open))await press('#craft-close');}
  async function reward(){await close();await debugPreset(p,'reward');await p.locator('#reward-dialog').waitFor({state:'visible'});await press('#reward-later');await gear();}
  const stock=()=>p.locator('#inventory .item').evaluateAll(nodes=>nodes.map(e=>({id:e.querySelector('[data-item]').dataset.item,text:e.querySelector('strong').textContent})));
  const geometry=()=>p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON();return{board:r('board-wrap'),bench:r('bench'),dock:r('pc-play-dock'),ranking:r('player-ranking')};});
  await p.goto(url);await press('#practice');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));await debugClick(p,'debug-pause');await debugPreset(p,'early');
  assert.equal(await p.locator('#equipment-craft').count(),0);
  const initial=await stock();await open('새벽의 검');assert.equal(await p.locator('#item-no-recipes').isVisible(),true);assert.match(await p.locator('#item-description').textContent(),/공격력 \+8/);assert.equal(await p.locator('#equipment-cancel').isVisible(),false);assert.deepEqual(await stock(),initial);
  await open('여명의 갑옷');assert.match(await p.locator('#item-description').textContent(),/체력 \+60/);
  await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await item('여명의 갑옷').evaluate(e=>e===document.activeElement),true);
  await item('새벽의 검').focus();await p.keyboard.press('Enter');await dialog.waitFor({state:'visible'});await p.keyboard.press('Escape');
  await item('새벽의 검').focus();await p.keyboard.press('Space');await dialog.waitFor({state:'visible'});
  await press('#craft-dialog [data-help="craft"]');if(mode==='pc')await p.locator('#craft-dialog [data-help="craft"]').hover();
  await p.locator('#game-help-tooltip').waitFor({state:'visible'});await p.keyboard.press('Escape');assert.equal(await dialog.evaluate(e=>e.open),true);await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await open('별빛 부적');await press('#gold');await dialog.waitFor({state:'hidden'});
  await reward();assert.equal(await item('강철 조각').count(),2);await open('강철 조각',1);
  const clicked=await item('강철 조각').nth(1).getAttribute('data-equipment-item'),other=await item('강철 조각').nth(0).getAttribute('data-equipment-item'),gold=await p.locator('#gold').textContent();
  assert.deepEqual(await p.locator('[data-recipe]').evaluateAll(nodes=>nodes.map(e=>Number(e.dataset.recipe))),[0,3,4]);
  assert.equal(await p.locator('[data-recipe="0"]').isEnabled(),true);
  const before=await stock();await press('[data-recipe="3"]');assert.deepEqual(await stock(),before);assert.equal(await p.locator('[data-recipe="3"]').getAttribute('aria-pressed'),'true');
  await press('#craft-submit');await p.waitForFunction(()=>document.getElementById('craft-title').textContent.includes('전투 외투'));assert.match(await p.locator('#craft-message').textContent(),/제작 완료/);assert.equal(await p.locator('[data-recipe-origin="3"]').count(),1);
  const after=await stock();assert.equal(after.some(i=>i.id===clicked),false);assert.equal(after.some(i=>i.id===other),true);assert.equal(after.length,before.length-1);assert.equal(await p.locator('#gold').textContent(),gold);
  const unit=p.locator('#cells button[aria-label*="아군 칸, 루멘,"]').first();
  await press('#item-equip');assert.equal(await dialog.evaluate(e=>e.open),false);assert.equal(await p.locator('#equipment-cancel').isVisible(),true);await press(unit);
  await p.waitForFunction(()=>!Array.from(document.querySelectorAll('[data-equipment-item]')).some(e=>e.textContent.includes('전투 외투')));assert.match(await p.locator('#inventory').textContent(),/전투 외투/);
  if(await p.locator('#unit-dialog').evaluate(e=>e.open))await press('#close-unit-dialog');
  await reward();await open('별빛 결정');assert.deepEqual(await p.locator('[data-recipe]').evaluateAll(nodes=>nodes.map(e=>Number(e.dataset.recipe))),[2,4,5]);assert.equal(await p.locator('[data-recipe="2"]').isDisabled(),true);assert.match(await p.locator('[data-recipe="2"]').textContent(),/1\/2/);
  const frames=mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320]];
  for(const [width,height] of frames){
   await close();await p.setViewportSize({width,height});await p.waitForTimeout(180);await gear();
   const beforeLayout=await geometry();await open('강철 조각');for(const recipe of [3,4,0]){await press('[data-recipe="'+recipe+'"]');assert.equal(await p.locator('[data-recipe="'+recipe+'"]').getAttribute('aria-pressed'),'true');}await dialog.evaluate(e=>e.scrollTop=0);await p.waitForTimeout(60);
   const m=await p.evaluate(()=>{const r=id=>document.getElementById(id).getBoundingClientRect().toJSON(),d=document.getElementById('craft-dialog');return{dialog:r('craft-dialog'),footer:r('craft-footer'),submit:r('craft-submit'),close:r('craft-close'),insideOverflow:d.scrollWidth>d.clientWidth,overflow:document.documentElement.scrollWidth>innerWidth,ids:[...document.querySelectorAll('[id]')].map(e=>e.id).filter((id,i,all)=>all.indexOf(id)!==i)};});
   const afterLayout=await geometry();for(const id of Object.keys(beforeLayout))for(const key of ['x','y','width','height'])assert.ok(Math.abs(beforeLayout[id][key]-afterLayout[id][key])<1,JSON.stringify({mode,width,height,id,key,before:beforeLayout[id],after:afterLayout[id]}));
   assert.equal(m.overflow,false);assert.equal(m.insideOverflow,false);assert.deepEqual(m.ids,[]);assert.ok(m.dialog.width<=336&&m.dialog.x>=0&&m.dialog.right<=width+1&&m.dialog.y>=0&&m.dialog.bottom<=height+1,JSON.stringify({mode,width,height,m}));
   for(const id of ['submit','close'])assert.ok(m[id].width>=44&&m[id].height>=44&&m[id].y>=m.dialog.y&&m[id].bottom<=m.dialog.bottom+1,JSON.stringify({mode,width,height,id,m}));
   assert.equal(await p.locator('#craft-submit').isEnabled(),true);
   await p.screenshot({path:shots+'/'+mode+'-'+width+'-'+height+'.png',animations:'disabled'});results.push({mode,width,height,...m,layout:afterLayout});
  }
  if(mode==='mobile'){const room=await p.locator('#room-code').textContent();for(const viewport of [{width:390,height:844},{width:844,height:390},{width:390,height:844}]){await p.setViewportSize(viewport);await p.waitForTimeout(180);assert.equal(await dialog.evaluate(e=>e.open),true);assert.equal(await p.locator('[data-recipe="0"]').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('#room-code').textContent(),room);}}
  await close();await p.setViewportSize(base);await p.waitForTimeout(180);await open('강철 조각');
  await press('[data-recipe="0"]');const iron=await item('강철 조각').evaluateAll(nodes=>nodes.map(e=>e.dataset.equipmentItem));assert.equal(new Set(iron).size,2);
  await press('#craft-submit');await p.waitForFunction(()=>document.getElementById('craft-title').textContent.includes('성광 대검'));assert.equal(await item('강철 조각').count(),0);assert.equal(await item('성광 대검').count(),1);assert.equal(await p.locator('[data-recipe-origin="0"]').count(),1);
  await p.screenshot({path:shots+'/'+mode+'-crafted.png',animations:'disabled'});await close();
  // Dragging remains a separate path and never opens the item inspector.
  const weapon=item('성광 대검');await weapon.scrollIntoViewIfNeeded();const a=await weapon.boundingBox(),b=await unit.boundingBox();
  if(mode==='mobile'){const cdp=await context.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});await p.waitForTimeout(70);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  else{await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:10});await p.mouse.up();}
  await weapon.waitFor({state:'detached'});assert.equal(await dialog.evaluate(e=>e.open),false);
  await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));await open('수호 천');
  assert.equal(await p.locator('[data-recipe]:enabled').count(),0);assert.equal(await p.locator('#craft-submit').isDisabled(),true);assert.match(await p.locator('#craft-availability').textContent(),/준비 단계/);
  const locked=await stock();await p.locator('#craft-submit').evaluate(e=>{e.disabled=false;e.click();});await p.waitForTimeout(100);assert.deepEqual(await stock(),locked);
  await close();await p.reload();await p.locator('#game-view').waitFor({state:'visible'});assert.equal(await dialog.evaluate(e=>e.open),false);
  console.log('PASS',mode,'item inspection/switching, nonmodal/keyboard/touch/focus, related recipes and shortages, explicit craft with exact clicked material, two identical materials, result inspection/equip/drag, combat lock and reload');
  await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(shots+'/results.json',JSON.stringify({version,browser:browser.version(),results,errors},null,2));
 console.log('PASS eight viewports, popup bounds/44px controls/no overflow and board/bench/shop/ranking geometry preserved');
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
