import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {UNITS} from '../public/js/data.js';
import {portraitURL,getImportedSprite,UNIT_FRAME_SIZE,UNIT_SOURCE_FRAME_SIZE} from '../public/js/sprites.js';

const root=new URL('../public/units/toon-pixel-test-20261117/',import.meta.url);
const report=JSON.parse(await readFile(new URL('archive-source.json',root),'utf8'));
for(const file of report.files){
 const data=await readFile(new URL(file.file,root));
 assert.equal(createHash('sha256').update(data).digest('hex'),file.sha256,file.file);
 assert.deepEqual([data.readUInt32BE(16),data.readUInt32BE(20)],[file.width,file.height]);
}
assert.equal(report.files.length,42);
assert.equal(UNIT_FRAME_SIZE,128,'PC display size stays 128 CSS pixels');
assert.equal(UNIT_SOURCE_FRAME_SIZE,256,'ZIP sources use 256px frames');

// Exercise the actual crop selection using real PNG headers and a canvas spy.
const pendingDecodes=[];
globalThis.Image=class {
 set src(value){this.url=value;}
 decode(){const pending=readFile(fileURLToPath(this.url)).then(data=>{this.naturalWidth=data.readUInt32BE(16);this.naturalHeight=data.readUInt32BE(20);});pendingDecodes.push(pending);return pending;}
};
globalThis.document={createElement(tag){assert.equal(tag,'canvas');const canvas={width:0,height:0,draws:[]};canvas.getContext=()=>({drawImage(...args){canvas.draws.push(args);}});return canvas;}};
const imported=UNITS.filter(u=>u.imageKey);
assert.equal(imported.length,20);
assert.equal(new Set(imported.map(u=>u.imageKey)).size,20);
const aims=[2.4,Math.PI/2,.75,-2.4,-Math.PI/2,-.75];
let frames=0;
for(const unit of imported){
 const icon=new URL(portraitURL(unit));assert.ok(icon.pathname.includes('/units/toon-pixel-test-20261117/icons/'));
 const bytes=await readFile(fileURLToPath(icon));assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],[256,256]);
 getImportedSprite(unit,aims[0]);
 // decode reads the local PNG asynchronously, just as Image.decode does in Chrome.
 await Promise.all(pendingDecodes);
 const first=getImportedSprite(unit,aims[0]);
 assert.ok(first,unit.name+' decoded');
 for(let index=0;index<6;index++){
  const frame=getImportedSprite(unit,aims[index]);assert.ok(frame,unit.name);
  assert.deepEqual([frame.width,frame.height],[256,256]);
  assert.deepEqual(frame.draws[0].slice(1),[index%3*256,Math.floor(index/3)*256,256,256,0,0,256,256]);
  frames++;
 }
}
console.log(JSON.stringify({project:'bachess',archive:report.archive,characters:imported.length,verifiedImages:report.files.length,verifiedDirectionFrames:frames,sourceFrameSize:UNIT_SOURCE_FRAME_SIZE,pcDisplaySize:UNIT_FRAME_SIZE,passed:true},null,2));
