const {createServer}=require('node:http');
const {readFile,mkdir,writeFile}=require('node:fs/promises');
const {resolve,extname}=require('node:path');
const assert=require('node:assert/strict');
const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const root=resolve('dist-pages'),prefix='/test_ai/',shots='test-results/tooltip-hover';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf'};
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=resolve(root,decodeURIComponent(pathname.slice(prefix.length))||'index.html');
 if(!pathname.startsWith(prefix)||!file.startsWith(root+'/')){res.writeHead(404).end();return;}
 try{res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}
 catch{res.writeHead(404).end();}
});
(async()=>{
 let browser;
 const errors=[],results=[];
 try{
  await mkdir(shots,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}${prefix}`;
  browser=await chromium.launch(browserOptions());
  for(const mobile of (process.env.TOOLTIP_TEST_MODE?[process.env.TOOLTIP_TEST_MODE==='mobile']:[false,true])){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1400,height:1000},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce',
    ...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/156.0.0.0 Mobile Safari/537.36'}:{})});
   const page=await context.newPage();page.setDefaultTimeout(10000);
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);await page.locator('#practice').click();
   await page.waitForFunction(()=>document.querySelector('#phase').textContent.startsWith('준비'));
   await debugPreset(page,'catalog');await debugClick(page,'debug-pause');
   const room=await page.evaluate(()=>sessionStorage.getItem('duel-token'));
   const sizes=mobile?[[390,844],[320,740],[844,390],[740,360],[667,375],[480,320],[390,844]]:[[1400,1000],[1024,768]];
   for(const [width,height] of sizes){
    await page.setViewportSize({width,height});
    await page.waitForFunction(portrait=>document.documentElement.dataset.screenOrientation===(portrait?'portrait':'landscape'),width<height);
    await page.locator('#units [data-unit]').first().click();
    const panel=page.locator(mobile?'#unit-dialog':'#selected-unit-content');
    const skill=panel.locator('.skill-card').first(),help=panel.locator('[data-help]').filter({visible:true}).first();
    await skill.waitFor({state:'visible'});
    if(!mobile){
     for(const [kind,source,id] of [['skill',skill,'#skill-detail-tooltip'],['help',help,'#game-help-tooltip'],['shop',page.locator('#shop-offers [data-offer]').first(),'#shop-unit-tooltip']]){
      const tip=page.locator(id);
      // Every real consumer defaults to trigger-only hover.
      await source.evaluate(e=>delete e.dataset.tooltipHover);
      await source.hover();await tip.waitFor({state:'visible'});
      assert.equal(await tip.getAttribute('data-tooltip-hover'),'trigger');
      // Closing may expose another stat button below the balloon. Aim at a
      // spot without another trigger so that its new tooltip cannot mask dismissal.
      const target=await tip.evaluate(e=>{
       const r=e.getBoundingClientRect();
       for(const fx of [.1,.5,.9])for(const fy of [.1,.5,.9]){
        const x=r.x+r.width*fx,y=r.y+r.height*fy;
        const below=document.elementsFromPoint(x,y).find(n=>!e.contains(n));
        if(!below?.closest('[data-help],.skill-card,[data-offer]'))return {x,y};
       }
       throw Error('No tooltip point clear of another trigger');
      });
      await page.mouse.move(target.x,target.y);
      await tip.waitFor({state:'hidden'});
      assert.equal(await source.getAttribute('aria-describedby'),null);
      // The same consumer can explicitly preserve hover over its balloon.
      await page.mouse.move(1,1);
      await source.evaluate(e=>e.dataset.tooltipHover='interactive');
      await source.hover();await tip.waitFor({state:'visible'});
      assert.equal(await tip.getAttribute('data-tooltip-hover'),'interactive');
      const interactive=await tip.boundingBox();
      await page.mouse.move(interactive.x+interactive.width/2,interactive.y+interactive.height/2);
      await page.waitForTimeout(180);assert.equal(await tip.isVisible(),true,'interactive tooltip survives pointer transfer');
      await page.mouse.move(1,1);await tip.waitFor({state:'hidden'});
      // Returning to the trigger during the crossing grace period cancels closing.
      await source.hover();await tip.waitFor({state:'visible'});
      const anchor=await source.boundingBox();
      await page.mouse.move(1,1);await page.mouse.move(anchor.x+anchor.width/2,anchor.y+anchor.height/2);
      await page.waitForTimeout(180);assert.equal(await tip.isVisible(),true);
      await page.keyboard.press('Escape');await tip.waitFor({state:'hidden'});
      await page.mouse.move(1,1);
      await source.evaluate(e=>delete e.dataset.tooltipHover);
      results.push({width,height,kind,triggerCloses:true,interactivePersists:true,reentry:true,escape:true});
     }
     await skill.focus();await page.keyboard.press('Enter');
     await page.locator('#skill-detail-tooltip').waitFor({state:'visible'});
     await page.keyboard.press('Escape');await page.locator('#skill-detail-tooltip').waitFor({state:'hidden'});
    }else{
     for(const [source,id] of [[skill,'#skill-detail-tooltip'],[help,'#game-help-tooltip']]){
      const tip=page.locator(id);
      await source.tap();await tip.waitFor({state:'visible'});
      assert.equal(await panel.evaluate(e=>e.open),true);
      const t=await tip.boundingBox();
      assert.ok(t.x>=7&&t.y>=7&&t.x+t.width<=width-7&&t.y+t.height<=height-7);
      await page.waitForTimeout(180);
      assert.equal(await tip.isVisible(),true,'touch opening is pinned rather than governed by hover timeout');
      await page.keyboard.press('Escape');await tip.waitFor({state:'hidden'});
      assert.equal(await panel.evaluate(e=>e.open),true,'Escape preserves the parent dialog');
      await source.tap();await tip.waitFor({state:'visible'});await source.tap();await tip.waitFor({state:'hidden'});
     }
     await page.locator('#close-unit-dialog').tap();
     results.push({width,height,touchPinned:true,secondTapCloses:true,escapeKeepsParent:true});
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('duel-token')),room);
    await page.screenshot({path:`${shots}/${mobile?'mobile':'pc'}-${width}-${height}.png`});
    console.log('PASS tooltip hover',mobile?'mobile':'pc',width,height);
   }
   await context.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${shots}/results.json`,JSON.stringify({results,errors},null,2));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
