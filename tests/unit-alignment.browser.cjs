const {chromium,browserOptions}=require('./browser-runtime.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict');
const shots='test-results/unit-alignment',url='http://127.0.0.1:2668';
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser,vite;try{
  const {createServer}=await import('vite');
  vite=await createServer({server:{host:'127.0.0.1',port:2668,strictPort:true}});await vite.listen();
  browser=await chromium.launch(browserOptions());
  const page=await browser.newPage({viewport:{width:900,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url+'/tests/combat-attributes.fixture.html');
  await page.waitForFunction(()=>window.combatFixture?.scene.sys.isActive());
  const results=await page.evaluate(async()=>{
    const {BLUE_ARCHIVE_KINDS}=await import('/shared/blue-archive.ts');
    const {UNIT_BODY_HEIGHT,UNIT_FOOT_Y}=await import('/client/unit-appearance.ts');
    const fixture=window.combatFixture,scene=fixture.scene;
    scene.scene.pause();fixture.pair('yuuka','hifumi',{reduced:true});
    const source=scene.snapshot.fighters[0];
    scene.snapshot.phase='result';scene.snapshot.events=[];
    scene.snapshot.fighters=BLUE_ARCHIVE_KINDS.map((kind,i)=>({...structuredClone(source),
      id:`aligned-${kind}`,kind,x:i%5+1,y:Math.floor(i/5)*2+1,owner:i%2?'a':'b'}));
    scene.update(scene.time.now,16);
    const results=[];
    for(let frame=0;frame<6;frame++){
      for(const sprite of scene.sprites.values())sprite.setFrame(frame);
      scene.update(scene.time.now,16);
      for(const unit of scene.snapshot.fighters){
        const sprite=scene.sprites.get(unit.id),anchor=scene.visual.get(unit.id);
        const bounds=scene.frameBounds.get(unit.kind).get(String(frame));
        results.push({kind:unit.kind,frame,sourceHeight:bounds.bottom-bounds.top,
          height:(bounds.bottom-bounds.top)*sprite.scaleY,
          feetX:sprite.x+(bounds.footX-sprite.originX*sprite.width)*sprite.scaleX-anchor.x,
          feetY:sprite.y+(bounds.footY-sprite.originY*sprite.height)*sprite.scaleY-anchor.y,
          aspect:sprite.scaleX/sprite.scaleY,hit:scene.unitAt(unit.x,unit.y)?.id===unit.id,
          width:sprite.displayWidth,originX:sprite.originX,expectedHeight:UNIT_BODY_HEIGHT,expectedFeetY:UNIT_FOOT_Y});
      }
    }
    return results;
  });
  assert.equal(results.length,120);
  for(const result of results){
    assert.ok(Math.abs(result.height-result.expectedHeight)<1e-8,`${result.kind}/${result.frame}: visible height`);
    assert.ok(Math.abs(result.feetX)<1e-8,`${result.kind}/${result.frame}: centered feet`);
    assert.ok(Math.abs(result.feetY-result.expectedFeetY)<1e-8,`${result.kind}/${result.frame}: common baseline`);
    assert.equal(result.aspect,1);assert.equal(result.hit,true);
    assert.ok(result.sourceHeight>=85&&result.sourceHeight<=120);
  }
  assert.ok(new Set(results.map(r=>r.width.toFixed(3))).size>5,'different transparent padding requires different frame scales');
  assert.ok(new Set(results.map(r=>r.originX)).size>10,'direction-specific foot centers are used');
  for(const frame of [1,4]){
    await page.evaluate(frame=>{
      const scene=window.combatFixture.scene;
      for(const sprite of scene.sprites.values())sprite.setFrame(frame);
      scene.update(scene.time.now,16);
    },frame);
    await page.waitForTimeout(50);
    await page.locator('#board').screenshot({path:`${shots}/aligned-${frame===1?'front':'back'}.png`});
  }
  const breathing=await page.evaluate(()=>{
    const scene=window.combatFixture.scene;scene.reduced=false;
    const initial=scene.snapshot.fighters.map(unit=>scene.sprites.get(unit.id).y);
    const checks=[];
    for(let i=1;i<=90;i++){
      scene.update(scene.time.now+i*16,16);
      checks.push(...scene.snapshot.fighters.map((unit,index)=>scene.sprites.get(unit.id).y-initial[index]));
    }
    return checks;
  });
  for(const offset of breathing)assert.ok(Math.abs(offset)<1e-8,'idle feet remain at their anchor');
  // Exercise real targeting/movement after changing frame origins, including effects at torso height.
  const combat=await page.evaluate(()=>{
    const f=window.combatFixture,s=f.scene;f.pair('wakamo','shiroko');
    f.emit('attack');
    const tracer=f.inspect().effects.find(e=>e.role==='tracer'),target=s.sprites.get(s.snapshot.fighters[1].id);
    const origin={x:target.x,y:target.y};
    s.reduced=true;s.snapshot.fighters[0].x++;s.update(s.time.now+16,16);
    const source=s.snapshot.fighters[0],sprite=s.sprites.get(source.id),anchor=s.visual.get(source.id);
    return {tracer,origin,centered:sprite.x===anchor.x,hit:s.unitAt(source.x,source.y)?.id===source.id};
  });
  assert.equal(combat.centered,true);assert.equal(combat.hit,true);
  assert.ok(combat.tracer.y<combat.origin.y-25,'shots still hit the torso rather than the new foot pivot');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(`${shots}/results.json`,JSON.stringify({frames:results,breathing:true,combat:true,errors},null,2));
  console.log('PASS: all 20 units × 6 frames have equal visible height, centered feet and a common baseline; aspect ratio, idle feet, movement, hit targets and torso effects preserved');
}finally{await browser?.close();await vite?.close();}})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
