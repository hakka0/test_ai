const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version,shots='docs/screenshots/stat-icons-'+version;
const previous=JSON.parse(fs.readFileSync('docs/screenshots/attack-speed-0.20.39/stats-results.json','utf8')).results;
const order=['hp','attack','defense','crit-chance','crit-damage','attack-speed','range'];
const names=['체력','공격력','방어력','치명타 확률','치명타 피해','공격 속도','사거리'];
const url='http://127.0.0.1:2668',server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2668',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser;try{
 for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const errors=[],results=[];
 for(const mode of process.env.STAT_TEST_MODE?[process.env.STAT_TEST_MODE]:['pc','mobile']){
  const ctx=await browser.newContext({viewport:{width:1400,height:1000},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  const press=async e=>mode==='mobile'?e.tap():e.click();
  await p.goto(url);await press(p.locator('#practice'));await p.locator('#game-view').waitFor({state:'visible'});
  await debugClick(p,'debug-pause');await debugPreset(p,'early');
  const room=await p.locator('#room-code').textContent();
  const frames=mode==='pc'?[[1400,1000],[1024,768]]:[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]];
  for(const [width,height] of frames){
   await p.setViewportSize({width,height});await p.waitForTimeout(180);
   await press(p.locator('#cells button[aria-label*="아군 칸, 루멘,"]').first());
   if(mode==='pc'&&!await p.locator('#unit-dialog').evaluate(e=>e.open))await press(p.locator('#selected-unit-content img[role="button"]'));
   await p.locator('#unit-dialog').waitFor({state:'visible'});
   await p.waitForTimeout(100);assert.equal(await p.locator('#game-help-tooltip').isVisible(),false,'opening details cannot click an icon underneath');
   assert.deepEqual(await p.locator('#unit-detail .stat strong').allTextContents(),['220','24','12','10%','150%','1.00','1']);
   assert.deepEqual(await p.locator('#unit-detail .stat').evaluateAll(cards=>cards.map(e=>e.dataset.stat)),order);
   assert.equal(await p.locator('#unit-detail .stat-icon').count(),7);
   assert.equal(await p.locator('#unit-detail .attack-speed-grade').textContent(),'보통');
   for(let i=0;i<7;i++)assert.match(await p.locator('#unit-detail .stat').nth(i).getAttribute('aria-label'),new RegExp(names[i]));
   assert.deepEqual(await p.locator('#unit-detail .stat-label').allTextContents(),names,'short labels make each icon/value readable');
   assert.ok(await p.locator('#unit-detail .stat-label').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect(),p=e.closest('.stat').getBoundingClientRect();return r.left>=p.left&&r.right<=p.right&&e.scrollWidth<=e.clientWidth+1;})),'labels fit within each stat');
   const geometry=await p.locator('#unit-detail .stats').evaluate(e=>({width:e.clientWidth,height:e.getBoundingClientRect().height,scroll:e.scrollWidth,cards:[...e.children].map(c=>({...c.getBoundingClientRect().toJSON(),value:c.querySelector('strong').getBoundingClientRect().toJSON(),color:getComputedStyle(c.querySelector('svg')).color}))}));
   assert.ok(geometry.scroll<=geometry.width+1);assert.equal(geometry.cards.length,7);
   for(let i=0;i<6;i+=3)assert.ok(geometry.cards.slice(i,i+3).every(c=>Math.abs(c.y-geometry.cards[i].y)<1),'three columns');
   assert.ok(geometry.cards[6].y>geometry.cards[5].y,'range occupies the third row');
   assert.ok(geometry.cards.every(c=>c.width>=44&&c.height>=44&&c.value.right<=c.right-2&&c.value.left>=c.left+2),'touch size and visible numbers');
   assert.deepEqual(geometry.cards.slice(0,3).map(c=>c.color),['rgb(40, 130, 90)','rgb(205, 64, 86)','rgb(37, 123, 185)']);
   assert.equal(geometry.cards[6].color,'rgb(71, 108, 133)');
   const old=previous.find(r=>r.mode===mode&&r.width===width&&r.height===height),oldHeight=Math.max(...old.geometry.cards.map(c=>c.bottom))-Math.min(...old.geometry.cards.map(c=>c.y));
   assert.ok(geometry.height<oldHeight*0.75,'labeled three-column stats remain at least 25% shorter than the original list');
   const crit=p.locator('#unit-detail [data-stat="crit-chance"] [data-critical-fragment]'),damage=p.locator('#unit-detail [data-stat="crit-damage"]');
   assert.equal(await crit.getAttribute('d'),await damage.locator('[data-critical-fragment]').getAttribute('d'));
   assert.equal(await damage.locator('[data-critical-up]').count(),1);
   // Center within the scrollport so the sticky heading/sale controls stay clear.
   const last=p.locator('#unit-detail [data-stat="range"]');await last.evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest'}));
   const reach=await last.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2),dialog=document.getElementById('unit-dialog');return {reachable:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&e.contains(hit),rect:r.toJSON(),hit:hit?.outerHTML,dialog:dialog.getBoundingClientRect().toJSON(),scrollTop:dialog.scrollTop};});
   if(!reach.reachable)await p.screenshot({path:shots+'/unreachable-'+mode+'-'+width+'-'+height+'.png',animations:'disabled'});
   assert.equal(reach.reachable,true,JSON.stringify({message:'last stat remains reachable',mode,width,height,reach}));
   await p.screenshot({path:shots+'/stats-'+mode+'-'+width+'-'+height+'.png',animations:'disabled'});
   for(let i=0;i<7;i++){
    const card=p.locator('#unit-detail .stat').nth(i),tip=p.locator('#game-help-tooltip');await card.evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest'}));
    if(mode==='pc')await card.hover();else await card.tap();
    await tip.waitFor({state:'visible',timeout:3000}).catch(async e=>{console.log('STAT HELP',mode,width,height,order[i],await p.evaluate(()=>({mode:document.documentElement.dataset.screenMode,dialogs:[...document.querySelectorAll('dialog[open]')].map(e=>e.id),tip:document.getElementById('game-help-tooltip').outerHTML})));throw e;});assert.match(await tip.textContent(),new RegExp(names[i]));
    await p.waitForTimeout(120);assert.equal(await tip.isVisible(),true,'tooltip survives snapshots');
    const rect=await tip.boundingBox();assert.ok(rect.x>=7&&rect.y>=7&&rect.x+rect.width<=width-7&&rect.y+rect.height<=height-7,'tooltip fits viewport');
    if(mode==='pc'){await card.click();assert.equal(await tip.isVisible(),true,'PC click does not toggle hover help');await p.mouse.move(0,0);}else await card.tap();
    await tip.waitFor({state:'hidden'});
   }
   await press(p.locator('#close-unit-dialog'));assert.equal(await p.locator('#room-code').textContent(),room);
   if(mode==='pc'){
    await p.locator('#selected-unit-content .stats').scrollIntoViewIfNeeded();
    const side=await p.locator('#selected-unit-content .stat').evaluateAll(cards=>cards.map(e=>({card:e.getBoundingClientRect().toJSON(),value:e.querySelector('strong').getBoundingClientRect().toJSON()})));
    assert.ok(side.every(s=>s.card.width>=44&&s.card.height>=44&&s.value.right<=s.card.right-2),'PC rail values fit');
    assert.ok(side.slice(0,3).every(s=>Math.abs(s.card.y-side[0].card.y)<1),'PC rail uses three columns');
    await p.screenshot({path:shots+'/sidebar-'+width+'-'+height+'.png',animations:'disabled'});
   }
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   results.push({mode,width,height,geometry,previousHeight:oldHeight,heightReduction:1-geometry.height/oldHeight});
  }
  await debugPreset(p,'synergy');
  for(const [name,value,grade] of [['루멘','1.00','보통'],['실바','1.25','빠름'],['노바','0.71','느림'],['아르덴','0.83','느림'],['카이','1.11','빠름'],['세라','0.91','보통']]){
   await press(p.locator('#cells button[aria-label*="아군 칸, '+name+',"]').first());
   if(mode==='pc'&&!await p.locator('#unit-dialog').evaluate(e=>e.open))await press(p.locator('#selected-unit-content img[role="button"]'));
   await p.locator('#unit-dialog').waitFor({state:'visible'});
   assert.equal(await p.locator('#unit-detail [data-stat="attack-speed"] strong').textContent(),value);
   assert.equal(await p.locator('#unit-detail .attack-speed-grade').textContent(),grade);
   await press(p.locator('#close-unit-dialog'));
  }
  await ctx.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(shots+'/stats-results.json',JSON.stringify({version,browser:browser.version(),results,errors},null,2));
 console.log('PASS seven stat icons/order, three columns, compact height, PC hover/mobile toggle help, all six speeds, 8 minimum layouts and rotation, readable values and room preserved');
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
