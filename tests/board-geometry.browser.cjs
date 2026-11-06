const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset,selectDock}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const version=require('../package.json').version;
const url='http://127.0.0.1:2640';
const proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2640',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
let output='';proc.stderr.on('data',d=>output+=d);
(async()=>{let browser;try{
 for(let i=0;i<60;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch(browserOptions());const errors=[],results=[];const shots=`docs/screenshots/board-geometry-${version}`;fs.mkdirSync(shots,{recursive:true});
 for(const mode of ['pc','mobile']){
 const context=await browser.newContext({viewport:mode==='pc'?{width:1400,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36'});
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(10000);await p.goto(url);await p.locator('#practice').click();await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));await debugClick(p,'debug-pause');await debugPreset(p,'early');
 assert.equal(await p.locator('#cells button').count(),64);assert.match(await p.locator('#cells').getAttribute('aria-label'),/8행 8열.*4행/);
 const cell=(x,y)=>`#cells button[data-x="${x}"][data-y="${y}"]`;
 const own=()=>p.locator('#cells button[aria-label*="아군 칸, 루멘,"]').first();
 async function activate(sel){const l=typeof sel==='string'?p.locator(sel):sel;await l.scrollIntoViewIfNeeded();if(mode==='mobile'){await l.tap();if(await p.locator('#unit-dialog').evaluate(e=>e.open))await p.locator('#close-unit-dialog').tap();}else await l.click();}
 for(const y of [4,5,6,7]){await activate(own());await activate(cell(7,y));await p.waitForFunction(sel=>document.querySelector(sel).getAttribute('aria-label').includes('루멘'),cell(7,y));}
 await selectDock(p,'bench');
 const cdp=mode==='mobile'?await context.newCDPSession(p):null;
 async function drag(source,target,equipment=false){await p.locator(source).scrollIntoViewIfNeeded();const a=await p.locator(source).boundingBox(),b=await p.locator(target).boundingBox();assert.ok(a&&b);const start={x:a.x+a.width/2,y:a.y+a.height/2},end={x:b.x+b.width/2,y:b.y+b.height/2};
 if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});}else{await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(end.x,end.y,{steps:10});}
 await p.waitForTimeout(100);if(equipment){assert.equal(await p.locator('#equipment-drag-ghost').getAttribute('data-valid'),'true');assert.match(await p.locator('#equipment-target-name').textContent(),/실바/);}
 if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await p.mouse.up();}
 // Use the new rightmost column for placement, capacity-limited swap and equipment.
 await activate(own());await activate(cell(7,4));await p.waitForFunction(sel=>document.querySelector(sel).getAttribute('aria-label').includes('루멘'),cell(7,4));
 await drag('[data-bench-slot="0"]',cell(7,4));await p.waitForFunction(sel=>document.querySelector(sel).getAttribute('aria-label').includes('실바'),cell(7,4));assert.match(await p.locator('[data-bench-slot="0"]').textContent(),/루멘/);
 // Direct equipment targeting on that new row uses the same hit rectangle.
 if(await p.locator('#equipment-toggle').getAttribute('aria-expanded')!=='true')await p.locator('#equipment-toggle').click();
 const item=await p.locator('[data-equipment-item]').first().getAttribute('data-equipment-item');await drag(`[data-equipment-item="${item}"]`,cell(7,4),true);await p.locator(`[data-equipment-item="${item}"]`).waitFor({state:'detached'});
 if(mode==='mobile'&&await p.locator('#equipment-close').isVisible())await p.locator('#equipment-close').click();
 await activate(cell(7,4));assert.match(await p.locator('#selected-unit-content').textContent(),/실바/);
 await selectDock(p,'shop');
 const viewports=mode==='pc'?[{width:1400,height:1000},{width:1366,height:768},{width:1920,height:1080},{width:1024,height:768}]:[{width:390,height:844},{width:320,height:740},{width:844,height:390},{width:740,height:360},{width:667,height:375},{width:480,height:320}];
 for(const viewport of viewports){await p.setViewportSize(viewport);await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(300);const geometry=await p.evaluate(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};
 const b=rect(document.querySelector('#board-wrap')),canvas=rect(document.querySelector('#board canvas')),dock=rect(document.querySelector('#pc-play-dock')),ready=rect(document.querySelector('#ready'));
 const cells=[...document.querySelectorAll('#cells button')];let maxError=0,maxCellAspectError=0;
 for(const c of cells){const r=c.getBoundingClientRect(),x=+c.dataset.x,y=+c.dataset.y;
 maxError=Math.max(maxError,Math.abs(r.x+r.width/2-(b.x+b.width*(40+(x+.5)*90)/800)),Math.abs(r.y+r.height/2-(b.y+b.height*(40+(y+.5)*90)/800)));
 maxCellAspectError=Math.max(maxCellAspectError,Math.abs(r.width-r.height));}
 const shopImagesVisible=[...document.querySelectorAll('.shop-portrait img')].every(img=>getComputedStyle(img).visibility==='visible'&&getComputedStyle(img.parentElement).backgroundImage==='none');
 const bench=rect(document.querySelector('#bench')),slots=[...document.querySelectorAll('[data-bench-slot]')].map(rect),maxBenchAspectError=Math.max(...slots.map(r=>Math.abs(r.width-r.height)));return{b,bench,slots,maxBenchAspectError,canvas,dock,ready,maxError,maxCellAspectError,shopImagesVisible,scrollWidth:document.documentElement.scrollWidth,innerWidth,bodyScroll:scrollY};});
 assert.ok(geometry.maxError<1,JSON.stringify(geometry));assert.ok(geometry.maxCellAspectError<1);assert.ok(Math.abs(geometry.b.width/geometry.b.height-1)<.002);assert.ok(geometry.scrollWidth<=viewport.width);assert.ok(Math.abs(geometry.canvas.width-geometry.b.width)<1&&Math.abs(geometry.canvas.height-geometry.b.height)<1);
 assert.equal(geometry.slots.length,12);assert.ok(geometry.maxBenchAspectError<1,JSON.stringify({viewport,geometry}));assert.ok(geometry.slots.every(r=>r.width>=44&&r.height>=44));assert.ok(geometry.bench.bottom<=geometry.dock.y+1||viewport.width>viewport.height&&geometry.bench.bottom<=viewport.height+1);assert.equal(geometry.shopImagesVisible,true,'shop uses visible catalog images at every width');
 if(mode==='pc'){assert.equal(await p.locator('#ready').evaluate(e=>e.closest('#pc-play-dock')!==null),true);assert.equal(await p.locator('#pc-overview').isVisible(),false);}
 await p.locator('[data-bench-slot="11"]').scrollIntoViewIfNeeded();assert.equal(await p.locator('[data-bench-slot="11"]').evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!hit&&e.contains(hit);}),true,'last bench slot is reachable');await p.locator('#mobile-bench-viewport').evaluate(e=>e.scrollLeft=0);await p.screenshot({path:shots+'/'+mode+'-'+viewport.width+'-'+viewport.height+'.png',animations:'disabled'});results.push({mode,viewport,...geometry});
 if((mode==='pc'&&viewport.width===1400)||(mode==='mobile'&&viewport.width===390)){await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:`${shots}/${mode}-${version}.png`,animations:'disabled'});}
 }
 await p.setViewportSize(mode==='pc'?{width:1400,height:1000}:{width:390,height:844});await p.evaluate(()=>scrollTo(0,0));
 const enemy=p.locator('#cells button[aria-label*="상대 칸, 루멘,"]').first();await activate(enemy);assert.match(await p.locator('#selected-unit-content').textContent(),/상대 ·/);
 await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('전투'));assert.equal(await p.locator('#buy-experience').isDisabled(),false);assert.equal(await p.locator('#reroll').isDisabled(),false);
 await debugClick(p,'debug-next');await p.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('라운드 결과'));await p.waitForFunction(()=>document.querySelector('#selected-unit-content .empty'));
 await context.close();console.log('PASS',mode,'64 square aligned cells, 12 square bench cells and last-slot access, four friendly rows, rightmost-column placement/swap/equipment drag, enemy inspection and phase transitions');
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({browser:browser.version(),results,errors},null,2));
 }finally{await browser?.close();proc.kill('SIGTERM');}})().catch(e=>{console.error(output,e.stack||e);process.exitCode=1});
