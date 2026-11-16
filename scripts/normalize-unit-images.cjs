// Deterministic asset preparation: trim transparent pixels, contain in 128×128,
// center, and use nearest-neighbor sampling to retain the original pixel art.
const {readFile,writeFile,readdir,mkdir}=require('node:fs/promises');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {resolve,join}=require('node:path');
const assert=require('node:assert/strict');
const {chromium,browserOptions}=require('../tests/browser-runtime.cjs');
const {measureUnitFrame}=require('../client/unit-appearance.ts');
const root=resolve(__dirname,'..'),assets=join(root,'public/units/blue-archive');
const reportDir=join(root,'test-results/unit-image-trim');
const args=process.argv.slice(2),check=args.includes('--check');
const sourceRef=args.includes('--source-ref')?args[args.indexOf('--source-ref')+1]:null;
if(!sourceRef)throw new Error('Pass --source-ref <original git revision> to avoid resampling already normalized artwork.');
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
async function source(name){
 return execFileSync('git',['show',`${sourceRef}:public/units/blue-archive/${name}`],{cwd:root});
}
(async()=>{let browser;try{
 const names=(await readdir(join(assets,'icons'))).filter(n=>n.endsWith('.png')).sort();
 const inputs=await Promise.all(names.map(async name=>({name,icon:await source(`icons/${name}`),sheet:await source(name)})));
 browser=await chromium.launch(browserOptions());const page=await browser.newPage();
 const images=inputs.map(u=>({name:u.name,icon:`data:image/png;base64,${u.icon.toString('base64')}`,sheet:`data:image/png;base64,${u.sheet.toString('base64')}`}));
 // Reuse the game's foreground measurement, which retains detached halos and
 // weapons while excluding tiny export specks outside the character.
 const samples=await page.evaluate(async images=>{
  const results=[];
  for(const unit of images){
   const frames=[];
   for(const [url,count] of [[unit.icon,1],[unit.sheet,6]]){
    const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url;});
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d',{willReadFrequently:true});
    for(let frame=0;frame<count;frame++){
     ctx.clearRect(0,0,128,128);ctx.drawImage(image,count===1?0:(frame%3)*128,count===1?0:Math.floor(frame/3)*128,128,128,0,0,128,128);
     const pixels=ctx.getImageData(0,0,128,128).data;
     let binary='';for(let i=0;i<pixels.length;i+=8192)binary+=String.fromCharCode(...pixels.subarray(i,i+8192));
     frames.push(btoa(binary));
    }
   }
   results.push(frames);
  }
  return results;
 },images);
 for(let i=0;i<images.length;i++)images[i].bounds=samples[i].map(pixels=>{
  const bounds=measureUnitFrame(new Uint8ClampedArray(Buffer.from(pixels,'base64')),128,128);
  assert.ok(bounds,images[i].name+' must have visible artwork');
  return{left:bounds.left,top:bounds.top,right:bounds.right,bottom:bounds.bottom,width:bounds.right-bounds.left,height:bounds.bottom-bounds.top};
 });
 const output=await page.evaluate(async inputs=>{
  const size=128,make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  const decode=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('PNG decode failed'));im.src=src;});
  function bounds(data,w,h){
   let left=w,top=h,right=0,bottom=0;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]){
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
   }
   if(right<=left||bottom<=top)throw new Error('Empty unit frame');
   return{left,top,right,bottom,width:right-left,height:bottom-top};
  }
  function normalize(image,sx,sy,before){
   const frame=make(size,size),ctx=frame.getContext('2d',{willReadFrequently:true});
   ctx.drawImage(image,sx,sy,size,size,0,0,size,size);
   const pixels=ctx.getImageData(0,0,size,size).data,sourceBounds=bounds(pixels,size,size);
   const scale=size/Math.max(before.width,before.height);
   const width=Math.round(before.width*scale),height=Math.round(before.height*scale);
   const left=Math.floor((size-width)/2),top=Math.floor((size-height)/2);
   const normalized=make(size,size),out=normalized.getContext('2d',{willReadFrequently:true});
   out.imageSmoothingEnabled=false;
   out.drawImage(frame,before.left,before.top,before.width,before.height,left,top,width,height);
   const result=out.getImageData(0,0,size,size).data,after=bounds(result,size,size);
   // No new colors, edge smoothing or opaque background may be introduced.
   const colors=new Set();
   for(let i=0;i<pixels.length;i+=4)if(pixels[i+3])colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]},${pixels[i+3]}`);
   for(let i=0;i<result.length;i+=4)if(result[i+3]&&!colors.has(`${result[i]},${result[i+1]},${result[i+2]},${result[i+3]}`))throw new Error('Pixel palette changed');
   if(Math.max(after.width,after.height)!==size||Math.abs(after.left-(size-after.right))>1||Math.abs(after.top-(size-after.bottom))>1)throw new Error('Frame does not fill and center');
   return{canvas:normalized,sourceBounds,before,after,scale};
  }
  const results=[],originals=[];
  for(const unit of inputs){
   const icon=await decode(unit.icon),sheet=await decode(unit.sheet);
   if(icon.width!==size||icon.height!==size||sheet.width!==3*size||sheet.height!==2*size)throw new Error(`Unexpected dimensions: ${unit.name}`);
   const portrait=normalize(icon,0,0,unit.bounds[0]),atlas=make(3*size,2*size),ctx=atlas.getContext('2d'),frames=[];
   for(let frame=0;frame<6;frame++){
    const r=normalize(sheet,(frame%3)*size,Math.floor(frame/3)*size,unit.bounds[frame+1]);
    ctx.drawImage(r.canvas,(frame%3)*size,Math.floor(frame/3)*size);
    frames.push({frame,sourceBounds:r.sourceBounds,before:r.before,after:r.after,scale:r.scale});
    if(frame===1&&r.canvas.toDataURL()!==portrait.canvas.toDataURL())throw new Error(`Portrait/front frame mismatch: ${unit.name}`);
   }
   originals.push(icon);
   results.push({kind:unit.name.slice(0,-4),icon:portrait.canvas.toDataURL(),sheet:atlas.toDataURL(),portrait:{sourceBounds:portrait.sourceBounds,before:portrait.before,after:portrait.after,scale:portrait.scale},frames});
  }
  // A review sheet is separate from the transparent game assets.
  const preview=make(4*280,60+Math.ceil(results.length/4)*168),p=preview.getContext('2d');
  p.fillStyle='#e8f0f8';p.fillRect(0,0,preview.width,preview.height);p.fillStyle='#0f2a55';p.font='bold 21px sans-serif';
  p.fillText('128×128 · original ratio · before / after',16,35);
  for(let i=0;i<results.length;i++){
   const x=(i%4)*280+8,y=60+Math.floor(i/4)*168;
   p.font='bold 14px sans-serif';p.fillStyle='#0f2a55';p.fillText(results[i].kind,x,y+17);
   for(let n=0;n<2;n++){
    const dx=x+n*136,dy=y+26;
    for(let yy=0;yy<size;yy+=8)for(let xx=0;xx<size;xx+=8){p.fillStyle=(xx/8+yy/8)%2?'#d8e2ef':'#f7faff';p.fillRect(dx+xx,dy+yy,8,8);}
    p.drawImage(n?await decode(results[i].icon):originals[i],dx,dy);
   }
  }
  return{units:results,preview:preview.toDataURL()};
 },images);
 const records=[];
 for(const [i,unit] of output.units.entries()){
  const icon=Buffer.from(unit.icon.split(',')[1],'base64'),sheet=Buffer.from(unit.sheet.split(',')[1],'base64');
  if(check){assert.ok((await readFile(join(assets,'icons',inputs[i].name))).equals(icon),unit.kind+' portrait differs');assert.ok((await readFile(join(assets,inputs[i].name))).equals(sheet),unit.kind+' sheet differs');}
  else{await writeFile(join(assets,'icons',inputs[i].name),icon);await writeFile(join(assets,inputs[i].name),sheet);}
  records.push({kind:unit.kind,portrait:unit.portrait,frames:unit.frames,sourceSHA256:{icon:sha(inputs[i].icon),sheet:sha(inputs[i].sheet)},outputSHA256:{icon:sha(icon),sheet:sha(sheet)}});
 }
 if(!check){
  await mkdir(reportDir,{recursive:true});
  await writeFile(join(reportDir,'before-after.png'),Buffer.from(output.preview.split(',')[1],'base64'));
  await writeFile(join(reportDir,'normalization.json'),JSON.stringify({sourceRef,frameSize:128,fit:'contain',alignment:'center',sampling:'nearest',transparent:true,units:records},null,2));
 }
 console.log(`${check?'Verified':'Normalized'} ${records.length} portraits and ${records.length*6} sprite frames: 128×128, centered, original ratio and pixel palette preserved.`);
}finally{await browser?.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1});
