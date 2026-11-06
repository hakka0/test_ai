const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots='docs/screenshots/shop-prepare-'+version;
const url='http://127.0.0.1:2669',server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2669',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const errors=[],results=[];
 for(const mode of ['pc','mobile']){
  const ctx=await browser.newContext({viewport:mode==='pc'?{width:1400,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  const press=async e=>mode==='mobile'?e.tap():e.click();
  const offers=()=>p.locator('#shop-offers .shop-card').evaluateAll(cards=>cards.map(e=>({slot:e.dataset.shopSlot,id:e.dataset.offer??null,revision:e.dataset.revision??null,sold:e.classList.contains('shop-sold')})));
  const gold=async()=>Number(await p.locator('#gold').textContent());
  async function buy(){
   const card=p.locator('#shop-offers [data-offer]:not(:disabled)').first(),slot=await card.getAttribute('data-shop-slot');
   const cost=Number((await card.getAttribute('aria-label')).match(/(\d+) 골드/)[1]),before=await gold();
   await press(card);await p.waitForFunction(({slot,gold})=>document.querySelector('#shop-offers [data-shop-slot="'+slot+'"]').classList.contains('shop-sold')&&Number(document.getElementById('gold').textContent)===gold,{slot,gold:before-cost});
  }
  await p.goto(url);await press(p.locator('#practice'));await p.locator('#game-view').waitFor({state:'visible'});await debugClick(p,'debug-pause');
  const room=await p.locator('#room-code').textContent();
  const frames=mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]];
  for(const [index,[width,height]]of frames.entries()){
   await p.setViewportSize({width,height});await p.waitForTimeout(180);await debugPreset(p,'mid');await buy();const before=await offers();
   assert.equal(before.filter(o=>o.sold).length,1);
   await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));assert.deepEqual(await offers(),before);
   await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent==='라운드 결과');assert.deepEqual(await offers(),before);
   await p.waitForTimeout(150);assert.deepEqual(await offers(),before,'result snapshots preserve sold and unsold offers');
   await buy();assert.equal((await offers()).filter(o=>o.sold).length,2,'existing offers remain purchasable during result');
   if(index===0){
    const previous=await offers(),money=await gold();await press(p.locator('#reroll'));await p.waitForFunction(g=>Number(document.getElementById('gold').textContent)===g,money-5);
    const paid=await offers();assert.ok(paid.every(o=>!o.sold&&!previous.some(old=>old.id===o.id)),'manual reroll still works');await buy();
   }
   const result=await offers(),money=await gold(),revision=Number(result.find(o=>!o.sold).revision);
   await p.screenshot({path:shots+'/'+mode+'-'+width+'-'+height+'-result.png',animations:'disabled'});
   await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));
   const next=await offers();assert.equal(next.length,5);assert.ok(next.every(o=>!o.sold&&!result.some(old=>old.id===o.id)));
   assert.ok(next.every(o=>Number(o.revision)===revision+1),'one automatic refresh on preparation');assert.ok(await gold()>money,'income is granted without a reroll fee');
   await p.waitForTimeout(150);assert.deepEqual(await offers(),next,'repeated preparation snapshots do not refresh again');
   assert.equal(await p.locator('#room-code').textContent(),room);
   const layout=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,cards:[...document.querySelectorAll('#shop-offers .shop-card')].map(e=>e.getBoundingClientRect().toJSON())}));
   assert.equal(layout.overflow,false);assert.ok(layout.cards.every(r=>r.width>=44&&r.height>=44));
   await p.screenshot({path:shots+'/'+mode+'-'+width+'-'+height+'-prepare.png',animations:'disabled'});
   results.push({mode,width,height,before,result,next,layout});
  }
  await ctx.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(shots+'/results.json',JSON.stringify({version,browser:browser.version(),results,errors},null,2));
 console.log('PASS result offers and purchases preserved, paid reroll, exactly one free preparation refresh, 8 minimum layouts and portrait-landscape rotation');
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
