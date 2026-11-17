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
  await page.goto(url+'/tests/combat-attributes.fixture.html'+(process.env.UNIT_ART_STYLE==='pixel'?'?art=pixel':''));
  await page.waitForFunction(()=>window.combatFixture?.scene.sys.isActive());
  const results=await page.evaluate(async()=>{
    const {BLUE_ARCHIVE_KINDS,SPRITE_FRAME_SIZE}=await import('/shared/blue-archive.ts');
    const {UNIT_ART_STYLE}=await import('/shared/unit-art.ts');
    const {UNITS}=await import('/shared/catalog.ts');
    const {UNIT_BODY_HEIGHT,UNIT_FOOT_Y}=await import('/client/unit-appearance.ts');
    const fixture=window.combatFixture,scene=fixture.scene;
    scene.scene.pause();fixture.pair('yuuka','hifumi',{reduced:true});
    const source=scene.snapshot.fighters[0];
    scene.snapshot.phase='result';scene.snapshot.events=[];
    scene.snapshot.fighters=BLUE_ARCHIVE_KINDS.map((kind,i)=>({...structuredClone(source),
      id:`aligned-${kind}`,kind,x:i%5+1,y:Math.floor(i/5)*2+1,owner:i%2?'a':'b'}));
    scene.update(scene.time.now,16);
    const size=SPRITE_FRAME_SIZE;
    const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    function alphaBounds(source,x=0,y=0){
      context.clearRect(0,0,size,size);context.drawImage(source,x,y,size,size,0,0,size,size);
      const pixels=context.getImageData(0,0,size,size).data;
      let left=size,top=size,right=0,bottom=0;
      for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(pixels[(y*size+x)*4+3]>=128){
        left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
      }
      return{left,top,right,bottom,width:right-left,height:bottom-top};
    }
    const portraits=new Map();
    for(const kind of BLUE_ARCHIVE_KINDS){
      const image=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=UNITS[kind].image;});
      if(image.width!==size||image.height!==size)throw new Error(kind+' portrait must match the selected frame size');
      portraits.set(kind,alphaBounds(image));
    }
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
          width:sprite.displayWidth,originX:sprite.originX,expectedHeight:UNIT_BODY_HEIGHT,expectedFeetY:UNIT_FOOT_Y,
          frameSize:size,artStyle:UNIT_ART_STYLE,filter:scene.textures.get(unit.kind).source[0].scaleMode,alpha:alphaBounds(scene.textures.get(unit.kind).getSourceImage(),(frame%3)*size,Math.floor(frame/3)*size),portraitAlpha:portraits.get(unit.kind)});
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
    assert.equal(result.filter,result.artStyle==='toon'?0:1,'texture filtering matches the chosen art style');
    for(const bounds of [result.alpha,result.portraitAlpha]){
      assert.ok(bounds.width>0&&bounds.height>0,'artwork remains visible');
      if(result.artStyle==='pixel'){
        assert.equal(Math.max(bounds.width,bounds.height),result.frameSize,'normalized artwork fills its long edge');
        assert.ok(Math.abs(bounds.left-(result.frameSize-bounds.right))<=1,'horizontal transparent margins are centered');
        assert.ok(Math.abs(bounds.top-(result.frameSize-bounds.bottom))<=1,'vertical transparent margins are centered');
      }else{
        assert.ok(bounds.left>0&&bounds.top>0&&bounds.right<result.frameSize&&bounds.bottom<result.frameSize,`${result.kind}/${result.frame}: toon halos and equipment fit inside the frame`);
      }
    }
  }
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
