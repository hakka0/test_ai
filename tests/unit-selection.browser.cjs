const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots=`docs/screenshots/unit-selection-${version}`,url='http://127.0.0.1:2670';
const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2670',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser,vite;try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const errors=[],results=[],rendering=[];
 for(const mode of ['pc','mobile']){
  const context=await browser.newContext({viewport:mode==='pc'?{width:1400,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));
  const press=async e=>mode==='mobile'?e.tap():e.click();
  async function closeUnit(){if(await p.locator('#unit-dialog').evaluate(e=>e.open)){await press(p.locator('#close-unit-dialog'));await p.locator('#unit-dialog').waitFor({state:'hidden'});}}
  await p.goto(url);await press(p.locator('#practice'));await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));await debugClick(p,'debug-pause');await debugPreset(p,'merge');
  await press(p.locator('#shop-offers [data-shop-slot="0"]'));await p.waitForFunction(()=>document.querySelector('#cells button[aria-label*="아군 칸, 루멘,"][aria-label*="강화 2성"]'));
  const room=await p.locator('#room-code').textContent();
  const frames=mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]];
  for(const [width,height] of frames){
   await p.setViewportSize({width,height});await p.waitForTimeout(180);
   await press(p.locator('#cells button[aria-label*="아군 칸, 루멘,"][aria-label*="강화 2성"]').first());
   if(mode==='mobile')await p.locator('#unit-dialog').waitFor({state:'visible'});
   const root=p.locator(mode==='pc'?'#selected-unit-content':'#unit-detail'),meta=root.locator('.unit-meta');
   assert.equal((await meta.textContent()).replace(/\s/g,''),'★★·★1·1G');
   assert.equal(await meta.locator('.unit-upgrade').getAttribute('aria-label'),'강화 2성');assert.equal(await meta.locator('.unit-rarity').getAttribute('aria-label'),'레어도 1등급');assert.equal(await meta.locator('.unit-price').getAttribute('aria-label'),'가격 1골드');
   assert.doesNotMatch(await root.locator('.selection > div').textContent(),/기본 가격|레어도|장비|전장 배치|대기 중|판매/);
   if(mode==='pc')assert.doesNotMatch((await root.locator('.selected-unit-section h3').allTextContents()).join(' '),/\d\s*\/\s*2/);
   const geometry=await meta.evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),width:e.clientWidth,scroll:e.scrollWidth,items:[...e.querySelectorAll('[role="img"]')].map(c=>({...c.getBoundingClientRect().toJSON(),color:getComputedStyle(c).color}))}));
   assert.equal(geometry.items.length,3);assert.ok(geometry.items.every(i=>Math.abs(i.y-geometry.items[0].y)<1),'rank, rarity and price share one row');assert.ok(geometry.scroll<=geometry.width+1,'summary fits');assert.notEqual(geometry.items[0].color,geometry.items[1].color);
   const help=p.locator(mode==='pc'?'#selected-unit-content [data-help="unit"]':'#unit-dialog .dialog-heading [data-help="unit"]'),tip=p.locator('#game-help-tooltip');
   if(mode==='pc')await help.hover();else await help.tap();await tip.waitFor({state:'visible'});assert.match(await tip.textContent(),/파란 ★는.*노란 ★ 숫자/);
   const tooltip=await tip.boundingBox();assert.ok(tooltip.x>=7&&tooltip.y>=7&&tooltip.x+tooltip.width<=width-7&&tooltip.y+tooltip.height<=height-7,'new symbol explanation fits the screen');
   if(mode==='pc')await p.mouse.move(0,0);else await help.tap();await tip.waitFor({state:'hidden'});
   assert.equal(await p.locator('#cells [aria-pressed="true"]').count(),1);await p.screenshot({path:`${shots}/summary-${mode}-${width}-${height}.png`,animations:'disabled'});await closeUnit();
   await p.screenshot({path:`${shots}/field-${mode}-${width}-${height}.png`,animations:'disabled'});
   await press(p.locator('[data-bench-slot][data-unit]').first());if(mode==='mobile')await p.locator('#unit-dialog').waitFor({state:'visible'});assert.equal((await root.locator('.unit-meta').textContent()).replace(/\s/g,''),'★·★3·3G');await closeUnit();
   const bench=p.locator('[data-bench-slot][aria-pressed="true"]'),pointer=bench.locator('.bench-selection-pointer');await pointer.waitFor({state:'visible'});
   assert.equal(await p.locator('#cells [aria-pressed="true"]').count(),0);
   const marker=await pointer.evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),viewport:e.closest('#mobile-bench-viewport').getBoundingClientRect().toJSON(),slot:e.parentElement.getBoundingClientRect().toJSON(),outline:getComputedStyle(e.parentElement).outlineColor,animation:getComputedStyle(e).animationName}));
   assert.ok(marker.rect.y>=marker.viewport.y&&marker.rect.bottom<=marker.slot.y+2,'bench arrow floats above the unit without being clipped');assert.equal(marker.outline,'rgb(255, 216, 74)');assert.equal(marker.animation,'unit-selection-float');
   await press(p.locator('#motion'));assert.equal(await p.locator('html').getAttribute('data-reduced-motion'),'true');assert.equal(await pointer.evaluate(e=>getComputedStyle(e).animationName),'none');await press(p.locator('#motion'));
   await p.screenshot({path:`${shots}/bench-${mode}-${width}-${height}.png`,animations:'disabled'});await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('#cells [aria-pressed="true"],[data-bench-slot][aria-pressed="true"]'));
   assert.equal(await p.locator('.bench-selection-pointer:visible').count(),0);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await p.locator('#room-code').textContent(),room);
   results.push({mode,width,height,geometry,marker,tooltip});
  }
  await debugPreset(p,'late');await press(p.locator('#cells button[aria-label*="아군 칸, 루멘,"][aria-label*="강화 3성"]').first());
  if(mode==='pc')await press(p.locator('#selected-unit-content img[role="button"]'));await p.locator('#unit-dialog').waitFor({state:'visible'});
  assert.equal((await p.locator('#unit-detail .unit-meta').textContent()).replace(/\s/g,''),'★★★·★1·1G');assert.match(await p.locator('#sell-unit').textContent(),/판매 · 9 골드/);await closeUnit();
  await context.close();
 }
 // Exercise the actual Phaser renderer with fixed time, movement, both viewpoints and death.
 const {createServer}=await import('vite');vite=await createServer({server:{host:'127.0.0.1',port:2671,strictPort:true}});await vite.listen();
 const p=await browser.newPage({viewport:{width:600,height:800}});p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:2671/tests/combat-attributes.fixture.html');await p.waitForFunction(()=>window.combatFixture?.scene.sys.isActive());await p.evaluate(()=>window.combatFixture.scene.scene.pause());
 for(const reverse of [false,true]){
  const r=await p.evaluate(reverse=>{
   const f=window.combatFixture,s=f.scene;f.pair('knight','mage',{reverse,sourcePosition:{x:7,y:0},targetPosition:{x:2,y:5}});const before=JSON.stringify(s.snapshot),source=s.snapshot.fighters[0],enemy=s.snapshot.fighters[1];
   const capture=()=>{const arrow=s.children.list.find(o=>o.getData('selectionIndicator')==='arrow'),cell=s.children.list.find(o=>o.getData('selectionIndicator')==='cell'),sprite=s.sprites.get(s.selected);return {arrow:{visible:arrow.visible,id:arrow.getData('unitId'),x:arrow.x,y:arrow.y,commands:arrow.commandBuffer.length},cell:{visible:cell.visible,id:cell.getData('unitId'),x:cell.x,y:cell.y,commands:cell.commandBuffer.length},sprite:sprite?{x:sprite.x,top:sprite.getBounds().top}:null};};
   s.selected=source.id;s.update(100,16);const first=capture();s.update(400,16);const bobbing=capture();s.reduced=true;s.update(700,16);const reducedA=capture();s.update(1100,16);const reducedB=capture();const unchanged=before===JSON.stringify(s.snapshot);
   s.selected=enemy.id;s.reduced=false;enemy.x++;s.update(1200,16);const moving=capture(),position=s.displayPosition(enemy);
   enemy.hp=0;s.update(1216,16);const dead=capture();s.selected='';s.update(1232,16);const cleared=capture();
   s.selected=source.id;s.update(1250,16);s.resetVisuals();const reset=capture();return {first,bobbing,reducedA,reducedB,moving,dead,cleared,reset,position,unchanged};
  },reverse);
  assert.equal(r.unchanged,true,'selection does not mutate game state');assert.ok(r.first.arrow.visible&&r.first.cell.visible);assert.equal(r.first.arrow.id,r.first.cell.id);assert.ok(r.first.arrow.commands>0&&r.first.cell.commands>0);assert.equal(r.first.arrow.x,r.first.sprite.x);assert.ok(r.first.arrow.y<r.first.sprite.top&&r.first.arrow.y>0);assert.notEqual(r.first.arrow.y,r.bobbing.arrow.y);assert.deepEqual(r.reducedA.arrow,r.reducedB.arrow);
  assert.equal(r.moving.arrow.x,r.moving.sprite.x);assert.equal(r.moving.cell.x,40+(r.position.x+.5)*90);assert.equal(r.moving.cell.y,40+(r.position.y+.5)*90);assert.notEqual(r.moving.arrow.id,r.first.arrow.id);
  for(const state of [r.dead,r.cleared,r.reset])assert.equal(state.arrow.visible||state.cell.visible,false,'death, clear and view reset remove both indicators');rendering.push({reverse,...r});
  await p.evaluate(reverse=>{const f=window.combatFixture,s=f.scene;f.pair('knight','mage',{reverse,reduced:true,sourcePosition:{x:2,y:4},targetPosition:{x:5,y:2}});s.selected=s.snapshot.fighters[0].id;s.update(1500,16);},reverse);await p.locator('#board').screenshot({path:`${shots}/renderer-${reverse?'reverse':'forward'}.png`});
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version,browser:browser.version(),results,rendering,errors},null,2));console.log('PASS compact rank/rarity/price from a real 2-star merge, nine PC/mobile layouts and rotation, bench pointer/glow/reduced motion, Phaser head tracking and tile outlines in both viewpoints, selection switch/death/reset');
}finally{await browser?.close();await vite?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
