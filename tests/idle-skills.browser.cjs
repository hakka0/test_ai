const {chromium,browserOptions}=require('./browser-runtime.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict');
const shots='docs/screenshots/idle-skills',url='http://127.0.0.1:2652';
const attacks={red:'yuuka',yellow:'shiroko',blue:'hifumi',purple:'neru'};
const colors={red:0xff667a,yellow:0xffd45c,blue:0x66baff,purple:0xc58aff};
const cases=[{id:'nova',effect:'skillDamage'},{id:'ironWard',effect:'shield'},{id:'starlightHeal',effect:'heal'}];
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser,vite;try{
  const {createServer}=await import('vite');
  vite=await createServer({server:{host:'127.0.0.1',port:2652,strictPort:true}});await vite.listen();
  browser=await chromium.launch(browserOptions());const errors=[],results=[];
  for(const mode of ['pc','mobile']){
    const ctx=await browser.newContext({viewport:mode==='pc'?{width:600,height:780}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile'});
    const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto(url+'/tests/combat-attributes.fixture.html');await p.waitForFunction(()=>window.combatFixture?.scene.sys.isActive());
    await p.evaluate(()=>window.combatFixture.scene.scene.pause());
    for(const reverse of [false,true])for(const [attribute,kind] of Object.entries(attacks))for(const c of cases){
      const r=await p.evaluate(({reverse,kind,c})=>{
        const f=window.combatFixture,s=f.scene,start=s.time.now;
        f.pair(kind,'hifumi',{reverse,sourcePosition:{x:1,y:4},targetPosition:{x:4,y:2}});
        const snapshot=JSON.stringify(s.snapshot);
        for(let i=1;i<=50;i++)s.update(start+i*16,16);
        const idle=f.unitVisuals();s.update(start+1100,300);const breathed=f.unitVisuals();
        const unchanged=snapshot===JSON.stringify(s.snapshot);
        f.emit('skillStart',c.id);s.update(start+65,65);
        const cast=f.inspect(),braced=f.unitVisuals();
        const amount=c.effect==='heal'?20:12;
        f.emit(c.effect,c.id,amount);const delivered=f.inspect();
        const count=delivered.effects.length;s.update(start+65,0);
        return {idle,breathed,unchanged,cast,braced,delivered,count,repeated:f.inspect().effects.length};
      },{reverse,kind,c});
      assert.equal(r.unchanged,true,'idle leaves the authoritative snapshot unchanged');
      assert.ok(r.idle.some((u,i)=>Math.abs(u.pose.scaleY-r.breathed[i].pose.scaleY)>0.0001),'units breathe over time');
      for(const u of r.idle){
        assert.ok(Math.abs(u.pose.scaleY-1)<0.009);assert.ok(Math.abs(u.angle)<=0.35);
        assert.equal(u.nameX,u.anchor.x);assert.equal(u.nameY,u.anchor.y+34);
      }
      const cast=r.cast.effects.find(e=>e.role==='cast');assert.equal(cast.attribute,attribute);assert.ok(cast.commands.includes(colors[attribute]));
      assert.ok(r.cast.effects.some(e=>e.role==='cast-focus'));
      assert.ok(r.braced[0].pose.scaleY<0.97,'cast has a brief braced pose');
      assert.equal(r.braced[0].pose.flipX,reverse);
      const role=c.effect==='skillDamage'?'impact':c.effect;
      const received=r.delivered.effects.find(e=>e.role===role);assert.ok(received);assert.equal(received.attribute,'purple');
      assert.ok(received.commands.includes(colors.purple),'received skill effects use defense color');
      if(c.effect==='skillDamage')assert.equal(r.delivered.effects.find(e=>e.role==='damage').attribute,attribute);
      else assert.equal(r.delivered.effects.some(e=>e.role==='damage'),false,'support effects create no damage number');
      assert.equal(r.repeated,r.count,'same snapshot does not replay skill effects');
      results.push({mode,reverse,attribute,skill:c.id});
    }
    const stages=await p.evaluate(()=>{
      const f=window.combatFixture,s=f.scene,start=s.time.now;
      f.pair('natsu','hifumi');f.skill('guardian',50);const low=f.unitVisuals()[0].skillIndicator;
      f.skill('guardian',80);const ready=f.unitVisuals()[0].skillIndicator;
      const before=JSON.stringify(s.snapshot);s.update(start+500,500);const waited=f.unitVisuals()[0].skillIndicator;
      const unchanged=before===JSON.stringify(s.snapshot);
      f.skill('guardian',75,true);f.emit('skillStart','guardian');const active=f.unitVisuals()[0].skillIndicator;
      s.update(start+900,400);const rotated=f.unitVisuals()[0].skillIndicator;
      const painted=s.bars.commandBuffer.includes(0xffd45c);
      f.skill('guardian',0,false);f.emit('skillEnd','guardian');const ended={indicator:f.unitVisuals()[0].skillIndicator,effects:f.inspect().effects};
      f.emit('skillStart','guardian');f.emit('skillStart','guardian');const labels=f.inspect().effects.filter(e=>e.role==='skill-label');
      s.snapshot.fighters[0].hp=0;s.update(start+1000,100);const dead=f.unitVisuals()[0];
      return {low,ready,waited,unchanged,active,rotated,painted,ended,labels,dead};
    });
    assert.equal(stages.low.visible,false);assert.equal(stages.ready.charge,0.8);assert.equal(stages.ready.active,false);
    assert.equal(stages.waited.active,false);assert.equal(stages.unchanged,true,'readiness does not trigger a skill');
    assert.equal(stages.active.active,true);assert.notEqual(stages.active.rotation,stages.rotated.rotation);assert.equal(stages.painted,true);
    assert.equal(stages.ended.indicator.visible,false);assert.equal(stages.ended.effects.find(e=>e.role==='skill-end').attribute,'yellow');
    assert.equal(stages.labels.length,1,'repeated activations replace the caster label');assert.equal(stages.dead.skillIndicator,undefined);
    const reduced=await p.evaluate(()=>{
      const f=window.combatFixture,s=f.scene,start=s.time.now;
      f.pair('natsu','hifumi',{reduced:true});f.skill('guardian',50,true);
      f.emit('skillStart','guardian');f.emit('heal','starlightHeal');f.emit('shield','ironWard');f.emit('skillEnd','guardian');
      const before=f.unitVisuals()[0];s.update(start+500,500);
      return {before,after:f.unitVisuals()[0],effects:f.inspect().effects};
    });
    assert.deepEqual(reduced.before.skillIndicator,reduced.after.skillIndicator);
    assert.deepEqual([reduced.after.pose.x,reduced.after.pose.y,reduced.after.pose.angle,reduced.after.pose.scaleX,reduced.after.pose.scaleY],[0,0,0,1,1]);
    assert.equal(reduced.effects.some(e=>e.role==='cast-focus'),false);
    assert.ok(reduced.effects.every(e=>e.scaleX===1&&e.scaleY===1),'reduced skill effects stay static');
    const transition=await p.evaluate(()=>{
      const f=window.combatFixture,s=f.scene;
      f.pair('hifumi','yuuka');f.emit('skillStart');s.update(s.time.now+65,65);
      s.reduced=true;s.update(s.time.now+80,15);return {effects:f.inspect().effects,pose:f.unitVisuals()[0].pose};
    });assert.equal(transition.effects.length,0);assert.equal(transition.pose.scaleY,1);
    await p.evaluate(()=>window.combatFixture.scene.scene.resume());
    const animation=await p.evaluate(async()=>{
      const f=window.combatFixture;f.pair('koharu','hifumi',{sourcePosition:{x:1,y:4},targetPosition:{x:4,y:2}});
      f.emit('skillStart','starlightHeal');f.emit('heal','starlightHeal');
      const before=f.inspect();await new Promise(r=>setTimeout(r,70));const after=f.inspect();f.scene.scene.pause();return {before,after};
    });
    assert.ok(animation.after.effects.find(e=>e.role==='cast').scaleX>animation.before.effects.find(e=>e.role==='cast').scaleX);
    assert.ok(animation.after.effects.find(e=>e.role==='cast-focus').scaleX<animation.before.effects.find(e=>e.role==='cast-focus').scaleX);
    assert.ok(animation.after.effects.find(e=>e.role==='heal').y<animation.before.effects.find(e=>e.role==='heal').y);
    await p.locator('#board').screenshot({path:`${shots}/${mode}-heal.png`});
    await p.evaluate(()=>{
      const f=window.combatFixture;f.pair('natsu','hifumi',{sourcePosition:{x:1,y:4},targetPosition:{x:4,y:2}});
      f.skill('guardian',60,true);f.emit('skillStart','guardian');f.emit('shield','ironWard');
    });await p.waitForTimeout(40);await p.locator('#board').screenshot({path:`${shots}/${mode}-active.png`});
    await p.evaluate(()=>window.combatFixture.scene.scene.resume());await p.waitForTimeout(1100);
    assert.equal((await p.evaluate(()=>window.combatFixture.inspect())).effects.length,0,'all transient skill effects expire');
    const reset=await p.evaluate(()=>{
      const f=window.combatFixture;f.emit('skillStart','guardian');f.scene.snapshot.round++;f.scene.snapshot.events=[];f.scene.snapshot.fighters[0].skills=[];
      f.scene.update(f.scene.time.now,16);return {effects:f.inspect().effects,indicator:f.unitVisuals()[0].skillIndicator};
    });assert.equal(reset.effects.length,0);assert.equal(reset.indicator.visible,false);
    await ctx.close();
  }
  const demo=await browser.newContext({viewport:{width:600,height:780}}),p=await demo.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url+'/tests/combat-attributes.fixture.html');await p.waitForFunction(()=>window.combatFixture?.scene.sys.isActive());
  await p.evaluate(()=>{
    const stream=document.querySelector('#board canvas').captureStream(30),chunks=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    window.skillRecording={stream,chunks,recorder};recorder.start();
    window.combatFixture.pair('natsu','hifumi',{sourcePosition:{x:1,y:4},targetPosition:{x:4,y:2}});
  });
  await p.waitForTimeout(750);await p.evaluate(()=>window.combatFixture.skill('guardian',80));
  await p.waitForTimeout(550);await p.evaluate(()=>{const f=window.combatFixture;f.skill('guardian',75,true);f.emit('skillStart','guardian');});
  await p.waitForTimeout(650);await p.evaluate(()=>window.combatFixture.emit('skillDamage','nova'));
  await p.waitForTimeout(500);await p.evaluate(()=>window.combatFixture.emit('heal','starlightHeal'));
  await p.waitForTimeout(650);await p.evaluate(()=>window.combatFixture.emit('shield','ironWard'));
  await p.waitForTimeout(650);await p.evaluate(()=>{const f=window.combatFixture;f.skill('guardian',0,false);f.emit('skillEnd','guardian');});
  await p.waitForTimeout(600);
  const encoded=await p.evaluate(()=>new Promise(resolve=>{
    const {stream,chunks,recorder}=window.skillRecording;recorder.onstop=()=>{
      const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));stream.getTracks().forEach(t=>t.stop());
    };recorder.stop();
  }));fs.writeFileSync(`${shots}/idle-skills-preview.webm`,Buffer.from(encoded,'base64'));await demo.close();
  assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version:require('../package.json').version,browser:browser.version(),results,idle:true,readiness:true,sustain:true,end:true,healing:true,labelReplacement:true,reducedMotion:true,cleanup:true,errors},null,2));
  console.log('PASS: 48 skill combinations; idle, charge/activation/sustain/end, support and attack colors, label replacement, reduced motion, death and reset');
}finally{await browser?.close();await vite?.close();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
