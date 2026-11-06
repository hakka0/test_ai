import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {Client,type Room} from 'colyseus.js';
import type {Snapshot,SelfPlayerSnapshot} from '../shared/model';
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const own=(s:Snapshot)=>s.players.find((p):p is SelfPlayerSnapshot=>p.visibility==='self')!;
function state(room:Room,predicate:(s:Snapshot)=>boolean):Promise<Snapshot>{return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{off();reject(new Error('snapshot timeout'));},16000);const off=room.onMessage('snapshot',(s:Snapshot)=>{if(predicate(s)){clearTimeout(timeout);off();resolve(s);}});});}
async function action(room:Room,input:unknown,predicate:(s:Snapshot)=>boolean){const pending=state(room,predicate);room.send('action',input);return pending;}
async function rejected(room:Room,input:unknown){const pending=new Promise<string>((resolve,reject)=>{const timeout=setTimeout(()=>{off();reject(new Error('notice timeout'));},5000);const off=room.onMessage('notice',(n:string)=>{clearTimeout(timeout);off();resolve(n);});});room.send('action',input);return pending;}
test('실제 2인 서버: 양방향/전장/대기석 교환·준비 배치 공개·재접속·준비 완료/전투 차단', {timeout:40000},async()=>{
 const port=2584,url=`http://127.0.0.1:${port}`,proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:String(port)},stdio:'pipe'});
 let a:Room|undefined,b:Room|undefined;
 try{
  let alive=false;for(let i=0;i<60;i++){try{if((await fetch(url+'/health')).ok){alive=true;break;}}catch{}await wait(100);}assert.ok(alive);
  const ca=new Client(url),cb=new Client(url);a=await ca.create('duel',{name:'교환 A'});await state(a,s=>s.phase==='waiting');b=await cb.joinById(a.roomId,{name:'교환 B'});
  let s=await state(a,s=>s.phase==='prepare');assert.equal(own(s).units.length,0);assert.equal(own(s).inventory.length,0);
  await action(a,{type:'ready'},s=>own(s).ready);const next=state(a,s=>s.round===2&&s.phase==='prepare');b.send('action',{type:'ready'});s=await next;
  for(let i=0;i<2;i++){const p=own(s);s=await action(a,{type:'buy',offerId:p.shop.find(o=>!o.sold)!.id,revision:p.shopRevision},s=>own(s).units.length===i+1);}
  const first=own(s).units[0];s=await action(a,{type:'place',unitId:first.id,x:2,y:3},s=>own(s).units[0].x===2);
  s=await action(a,{type:'bench',unitId:own(s).units[1].id,slot:0},s=>own(s).units[1].benchSlot===0);
  const bp=own(await state(b,s=>s.round===2&&s.phase==='prepare'));const boughtB=await action(b,{type:'buy',offerId:bp.shop[0].id,revision:bp.shopRevision},s=>own(s).units.length===1);
  await action(b,{type:'place',unitId:own(boughtB).units[0].id,x:2,y:3},s=>own(s).units[0].x===2);
  const original=own(s),[field,reserve]=original.units;
  const swap={type:'place',unitId:reserve.id,x:field.x,y:field.y};
  s=await action(a,swap,s=>own(s).units.find(u=>u.id===reserve.id)!.x===field.x);
  assert.equal(own(s).units.find(u=>u.id===field.id)!.benchSlot,0);assert.equal(own(s).gold,original.gold);
  const opponent=await state(b,s=>s.phase==='prepare');
  const publicA=opponent.players.find(p=>p.id===a!.sessionId)!;assert.ok(publicA.units.length>0);assert.ok(publicA.visibility==='opponent'&&publicA.rosterVisible);assert.ok(publicA.bench.length>0);assert.ok(!('gold'in publicA)&&!('shop'in publicA));
  assert.deepEqual(publicA.inventory,[]);
  const positions=own(s).units; // Duplicate destination request is a no-op.
  a.send('action',swap);s=await state(a,s=>s.phase==='prepare');assert.deepEqual(own(s).units,positions);
  s=await action(a,{type:'bench',unitId:reserve.id,slot:0},s=>own(s).units.find(u=>u.id===reserve.id)!.benchSlot===0);
  assert.equal(own(s).units.find(u=>u.id===field.id)!.x,field.x);
  s=await action(a,{type:'bench',unitId:reserve.id,slot:1},s=>own(s).units.find(u=>u.id===reserve.id)!.benchSlot===1);
  s=await action(a,{type:'bench',unitId:reserve.id,slot:0},s=>own(s).units.find(u=>u.id===reserve.id)!.benchSlot===0);
  s=await action(a,{type:'buyExperience',revision:own(s).experienceRevision},s=>own(s).level===3);
  s=await action(a,{type:'place',unitId:reserve.id,x:0,y:0},s=>own(s).units.find(u=>u.id===reserve.id)!.x===0);
  s=await action(a,{type:'place',unitId:field.id,x:0,y:0},s=>own(s).units.find(u=>u.id===field.id)!.x===0);
  assert.equal(own(s).units.find(u=>u.id===reserve.id)!.x,field.x);assert.equal(own(s).units.find(u=>u.id===reserve.id)!.y,field.y);
  const saved=own(s),token=a.reconnectionToken;a.connection.close();await wait(150);a=await ca.reconnect(token);
  s=await state(a,s=>own(s).connected);assert.deepEqual(own(s),saved);
  s=await action(a,{type:'ready'},s=>own(s).ready);assert.equal(s.phase,'prepare');assert.match(await rejected(a,swap),/준비 완료/);
  const battle=state(a,s=>s.phase==='combat');b.send('action',{type:'ready'});s=await battle;
  assert.deepEqual(own(s).units,saved.units);assert.ok(s.fighters.some(f=>f.id===reserve.id));assert.equal(s.fighters.filter(f=>f.owner===a!.sessionId).length,2);
  assert.match(await rejected(a,{type:'bench',unitId:field.id,slot:0}),/배치/);
  const final=await state(a,s=>s.phase==='combat');assert.deepEqual(own(final).units,saved.units);
 }finally{await a?.leave();await b?.leave();proc.kill('SIGTERM');}
});
