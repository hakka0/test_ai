const {chromium,browserOptions}=require('./browser-runtime.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict');
const shots='docs/screenshots/gun-effects',url='http://127.0.0.1:2650';
const attacks={red:'yuuka',yellow:'shiroko',blue:'hifumi',purple:'neru'};
const colors={red:0xff667a,yellow:0xffd45c,blue:0x66baff,purple:0xc58aff};
const fillAlphas=(commands,color)=>commands.flatMap((v,i)=>v===7&&commands[i+1]===color?[commands[i+2]]:[]);
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser,vite;try{
  const {createServer}=await import('vite');
  vite=await createServer({server:{host:'127.0.0.1',port:2650,strictPort:true}});await vite.listen();
  browser=await chromium.launch(browserOptions());const errors=[],results=[];
  for(const mode of ['pc','mobile']){
    const ctx=await browser.newContext({viewport:mode==='pc'?{width:600,height:780}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile'});
    const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto(url+'/tests/combat-attributes.fixture.html');await p.waitForFunction(()=>window.combatFixture?.scene.sys.isActive());
    for(const reverse of [false,true])for(const type of ['attack','skillDamage'])for(const [attribute,kind] of Object.entries(attacks)){
      const r=await p.evaluate(async({kind,reverse,type})=>{
        const f=window.combatFixture;f.pair(kind,'hifumi',{reverse,sourcePosition:{x:1,y:4},targetPosition:{x:4,y:2}});
        f.emit(type);const before=f.inspect(),state=JSON.stringify(f.scene.snapshot);
        await new Promise(r=>setTimeout(r,60));
        return {before,after:f.inspect(),unchanged:state===JSON.stringify(f.scene.snapshot)};
      },{kind,reverse,type});
      const muzzle=r.before.effects.find(e=>e.role==='muzzle'),tracer=r.before.effects.find(e=>e.role==='tracer');
      assert.equal(muzzle.attribute,attribute);assert.equal(tracer.attribute,attribute);
      assert.ok(muzzle.commands.includes(0xffffff),'muzzle has a bright core');
      const layers=fillAlphas(muzzle.commands,colors[attribute]);assert.ok(Math.max(...layers)>Math.min(...layers),'muzzle has translucent colored layers');
      const tail=fillAlphas(tracer.commands,colors[attribute]);assert.ok(Math.max(...tail)>Math.min(...tail),'tracer brightness changes along its tail');
      const agedTracer=r.after.effects.find(e=>e.role==='tracer'),agedImpact=r.after.effects.find(e=>e.role==='impact');
      assert.ok(agedTracer&&agedTracer.scaleX<tracer.scaleX,'tracer contracts toward the hit');
      assert.ok(agedTracer.alpha<tracer.alpha,'tracer fades');
      assert.ok(agedImpact.scaleX>r.before.effects.find(e=>e.role==='impact').scaleX,'impact ring expands');
      const sparks=r.after.effects.filter(e=>e.role==='impact-spark');assert.ok(sparks.length>=3);
      for(const spark of sparks){
        assert.equal(spark.attribute,'purple');assert.ok(spark.commands.includes(0xc58aff));
        const origin=r.before.effects.find(e=>e.role==='impact');
        const forward=(spark.x-origin.x)*Math.cos(tracer.rotation)+(spark.y-origin.y)*Math.sin(tracer.rotation);
        assert.ok(forward>0,'sparks scatter along the incoming shot');
      }
      assert.equal(r.unchanged,true,'effects never change combat state');
      results.push({mode,reverse,type,attribute,layers:true,taper:true,directionalSparks:true});
    }
    const varied=await p.evaluate(()=>{
      const f=window.combatFixture;f.pair('yuuka','hifumi');f.emit('attack');const a=f.inspect().effects.find(e=>e.role==='muzzle').commands;
      f.emit('attack');return {a,b:f.inspect().effects.filter(e=>e.role==='muzzle').at(-1).commands};
    });assert.notDeepEqual(varied.a,varied.b,'successive shots vary their flame shape');
    const coincident=await p.evaluate(()=>{
      const f=window.combatFixture;f.pair('yuuka','hifumi',{sourcePosition:{x:2,y:3},targetPosition:{x:2,y:3}});f.emit('attack');return f.inspect();
    });
    assert.equal(coincident.effects.some(e=>e.role==='muzzle'||e.role==='tracer'),false);
    assert.ok(coincident.effects.every(e=>Number.isFinite(e.x)&&Number.isFinite(e.y)&&Number.isFinite(e.rotation)));
    const load=await p.evaluate(()=>{
      const f=window.combatFixture;f.pair('yuuka','hifumi');for(let i=0;i<40;i++)f.emit('attack');
      const e=f.inspect().effects;return {total:e.length,damage:e.filter(e=>e.role==='damage').length};
    });assert.equal(load.damage,40,'particle limit preserves every damage number');assert.ok(load.total<=320,'secondary particles are bounded');
    await p.waitForTimeout(700);assert.equal((await p.evaluate(()=>window.combatFixture.inspect())).effects.length,0);
    const reduced=await p.evaluate(()=>{
      const f=window.combatFixture;f.pair('yuuka','hifumi');f.emit('attack');f.scene.reduced=true;f.scene.update(f.scene.time.now,16);f.emit('attack');return f.inspect();
    });assert.deepEqual(reduced.effects.map(e=>e.role),['impact']);assert.equal(reduced.targetTint,0xffffff);
    // A freeze at mid-effect makes screenshots useful for visual inspection.
    const captured=await p.evaluate(async()=>{
      const f=window.combatFixture;f.pair('yuuka','hifumi',{sourcePosition:{x:1,y:4},targetPosition:{x:4,y:2}});f.strike(100,30);
      await new Promise(r=>setTimeout(r,35));f.scene.scene.pause();return f.inspect();
    });assert.ok(captured.effects.some(e=>e.role==='tracer'),'preview captures the live tracer');
    await p.locator('#board').screenshot({path:`${shots}/${mode}-shot.png`});
    await ctx.close();
  }
  const demo=await browser.newContext({viewport:{width:600,height:780}}),page=await demo.newPage();
  page.on('pageerror',e=>errors.push(e.message));await page.goto(url+'/tests/combat-attributes.fixture.html');
  await page.waitForFunction(()=>window.combatFixture?.scene.sys.isActive());
  await page.evaluate(()=>{
    const stream=document.querySelector('#board canvas').captureStream(30),chunks=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};window.shotRecording={stream,chunks,recorder};recorder.start();
  });
  for(const kind of Object.values(attacks)){
    await page.evaluate(kind=>window.combatFixture.pair(kind,'hifumi',{sourcePosition:{x:1,y:4},targetPosition:{x:4,y:2}}),kind);
    await page.waitForTimeout(120);await page.evaluate(()=>window.combatFixture.strike(18,0));
    await page.waitForTimeout(280);await page.evaluate(()=>window.combatFixture.strike(18,0,82));await page.waitForTimeout(260);
  }
  await page.evaluate(()=>{const f=window.combatFixture;f.pair('yuuka','hifumi',{sourcePosition:{x:1,y:4},targetPosition:{x:4,y:2}});f.strike(100,30);});
  await page.waitForTimeout(650);
  const encoded=await page.evaluate(()=>new Promise(resolve=>{
    const {stream,chunks,recorder}=window.shotRecording;recorder.onstop=()=>{
      const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));stream.getTracks().forEach(t=>t.stop());
    };recorder.stop();
  }));fs.writeFileSync(`${shots}/gun-effects-preview.webm`,Buffer.from(encoded,'base64'));await demo.close();
  assert.deepEqual(errors,[]);
  fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version:require('../package.json').version,browser:browser.version(),results,reducedMotion:true,cleanup:true,particleLimit:true,errors},null,2));
  console.log('PASS: 32 gun-effect combinations; layered muzzle, tapered/fading tracer, directional particles, expanding ring, shape variation, load limit, reduced motion and cleanup');
}finally{await browser?.close();await vite?.close();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
