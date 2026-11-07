const {chromium,browserOptions}=require('./browser-runtime.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict');
const shots='docs/screenshots/unit-motion',url='http://127.0.0.1:2649';
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser,vite;try{
  const {createServer}=await import('vite');
  vite=await createServer({server:{host:'127.0.0.1',port:2649,strictPort:true}});await vite.listen();
  browser=await chromium.launch(browserOptions());const errors=[],results=[];
  for(const mode of ['pc','mobile']){
    const ctx=await browser.newContext({viewport:mode==='pc'?{width:600,height:780}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile'});
    const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto(url+'/tests/combat-attributes.fixture.html');
    await p.waitForFunction(()=>window.combatFixture?.scene.sys.isActive());
    await p.evaluate(()=>window.combatFixture.scene.scene.pause());
    for(const reverse of [false,true]){
      const combat=await p.evaluate(reverse=>{
        const f=window.combatFixture,scene=f.scene,start=scene.time.now;
        const options={reverse,sourcePosition:{x:1,y:4},targetPosition:{x:4,y:2}};
        f.pair('yuuka','hifumi',options);
        const before=f.unitVisuals(),positions=JSON.stringify(scene.snapshot.fighters.map(u=>[u.x,u.y]));
        f.emit('attack');scene.update(start+28,28);
        const kicked=f.unitVisuals(),point=scene.displayPosition(scene.snapshot.fighters[0]);
        const hitId=scene.unitAt(point.x,point.y)?.id;
        scene.update(start+300,272);const recovered=f.unitVisuals();
        return {before,kicked,recovered,positions,afterPositions:JSON.stringify(scene.snapshot.fighters.map(u=>[u.x,u.y])),hitId};
      },reverse);
      assert.equal(combat.before[0].flipX,reverse);assert.equal(combat.before[1].flipX,!reverse);
      const direction=reverse?-1:1;
      assert.ok(combat.kicked[0].pose.x*direction<0,'shooter kicks against its shot');
      assert.ok(combat.kicked[1].pose.x*direction>0,'target moves with the incoming shot');
      for(const u of combat.kicked){assert.equal(u.nameX,u.anchor.x);assert.equal(u.nameY,u.anchor.y+34);}
      assert.equal(combat.positions,combat.afterPositions);assert.equal(combat.hitId,combat.before[0].id);
      for(const u of combat.recovered){assert.ok(Math.abs(u.pose.x)<0.001);assert.ok(Math.abs(u.pose.scaleX-1)<=0.004);assert.ok(Math.abs(u.pose.scaleY-1)<=0.008);}
      await p.evaluate(reverse=>{const f=window.combatFixture;f.pair('yuuka','hifumi',{reverse,sourcePosition:{x:1,y:4},targetPosition:{x:4,y:2}});f.emit('attack');f.scene.update(f.scene.time.now+28,28);},reverse);
      await p.waitForTimeout(35);await p.locator('#board').screenshot({path:`${shots}/${mode}-${reverse?'reverse':'forward'}-shot.png`});

      const movement=await p.evaluate(reverse=>{
        const f=window.combatFixture,scene=f.scene,start=scene.time.now;
        f.pair('yuuka','hifumi',{reverse,sourcePosition:{x:1,y:4},targetPosition:{x:4,y:2}});
        scene.snapshot.fighters[0].x=2;scene.update(start+16,16);
        const travelling=f.unitVisuals()[0];
        for(let i=2;i<=65;i++)scene.update(start+i*16,16);
        return {travelling,stopped:f.unitVisuals()[0],cell:scene.snapshot.fighters[0].x};
      },reverse);
      assert.equal(movement.travelling.pose.moving,true);assert.ok(movement.travelling.angle*direction>0);
      assert.equal(movement.stopped.pose.moving,false);assert.ok(Math.abs(movement.stopped.angle)<0.36);
      assert.equal(movement.cell,2);assert.ok(Math.abs(movement.stopped.pose.x)<0.001);

      const dying=await p.evaluate(reverse=>{
        const f=window.combatFixture,scene=f.scene,start=scene.time.now;
        f.pair('yuuka','hifumi',{reverse,sourcePosition:{x:1,y:4},targetPosition:{x:4,y:2}});
        f.emit('attack');scene.snapshot.fighters[1].hp=0;f.emit('death');
        const point=scene.displayPosition(scene.snapshot.fighters[1]);
        scene.update(start+180,180);
        return {target:f.unitVisuals()[1],targetable:!!scene.unitAt(point.x,point.y)};
      },reverse);
      assert.equal(dying.targetable,false);assert.equal(dying.target.pose.dying,true);
      assert.ok(dying.target.alpha>0&&dying.target.alpha<1);assert.ok(dying.target.angle*direction>0);
      assert.equal(dying.target.nameX,undefined,'dead unit has no floating name');
      await p.waitForTimeout(35);await p.locator('#board').screenshot({path:`${shots}/${mode}-${reverse?'reverse':'forward'}-death.png`});
      const removed=await p.evaluate(()=>{const f=window.combatFixture;f.scene.update(f.scene.time.now+500,320);const first=f.unitVisuals()[1];f.scene.update(f.scene.time.now+700,200);return {first,again:f.unitVisuals()[1]};});
      assert.equal(removed.first.x,undefined);assert.equal(removed.again.x,undefined,'same snapshot never respawns a corpse');
      results.push({mode,reverse,facing:true,recoil:true,hit:true,movement:true,death:true,coordinatesUnchanged:true});
    }
    const reduced=await p.evaluate(()=>{
      const f=window.combatFixture,scene=f.scene,start=scene.time.now;
      f.pair('yuuka','hifumi',{reduced:true,sourcePosition:{x:4,y:4},targetPosition:{x:1,y:2}});
      f.emit('attack');scene.update(start+28,28);const units=f.unitVisuals();
      scene.snapshot.fighters[1].hp=0;f.emit('death');return {units,dead:f.unitVisuals()[1]};
    });
    assert.equal(reduced.units[0].flipX,true);
    for(const u of reduced.units)assert.deepEqual([u.pose.x,u.pose.y,u.pose.angle,u.pose.scaleX,u.pose.scaleY],[0,0,0,1,1]);
    assert.equal(reduced.dead.x,undefined);
    const restored=await p.evaluate(()=>{
      const f=window.combatFixture,scene=f.scene;
      f.pair('yuuka','hifumi');f.emit('attack');scene.reduced=true;scene.update(scene.time.now+28,28);
      const reduced=f.unitVisuals();
      scene.snapshot.round++;scene.snapshot.fighters[1].hp=100;scene.reduced=false;scene.update(scene.time.now+40,12);
      return {reduced,fresh:f.unitVisuals()};
    });
    for(const u of restored.reduced)assert.ok(Math.abs(u.pose.x)<0.001);
    for(const u of restored.fresh){assert.equal(u.pose.dying,false);assert.ok(Math.abs(u.pose.x)<0.001);}
    const recalled=await p.evaluate(()=>{
      const f=window.combatFixture;f.pair('yuuka','hifumi');const id=f.scene.snapshot.fighters[0].id;
      f.scene.snapshot.phase='prepare';f.scene.snapshot.players[0].units=[];
      f.scene.update(f.scene.time.now,16);return f.unitVisuals().find(u=>u.id===id);
    });assert.equal(recalled.x,undefined,'recall removes immediately without a death animation');
    await ctx.close();
  }
  // Record an actual-time preview, separate from the deterministic checks above.
  const demo=await browser.newContext({viewport:{width:600,height:780}});
  const page=await demo.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/tests/combat-attributes.fixture.html');await page.waitForFunction(()=>window.combatFixture?.scene.sys.isActive());
  await page.evaluate(()=>{
    const stream=document.querySelector('#board canvas').captureStream(30);
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    window.motionRecording={recorder,chunks,stream};recorder.start();
  });
  await page.evaluate(()=>window.combatFixture.pair('yuuka','hifumi',{sourcePosition:{x:1,y:5},targetPosition:{x:4,y:2}}));
  await page.waitForTimeout(400);await page.evaluate(()=>window.combatFixture.emit('attack'));
  await page.waitForTimeout(500);await page.evaluate(()=>{window.combatFixture.scene.snapshot.fighters[0].x=2;});
  await page.waitForTimeout(550);await page.evaluate(()=>window.combatFixture.emit('attack'));
  await page.waitForTimeout(500);await page.evaluate(()=>{const f=window.combatFixture;f.emit('attack');f.scene.snapshot.fighters[1].hp=0;f.emit('death');});
  await page.waitForTimeout(650);
  const encoded=await page.evaluate(()=>new Promise(resolve=>{
    const {recorder,chunks,stream}=window.motionRecording;
    recorder.onstop=()=>{
      const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));stream.getTracks().forEach(t=>t.stop());
    };recorder.stop();
  }));fs.writeFileSync(`${shots}/unit-motion-preview.webm`,Buffer.from(encoded,'base64'));await demo.close();
  assert.deepEqual(errors,[]);
  fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version:require('../package.json').version,browser:browser.version(),results,reducedMotion:true,reset:true,recall:true,errors},null,2));
  console.log('PASS: PC/mobile × both viewpoints: facing, recoil, directional hit, movement/settling, death; reduced motion, reset, recall and unchanged hit targets');
}finally{await browser?.close();await vite?.close();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
