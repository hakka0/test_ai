const {chromium,browserOptions}=require('./browser-runtime.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict');
const url='http://127.0.0.1:2653',shots='docs/screenshots/square-units';
fs.mkdirSync(shots,{recursive:true});
(async()=>{let browser,vite;try{
  const {createServer}=await import('vite');
  vite=await createServer({server:{host:'127.0.0.1',port:2653,strictPort:true}});await vite.listen();
  browser=await chromium.launch(browserOptions());const errors=[],results=[];
  for(const mode of ['pc','mobile']){
    const ctx=await browser.newContext({viewport:mode==='pc'?{width:600,height:780}:{width:390,height:844},isMobile:mode==='mobile',hasTouch:mode==='mobile'});
    const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto(url+'/tests/combat-attributes.fixture.html');await p.waitForFunction(()=>window.combatFixture?.scene.sys.isActive());
    await p.evaluate(()=>{
      const s=window.combatFixture.scene;s.scene.pause();
      for(const [key,w,h] of [['square-500',500,500],['wide-1000',1000,500]]){
        const t=s.textures.createCanvas(key,w,h),g=t.context;
        g.fillStyle='#7ddbd1';g.fillRect(0,0,w,h);g.strokeStyle='#ffffff';g.lineWidth=12;g.strokeRect(6,6,w-12,h-12);
        g.fillStyle='#203c51';g.beginPath();g.arc(w/2,h/2,h*.25,0,Math.PI*2);g.fill();t.refresh();
      }
    });
    for(const reverse of [false,true])for(const texture of ['square-500','yuuka','wide-1000']){
      const r=await p.evaluate(({reverse,texture})=>{
        const f=window.combatFixture,s=f.scene;f.pair('yuuka','hifumi',{reverse,reduced:true,sourcePosition:{x:7,y:4},targetPosition:{x:0,y:2}});
        const source=s.snapshot.fighters[0],sprite=s.sprites.get(source.id);sprite.setTexture(texture);s.update(s.time.now,16);
        const first=f.unitVisuals()[0],point=s.displayPosition(source),before=JSON.stringify(s.snapshot);
        s.reduced=false;for(let i=1;i<=60;i++)s.update(s.time.now+i*16,16);
        const breathing=f.unitVisuals()[0];
        const foot=breathing.y+breathing.displayHeight/2;
        s.reduced=true;s.update(s.time.now+1100,140);const reduced=f.unitVisuals()[0];
        const frame=document.querySelector('#board canvas').getBoundingClientRect();
        return {first,breathing,reduced,foot,hit:s.unitAt(point.x,point.y)?.id,unchanged:before===JSON.stringify(s.snapshot),frame:{width:frame.width,height:frame.height}};
      },{reverse,texture});
      const u=r.first;
      assert.ok(Math.abs(u.displayWidth/u.displayHeight-u.imageWidth/u.imageHeight)<1e-10,'original image proportions are preserved');
      assert.equal(Math.max(u.displayWidth,u.displayHeight),81,'art fits the square image slot');
      if(texture==='square-500'){assert.equal(u.imageWidth,500);assert.equal(u.imageHeight,500);assert.equal(u.displayWidth,u.displayHeight);}
      assert.equal(r.hit,u.id);assert.equal(r.unchanged,true);assert.ok(Math.abs(r.frame.width-r.frame.height)<1);
      assert.ok(Math.abs(r.foot-(u.anchor.y-4+u.displayHeight/2))<1e-8,'breathing keeps fitted feet planted');
      assert.equal(r.reduced.nameX,r.reduced.anchor.x);assert.equal(r.reduced.nameY,r.reduced.anchor.y+34);
      assert.deepEqual([r.reduced.pose.x,r.reduced.pose.y,r.reduced.pose.scaleX,r.reduced.pose.scaleY],[0,0,1,1]);
      results.push({mode,reverse,texture,displayWidth:u.displayWidth,displayHeight:u.displayHeight});
    }
    await p.evaluate(()=>{
      const f=window.combatFixture,s=f.scene;f.pair('yuuka','hifumi',{reduced:true,sourcePosition:{x:1,y:5},targetPosition:{x:6,y:2}});
      for(const unit of s.snapshot.fighters)s.sprites.get(unit.id).setTexture('square-500');s.update(s.time.now,16);
    });await p.waitForTimeout(40);await p.locator('#board').screenshot({path:`${shots}/${mode}-500-square.png`});
    await ctx.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(`${shots}/results.json`,JSON.stringify({version:require('../package.json').version,browser:browser.version(),results,errors},null,2));
  console.log('PASS: 12 image-fit combinations; 500x500 squares, legacy portraits and landscape images, both viewpoints, anchored names/feet and square canvas');
}finally{await browser?.close();await vite?.close();}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
