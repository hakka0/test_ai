import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Client, type Room } from 'colyseus.js';
import type { Snapshot, SelfPlayerSnapshot } from '../shared/model';
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const own=(s:Snapshot)=>s.players.find((p):p is SelfPlayerSnapshot=>p.visibility==='self')!;
function state(room:Room,predicate:(s:Snapshot)=>boolean):Promise<Snapshot>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(new Error(`snapshot timeout: ${predicate.toString()}`));},5000);const off=room.onMessage('snapshot',(s:Snapshot)=>{if(predicate(s)){clearTimeout(timer);off();resolve(s);}});});}
async function send(room:Room,type:string,action:unknown,predicate:(s:Snapshot)=>boolean){const pending=state(room,predicate);room.send(type,action);return pending;}
async function rejected(room:Room,action:unknown){const pending=new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(new Error('notice timeout'));},5000);const off=room.onMessage('notice',(n:string)=>{clearTimeout(timer);off();resolve(n);});});room.send('action',action);return pending;}
test('실제 서버: 보상 선택/중복·제작/장착·저장 복원·재접속·미선택 자동 골드', {timeout:25000},async()=>{
 const port=2581,proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:String(port),DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
 let room:Room|undefined;
 try {
  let alive=false;for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok){alive=true;break;}}catch{}await wait(100);}assert.ok(alive);
  const client=new Client(`http://127.0.0.1:${port}`);room=await client.create('duel',{practice:true,name:'보상 검사'});await state(room,s=>s.phase==='prepare');
  await send(room,'debug',{type:'pause',paused:true},s=>s.timeScale===0);
  let s=await send(room,'debug',{type:'preset',preset:'reward'},s=>s.round===5&&!!own(s).pendingReward);
  assert.ok(!('pendingReward'in s.players.find(p=>p.visibility==='opponent')!));
  await send(room,'debug',{type:'save'},s=>!!s.debug?.hasCheckpoint);
  const original=own(s),reward=original.pendingReward!,gold=reward.options[0];assert.equal(gold.type,'gold');
  const action={type:'chooseReward',rewardId:reward.id,optionId:gold.id};
  s=await send(room,'action',action,s=>own(s).pendingReward===null);assert.equal(own(s).gold,original.gold+(gold.type==='gold'?gold.amount:0));
  assert.match(await rejected(room,action),/수령/);
  s=await send(room,'debug',{type:'load'},s=>!!own(s).pendingReward);assert.deepEqual(own(s).pendingReward,reward);
  const token=room.reconnectionToken;room.connection.close();await wait(200);room=await client.reconnect(token);
  s=await state(room,s=>own(s).connected);assert.deepEqual(own(s).pendingReward,reward);assert.deepEqual(own(s).inventory,original.inventory);
  const materials=own(s).inventory.filter(i=>i.definition==='iron'),craft={type:'craft',itemIds:[materials[0].id,materials[1].id]};
  s=await send(room,'action',craft,s=>own(s).inventory.some(i=>i.definition==='greatblade-t2'));
  const crafted=own(s).inventory.find(i=>i.definition==='greatblade-t2')!;assert.equal(own(s).inventory.length,original.inventory.length-1);
  assert.match(await rejected(room,craft),/보유/);
  const u=own(s).units.find(u=>!u.equipment.length)!;
  s=await send(room,'action',{type:'equip',itemId:crafted.id,unitId:u.id},s=>own(s).units.some(v=>v.id===u.id&&v.equipment.includes(crafted.id)));
  const item=reward.options[2];s=await send(room,'action',{type:'chooseReward',rewardId:reward.id,optionId:item.id},s=>own(s).pendingReward===null);
  assert.equal(own(s).inventory.length,original.inventory.length);assert.equal(own(s).lastReward!.option.type,'item');
  await send(room,'debug',{type:'save'},s=>!!s.debug?.hasCheckpoint);const saved=own(s);
  s=await send(room,'debug',{type:'nextPhase'},s=>s.phase==='combat');assert.equal(s.fighters.find(f=>f.id===u.id)!.maxHp>0,true);
  s=await send(room,'debug',{type:'load'},s=>s.phase==='prepare');assert.deepEqual(own(s),saved);
  const id=saved.id;s=await send(room,'debug',{type:'preset',preset:'reward'},s=>!!own(s).pendingReward&&own(s).pendingReward!.id!==reward.id);
  assert.match(await rejected(room,action),/수령/);assert.match(await rejected(room,craft),/보유/);
  const before=own(s),auto=before.pendingReward!.options[0];
  s=await send(room,'debug',{type:'nextPhase'},s=>s.phase==='combat');assert.equal(own(s).lastReward!.automatic,true);assert.equal(own(s).lastReward!.option.type,'gold');
  assert.equal(own(s).gold,before.gold+(auto.type==='gold'?auto.amount:0));assert.equal(own(s).pendingReward,null);assert.equal(own(s).id,id);
 }finally{await room?.leave();proc.kill('SIGTERM');}
});

test('실제 서버: 전투 중 합성 보류·리롤·배치 거부·저장 복원·재접속·준비에서 합성', {timeout:25000},async()=>{
 const port=2583,proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:String(port),DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
 let room:Room|undefined;
 try{
  let alive=false;for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok){alive=true;break;}}catch{}await wait(100);}assert.ok(alive);
  const client=new Client(`http://127.0.0.1:${port}`);room=await client.create('duel',{practice:true,name:'전투 중 상점'});await state(room,s=>s.phase==='prepare');
  await send(room,'debug',{type:'pause',paused:true},s=>s.timeScale===0);
  await send(room,'debug',{type:'preset',preset:'merge'},s=>own(s).units.filter(u=>u.kind==='yuuka'&&u.rank===1).length===2);
  let s=await send(room,'action',{type:'ready'},s=>s.phase==='combat');assert.equal(own(s).ready,true);
  const fighters=s.fighters,unit=own(s).units[0],before=own(s),buy={type:'buy',offerId:before.shop[0].id,revision:before.shopRevision};
  s=await send(room,'action',buy,s=>own(s).units.filter(u=>u.kind==='yuuka'&&u.rank===1).length===3);assert.equal(own(s).gold,before.gold-before.shop[0].cost);assert.equal(own(s).mergeRevision,before.mergeRevision);assert.deepEqual(s.fighters,fighters);
  assert.match(await rejected(room,buy),/갱신|구매/);assert.match(await rejected(room,{type:'place',unitId:unit.id,x:0,y:0}),/배치/);
  // Restore a funded checkpoint later: result-phase reroll must not depend on
  // earning the one-gold victory bonus, since board changes can alter the winner.
  await send(room,'debug',{type:'save'},s=>!!s.debug?.hasCheckpoint);const checkpoint=own(s);
  const revision=own(s).shopRevision,gold=own(s).gold,oldOffers=own(s).shop;
  s=await send(room,'action',{type:'reroll',revision},s=>own(s).shopRevision>revision);
  assert.equal(own(s).gold,gold-5);assert.deepEqual(s.fighters,fighters);assert.ok(own(s).shop.every(o=>!oldOffers.some(v=>v.id===o.id)));
  assert.match(await rejected(room,{type:'reroll',revision}),/갱신/);
  const saved=own(s);
  const token=room.reconnectionToken;room.connection.close();await wait(200);room=await client.reconnect(token);
  s=await state(room,s=>own(s).connected);assert.equal(s.phase,'combat');assert.deepEqual(own(s),saved);assert.deepEqual(s.fighters,fighters);
  const gameNow=s.gameNow;await send(room,'debug',{type:'step',ms:1000},s=>s.gameNow>gameNow);
  s=await send(room,'debug',{type:'load'},s=>s.phase==='combat'&&JSON.stringify(s.fighters)===JSON.stringify(fighters));assert.deepEqual(own(s),checkpoint);
  s=await send(room,'debug',{type:'nextPhase'},s=>s.phase==='result');assert.equal(own(s).units.filter(u=>u.kind==='yuuka'&&u.rank===1).length,3);const resultRevision=own(s).shopRevision;
  const resultGold=own(s).gold;assert.ok(resultGold>=5);
  s=await send(room,'action',{type:'reroll',revision:resultRevision},s=>own(s).shopRevision>resultRevision);assert.equal(own(s).gold,resultGold-5);const resultShop=own(s).shop;
  s=await send(room,'debug',{type:'nextPhase'},s=>s.phase==='prepare');
  assert.equal(own(s).units.find(u=>u.id===unit.id)!.rank,2);assert.equal(own(s).units.filter(u=>u.kind==='yuuka').length,1);
  assert.ok(own(s).shop.every(o=>!o.sold&&!resultShop.some(old=>old.id===o.id)));
  s=await send(room,'action',{type:'ready'},s=>s.phase==='combat');assert.equal(s.fighters.find(f=>f.id===unit.id)!.rank,2);
 }finally{await room?.leave();proc.kill('SIGTERM');}
});
