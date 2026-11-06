const {chromium,browserOptions}=require('./browser-runtime.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict');
const shots='docs/screenshots/barrier-health',url='http://127.0.0.1:2651';
const defenses={red:'ranger',yellow:'skirmisher',blue:'knight',purple:'mage'};
const colors={red:0xff667a,yellow:0xffd45c,blue:0x66baff,purple:0xc58aff};
const cases=[
  {name:'absorb',incoming:20,shield:80,broken:false,health:0},
  {name:'exact-break',incoming:20,shield:20,broken:true,health:0},
  {name:'overflow',incoming:50,shield:20,broken:true,health:30},
  {name:'renewed',incoming:20,shield:20,shieldAfter:200,broken:true,health:0},
];
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser,vite;try{
  const {createServer}=await import('vite');vite=await createServer({server:{host:'127.0.0.1',port:2651,strictPort:true}});await vite.listen();
  browser=await chromium.launch(browserOptions());const errors=[],results=[];
  for(const mode of ['pc','mobile']){
    const ctx=await browser.newContext({viewport:mode==='pc'?{width:600,height:780}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile'});
    const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto(url+'/tests/combat-attributes.fixture.html');await p.waitForFunction(()=>window.combatFixture?.scene.sys.isActive());
    for(const reverse of [false,true])for(const type of ['attack','skillDamage'])for(const [attribute,kind] of Object.entries(defenses))for(const c of cases){
      const r=await p.evaluate(({kind,reverse,type,c})=>{
        const f=window.combatFixture;f.pair('knight',kind,{reverse,targetShield:c.shield,sourcePosition:{x:1,y:4},targetPosition:{x:4,y:2}});
        const events=f.strike(c.incoming,c.shield,100,type,c.shieldAfter),first=f.inspect();
        const [a,b]=f.scene.snapshot.fighters.map(u=>f.scene.displayPosition(u));
        f.scene.update(f.scene.time.now,16);
        return {...first,events,angle:Math.atan2(a.y-b.y,a.x-b.x),count:f.inspect().effects.length,bar:f.unitVisuals()[1].healthBar};
      },{kind,reverse,type,c});
      const wave=r.effects.find(e=>e.role==='shield-hit');assert.ok(wave);assert.equal(wave.attribute,attribute);assert.ok(wave.commands.includes(colors[attribute]));
      assert.ok(Math.abs(Math.atan2(Math.sin(wave.rotation-r.angle),Math.cos(wave.rotation-r.angle)))<0.001,'barrier faces the incoming shot');
      const broken=r.effects.find(e=>e.role==='shield-break'),shards=r.effects.filter(e=>e.role==='shield-fragment');
      assert.equal(!!broken,c.broken);assert.equal(shards.length>0,c.broken);
      if(broken){assert.equal(broken.attribute,attribute);assert.ok(shards.every(e=>e.attribute===attribute&&e.commands.includes(colors[attribute])));}
      assert.equal(r.effects.some(e=>e.role==='impact'),c.health>0,'fully absorbed hits do not flash the body');
      assert.equal(r.effects.filter(e=>e.role==='shield-damage').length,1);assert.equal(r.effects.filter(e=>e.role==='damage').length,c.health>0?1:0);
      assert.equal(r.events.find(e=>e.type===type).shieldBroken,c.broken);assert.equal(r.count,r.effects.length,'same snapshot never repeats a break');
      assert.equal(r.bar.current,(100-c.health)/100);assert.equal(r.bar.trail,1);
      results.push({mode,reverse,type,attribute,scenario:c.name});
    }
    // Check the arc and fragments while actually animating, then freeze for QA.
    const animated=await p.evaluate(async()=>{
      const f=window.combatFixture;f.pair('knight','mage',{targetShield:20,sourcePosition:{x:1,y:4},targetPosition:{x:4,y:2}});f.strike(50,20);
      const first=f.inspect();await new Promise(r=>setTimeout(r,60));const later=f.inspect();f.scene.scene.pause();
      return {first,later,bar:f.unitVisuals()[1].healthBar};
    });
    assert.ok(animated.later.effects.find(e=>e.role==='shield-hit').scaleX>animated.first.effects.find(e=>e.role==='shield-hit').scaleX);
    const firstShard=animated.first.effects.find(e=>e.role==='shield-fragment'),lastShard=animated.later.effects.find(e=>e.role==='shield-fragment');
    assert.ok(Math.hypot(lastShard.x-firstShard.x,lastShard.y-firstShard.y)>1,'broken panels separate');
    await p.locator('#board').screenshot({path:`${shots}/${mode}-barrier-break.png`});
    const hp=await p.evaluate(()=>{
      const f=window.combatFixture,scene=f.scene,start=scene.time.now;f.pair('knight','mage');f.strike(40,0);
      const read=()=>({bar:f.unitVisuals()[1].healthBar,painted:scene.bars.commandBuffer.includes(0xffedc2)});
      const hit=read();scene.update(start+100,100);const hold=read();scene.update(start+350,250);const chasing=read();
      scene.update(start+1500,1150);const done=read();
      scene.snapshot.fighters[1].hp=90;scene.update(start+1510,10);const healed=read();
      return {hit,hold,chasing,done,healed};
    });
    assert.deepEqual(hp.hit.bar,{current:0.6,trail:1});assert.equal(hp.hit.painted,true);assert.equal(hp.hold.bar.trail,1);
    assert.ok(hp.chasing.bar.trail>0.6&&hp.chasing.bar.trail<1);assert.equal(hp.chasing.painted,true);
    assert.deepEqual(hp.done.bar,{current:0.6,trail:0.6});assert.equal(hp.done.painted,false);
    assert.deepEqual(hp.healed.bar,{current:0.9,trail:0.9});assert.equal(hp.healed.painted,false);
    const absorbed=await p.evaluate(()=>{const f=window.combatFixture;f.pair('knight','mage',{targetShield:80});f.strike(20,80);return {bar:f.unitVisuals()[1].healthBar,painted:f.scene.bars.commandBuffer.includes(0xffedc2)};});
    assert.deepEqual(absorbed.bar,{current:1,trail:1});assert.equal(absorbed.painted,false);
    const reduced=await p.evaluate(()=>{
      const f=window.combatFixture;f.pair('knight','mage',{reduced:true,targetShield:20});f.strike(50,20);
      return {effects:f.inspect().effects,bar:f.unitVisuals()[1].healthBar};
    });assert.deepEqual(reduced.bar,{current:0.7,trail:0.7});
    assert.deepEqual(reduced.effects.map(e=>e.role),['shield-hit','shield-break','impact']);assert.ok(reduced.effects.every(e=>e.scaleX===1&&e.scaleY===1));
    const dead=await p.evaluate(()=>{const f=window.combatFixture;f.pair('knight','mage');f.strike(200,20);return f.unitVisuals()[1].healthBar;});assert.equal(dead,undefined);
    await p.evaluate(()=>window.combatFixture.scene.scene.resume());await p.waitForTimeout(750);
    assert.equal((await p.evaluate(()=>window.combatFixture.inspect())).effects.length,0);
    const reset=await p.evaluate(()=>{
      const f=window.combatFixture;f.pair('knight','mage');f.strike(40,0);
      f.scene.snapshot.round++;f.scene.snapshot.events=[];f.scene.update(f.scene.time.now,16);
      return {effects:f.inspect().effects,bar:f.unitVisuals()[1].healthBar};
    });assert.equal(reset.effects.length,0);assert.deepEqual(reset.bar,{current:0.6,trail:0.6});
    await ctx.close();
  }
  const demo=await browser.newContext({viewport:{width:600,height:780}}),p=await demo.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url+'/tests/combat-attributes.fixture.html');await p.waitForFunction(()=>window.combatFixture?.scene.sys.isActive());
  await p.evaluate(()=>{
    const stream=document.querySelector('#board canvas').captureStream(30),chunks=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    window.barrierRecording={stream,chunks,recorder};recorder.start();
    window.combatFixture.pair('knight','mage',{targetShield:60,sourcePosition:{x:1,y:4},targetPosition:{x:4,y:2}});
  });
  await p.waitForTimeout(300);await p.evaluate(()=>window.combatFixture.strike(20,60));
  await p.waitForTimeout(450);await p.evaluate(()=>window.combatFixture.strike(70,40));
  await p.waitForTimeout(1050);await p.evaluate(()=>window.combatFixture.strike(20,0,70));await p.waitForTimeout(750);
  const encoded=await p.evaluate(()=>new Promise(resolve=>{
    const {stream,chunks,recorder}=window.barrierRecording;recorder.onstop=()=>{
      const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));stream.getTracks().forEach(t=>t.stop());
    };recorder.stop();
  }));fs.writeFileSync(`${shots}/barrier-health-preview.webm`,Buffer.from(encoded,'base64'));await demo.close();
  assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version:require('../package.json').version,browser:browser.version(),results,healthTrail:true,healing:true,reducedMotion:true,cleanup:true,errors},null,2));
  console.log('PASS: 128 barrier combinations; directional wave, exact/overflow break and replenishment, HP residue hold/decay/healing, reduced motion, death and reset');
}finally{await browser?.close();await vite?.close();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
