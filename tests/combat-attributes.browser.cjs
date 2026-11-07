const {chromium,browserOptions}=require('./browser-runtime.cjs');
const {debugClick,debugPreset}=require('./ui-helpers.cjs');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),assert=require('node:assert/strict');
const url='http://127.0.0.1:2648',fixtureUrl='http://127.0.0.1:2647';
const shots='docs/screenshots/combat-attributes';
const proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2648',DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
let output='';proc.stderr.on('data',d=>output+=d);
const palette={red:0xff667a,yellow:0xffd45c,blue:0x66baff,purple:0xc58aff};
const css={red:'#ff667a',yellow:'#ffd45c',blue:'#66baff',purple:'#c58aff'};
const attacks={red:'yuuka',yellow:'shiroko',blue:'hifumi',purple:'neru'};
const defenses={red:'shiroko',yellow:'neru',blue:'yuuka',purple:'hifumi'};
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser,vite;try{
  const {createServer}=await import('vite');
  vite=await createServer({server:{host:'127.0.0.1',port:2647,strictPort:true}});await vite.listen();
  let healthy=false;for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(healthy,output);
  browser=await chromium.launch(browserOptions());const errors=[],results=[],damageResults=[];
  const p=await browser.newPage({viewport:{width:600,height:780}});p.on('pageerror',e=>errors.push(e.message));
  await p.goto(fixtureUrl+'/tests/combat-attributes.fixture.html');
  await p.waitForFunction(()=>window.combatFixture?.scene.sys.isActive());
  for(const reverse of [false,true])for(const type of ['attack','skillDamage']){
    for(const attack of Object.keys(attacks))for(const defense of Object.keys(defenses)){
      const result=await p.evaluate(({source,target,reverse,type})=>{
        const f=window.combatFixture;f.pair(source,target,{reverse});f.emit(type);
        const first=f.inspect();f.scene.update(f.scene.time.now,16);
        return {...first,afterRepeat:f.inspect().effects.length};
      },{source:attacks[attack],target:defenses[defense],reverse,type});
      for(const role of ['muzzle','tracer']){
        const effect=result.effects.find(e=>e.role===role);assert.ok(effect,{attack,defense,role});
        assert.equal(effect.attribute,attack);assert.ok(effect.commands.includes(palette[attack]),'actual attack draw color');
      }
      const impact=result.effects.find(e=>e.role==='impact'),damage=result.effects.find(e=>e.role==='damage');
      assert.equal(impact.attribute,defense);assert.ok(impact.commands.includes(palette[defense]),'actual defense draw color');
      assert.equal(damage.color,css[attack]);assert.equal(damage.attribute,attack);assert.equal(result.targetTint,palette[defense]);
      assert.equal(result.afterRepeat,result.effects.length,'snapshot event is not replayed');
      results.push({attack,defense,type,reverse});
    }
  }
  for(const [attribute,source] of Object.entries(attacks)){
    const r=await p.evaluate(source=>{const f=window.combatFixture;f.pair(source,'hifumi');f.emit('skillStart');return f.inspect();},source);
    assert.equal(r.effects.find(e=>e.role==='cast').attribute,attribute);
    assert.equal(r.effects.find(e=>e.role==='skill-label').color,css[attribute]);
  }
  for(const [attribute,target] of Object.entries(defenses)){
    const r=await p.evaluate(target=>{const f=window.combatFixture;f.pair('yuuka',target);f.emit('shield');return f.inspect();},target);
    assert.equal(r.effects.find(e=>e.role==='shield').attribute,attribute);
    assert.ok(r.effects.find(e=>e.role==='shield').commands.includes(palette[attribute]));
  }
  const damageCases=[
    {name:'health',incoming:40,shield:0,hp:100,blue:0,health:40},
    {name:'absorbed',incoming:40,shield:70,hp:100,blue:40,health:0},
    {name:'exact-break',incoming:40,shield:40,hp:100,blue:40,health:0},
    {name:'overflow',incoming:100,shield:30,hp:100,blue:30,health:70},
    {name:'lethal-overflow',incoming:100,shield:30,hp:10,blue:30,health:70},
    {name:'later-shield',incoming:40,shield:0,hp:100,shieldAfter:200,blue:0,health:40},
    {name:'critical-health',incoming:40,shield:0,hp:100,blue:0,health:60,critical:true},
    {name:'critical-absorbed',incoming:40,shield:70,hp:100,blue:60,health:0,critical:true},
    {name:'critical-overflow',incoming:40,shield:30,hp:100,blue:30,health:30,critical:true},
  ];
  for(const width of [600,390]){
    await p.setViewportSize({width,height:780});
    for(const type of ['attack','skillDamage'])for(const attack of Object.keys(attacks))for(const c of damageCases){
      const r=await p.evaluate(({source,type,c})=>{
        const f=window.combatFixture;f.pair(source,'hifumi');
        const events=f.strike(c.incoming,c.shield,c.hp,type,c.shieldAfter,c.critical);
        const first=f.inspect();f.scene.update(f.scene.time.now,16);
        return {...first,events,afterRepeat:f.inspect().effects.length};
      },{source:attacks[attack],type,c});
      const blue=r.effects.filter(e=>e.role==='shield-damage'),health=r.effects.filter(e=>e.role==='damage');
      assert.equal(blue.length,c.blue>0?1:0,c.name);assert.equal(health.length,c.health>0?1:0,c.name);
      if(c.blue){assert.equal(blue[0].color,'#b8eaff');assert.equal(blue[0].text,`−${c.blue}${c.critical?'!':''}`);}
      if(c.health){assert.equal(health[0].color,css[attack]);assert.equal(health[0].attribute,attack);assert.equal(health[0].text,`−${c.health}${c.critical?'!':''}`);}
      if(c.blue&&c.health)assert.ok(Math.abs(blue[0].y-health[0].y)>=(blue[0].height+health[0].height)/2,'split numbers do not overlap');
      assert.equal(r.effects.filter(e=>e.role==='damage'||e.role==='shield-damage').length,(c.blue>0?1:0)+(c.health>0?1:0));
      assert.equal(r.afterRepeat,r.effects.length,'no duplicated split numbers');
      const event=r.events.find(e=>e.type===type);assert.equal(event.shieldDamage,c.blue);assert.equal(event.healthDamage,c.health);
      assert.equal(event.critical,!!c.critical);
      damageResults.push({width,type,attack,scenario:c.name});
    }
  }
  await p.setViewportSize({width:600,height:780});
  await p.evaluate(()=>{const f=window.combatFixture;f.pair('yuuka','hifumi');f.strike(100,30);f.scene.scene.pause();});
  await p.waitForTimeout(40);await p.screenshot({path:`${shots}/barrier-overflow.png`});
  await p.evaluate(()=>window.combatFixture.scene.scene.resume());
  await p.evaluate(()=>{const f=window.combatFixture;f.pair('yuuka','hifumi');f.strike(40,30,100,'attack',undefined,true);f.scene.scene.pause();});
  await p.waitForTimeout(40);await p.screenshot({path:`${shots}/critical-overflow.png`});
  await p.evaluate(()=>window.combatFixture.scene.scene.resume());
  const lethal=await p.evaluate(()=>{const f=window.combatFixture;f.pair('yuuka','hifumi',{lethal:true});f.emit('attack');return f.inspect();});
  assert.equal(lethal.effects.find(e=>e.role==='impact').attribute,'purple');
  assert.equal(lethal.targetTint,undefined,'lethal target has no live sprite');
  assert.ok(lethal.effects.every(e=>Number.isFinite(e.x)&&Number.isFinite(e.y)));
  const reduced=await p.evaluate(()=>{const f=window.combatFixture;f.pair('yuuka','hifumi');f.emit('attack');f.scene.reduced=true;f.scene.update(f.scene.time.now,16);const cleared=f.inspect();f.emit('attack');return {cleared,current:f.inspect()};});
  assert.equal(reduced.cleared.effects.length,0);assert.equal(reduced.cleared.targetTint,0xffffff);
  assert.deepEqual(reduced.current.effects.map(e=>e.role),['impact']);assert.equal(reduced.current.effects[0].attribute,'purple');
  const reset=await p.evaluate(()=>{const f=window.combatFixture;f.pair('yuuka','hifumi');f.emit('attack');f.scene.resetVisuals();return f.inspect();});
  assert.equal(reset.effects.length,0);
  await p.evaluate(()=>{const f=window.combatFixture;f.pair('yuuka','hifumi');f.emit('skillStart');f.emit('shield');f.emit('attack');});
  await p.waitForTimeout(1150);assert.equal((await p.evaluate(()=>window.combatFixture.inspect())).effects.length,0,'all effects expire');
  await p.evaluate(()=>{const f=window.combatFixture;f.pair('yuuka','hifumi');f.emit('attack');f.scene.scene.pause();});
  await p.waitForTimeout(50);await p.screenshot({path:`${shots}/red-attack-purple-defense.png`});
  await p.close();
  for(const mode of ['pc','mobile']){
    const ctx=await browser.newContext({viewport:mode==='pc'?{width:1400,height:1000}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile',userAgent:mode==='pc'?'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36':'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36'});
    const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await page.locator('#practice').click();await page.locator('#game-view').waitFor({state:'visible'});
    await debugClick(page,'debug-pause');await debugPreset(page,'early');
    const cell=page.locator('#cells button[aria-label*="아군 칸, 루멘,"]').first();
    if(mode==='mobile')await cell.tap();else await cell.click();
    if(mode==='mobile')await page.locator('#unit-dialog').waitFor({state:'visible'});
    const panel=page.locator(mode==='mobile'?'#unit-detail':'#selected-unit-content');
    await panel.locator('[data-attribute-role="attack"]').waitFor();
    assert.equal(await panel.locator('[data-attribute-role="attack"]').textContent(),'공격 · 빨강');
    assert.equal(await panel.locator('[data-attribute-role="defense"]').textContent(),'방어 · 파랑');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await panel.locator('.combat-attributes').scrollIntoViewIfNeeded();
    const visible=await panel.locator('.combat-attributes').evaluate(e=>{
      const r=e.getBoundingClientRect(),dock=document.querySelector('#pc-play-dock').getBoundingClientRect();
      return r.top>=0&&r.bottom<=(e.closest('dialog[open]')?innerHeight:Math.min(innerHeight,dock.top));
    });assert.equal(visible,true,'attribute names can be read above the fixed shop');
    for(const role of ['attack','defense'])assert.equal(await panel.locator(`[data-attribute-role="${role}"]`).evaluate(e=>{
      const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
    }),true,'attribute name is not covered by fixed controls');
    await page.screenshot({path:`${shots}/${mode}-attributes.png`,fullPage:mode==='pc'});
    await ctx.close();
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version:require('../package.json').version,browser:browser.version(),results,damageResults,errors,lethal:true,reducedMotion:true,cleanup:true,inspection:['pc','mobile']},null,2));
  console.log('PASS: 64 attribute cases; 144 damage splits including critical hits (4 attack colors, attack/skill, desktop/mobile widths); cast, shield, lethal hit, reduced motion, cleanup, PC/mobile inspection');
}finally{await browser?.close();await vite?.close();proc.kill('SIGTERM');}})().catch(e=>{console.error(output,e.stack||e);process.exitCode=1;});
