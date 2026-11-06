import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {Client,type Room} from 'colyseus.js';
import type {Action,Snapshot,SelfPlayerSnapshot} from '../shared/model';
import {scoutingBoard,roster} from '../client/scouting';
import {unitSellPrice} from '../shared/shop';
import {enterPlayerDuel} from './network-intro';

function state(room:Room,predicate:(s:Snapshot)=>boolean):Promise<Snapshot>{
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(new Error('snapshot timeout'));},45000);const off=room.onMessage('snapshot',(s:Snapshot)=>{if(predicate(s)){clearTimeout(timer);off();resolve(s);}});});
}
const own=(s:Snapshot)=>s.players.find((p):p is SelfPlayerSnapshot=>p.visibility==='self')!;

test('실제 2인 서버: 준비 관전·매칭·전투 대기석 구매/판매·출전 판매 거부·즉시 체력·결과 판매', {timeout:85000},async()=>{
 const url='http://127.0.0.1:2588',server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'2588'},stdio:'pipe'});
 let a:Room|undefined,b:Room|undefined;
 try{
  let healthy=false;for(let i=0;i<80;i++){try{if((await fetch(url+'/health')).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(healthy);
  const client=new Client(url);a=await client.create('duel',{name:'배치 변경'});a.onMessage('notice',()=>{});const preparing=state(a,s=>s.phase==='prepare');b=await client.joinById(a.roomId,{name:'관전자'});b.onMessage('notice',()=>{});
  await preparing;let [first,second]=await enterPlayerDuel(a,b);
  assert.match(a.roomId,/^[A-F0-9]{4}$/);assert.equal(b.roomId,a.roomId);
  async function change(room:Room,action:Action,predicate:(s:Snapshot)=>boolean):Promise<[Snapshot,Snapshot]>{const pending=state(room,predicate);room.send('action',action);const owned=await pending,other=await state(room===a?b!:a!,s=>s.gameNow>=owned.gameNow);return room===a?[owned,other]:[other,owned];}
  for(const room of [a,b]){
   const snapshot=room===a?first:second,p=own(snapshot),offer=p.shop[0];
   [first,second]=await change(room,{type:'buy',offerId:offer.id,revision:p.shopRevision},s=>roster(s.players.find(v=>v.id===room.sessionId)!).length===1);
   const unit=own(room===a?first:second).units[0];
   [first,second]=await change(room,{type:'place',unitId:unit.id,x:2,y:1},s=>s.players.find(v=>v.id===room.sessionId)!.units.some(u=>u.id===unit.id&&u.x===2));
  }
  const unit=own(first).units[0],enemy=own(second).units[0];
  const before=scoutingBoard(second,a.sessionId);assert.deepEqual(before.players.map(p=>p.id),[a.sessionId]);assert.equal(before.players.flatMap(p=>p.units).length,1);assert.equal(first.opponentId,null);assert.equal(second.opponentId,null);
  [first,second]=await change(a,{type:'place',unitId:unit.id,x:5,y:2},s=>s.players.find(v=>v.id===a!.sessionId)!.units.some(u=>u.id===unit.id&&u.x===5&&u.y===2));
  assert.equal(own(first).units[0].x,5);assert.equal(scoutingBoard(second,a.sessionId).players[0].units[0].x,5);assert.equal(own(second).units[0].id,enemy.id);
  const matchingA=state(a,s=>s.phase==='matching'),matchingB=state(b,s=>s.phase==='matching');a.send('action',{type:'ready'});b.send('action',{type:'ready'});const matching=await Promise.all([matchingA,matchingB]);
  assert.equal(matching[0].deadline,matching[1].deadline);assert.ok(matching[0].deadline-matching[0].gameNow>=4900);assert.ok(matching.every(s=>s.opponentId===null&&s.battlePairs?.length===0&&s.fighters.length===0&&s.players.some(p=>p.visibility==='opponent'&&p.units.length>0)));
  const matchOwn=own(matching[0]);
  [first,second]=await change(a,{type:'buyExperience',revision:matchOwn.experienceRevision},s=>own(s).experienceRevision>matchOwn.experienceRevision);
  const afterXp=own(first);assert.equal(afterXp.gold,matchOwn.gold-4);assert.equal(first.deadline,matching[0].deadline);
  [first,second]=await change(a,{type:'reroll',revision:afterXp.shopRevision},s=>own(s).shopRevision>afterXp.shopRevision);
  assert.equal(own(first).gold,afterXp.gold-5);assert.equal(first.phase,'matching');assert.equal(first.deadline,matching[0].deadline);
  a.send('action',{type:'ready'});const reconfirmed=await state(a,s=>s.phase==='matching');assert.equal(reconfirmed.deadline,matching[0].deadline);
  [first,second]=await Promise.all([state(a,s=>s.phase==='combat'),state(b,s=>s.phase==='combat')]);assert.ok(first.gameNow>=matching[0].deadline);assert.equal(first.opponentId,b.sessionId);assert.equal(second.opponentId,a.sessionId);assert.equal(scoutingBoard(second,a.sessionId).fighters.length,2);
  const battleGold=own(first).gold,frozen=first.fighters.find(f=>f.id===unit.id)!;
  const denied=new Promise<string>(resolve=>{const off=a!.onMessage('notice',(n:string)=>{off();resolve(n);});});a.send('action',{type:'sell',unitId:unit.id});assert.match(await denied,/전투 중/);
  const unchanged=await state(a,s=>s.phase==='combat');assert.equal(own(unchanged).gold,battleGold);assert.ok(own(unchanged).units.some(u=>u.id===unit.id));
  const offer=own(unchanged).shop.find(o=>!o.sold&&o.cost<=own(unchanged).gold)!;assert.ok(offer);
  [first,second]=await change(a,{type:'buy',offerId:offer.id,revision:own(unchanged).shopRevision},s=>own(s).units.some(u=>u.x<0));
  const reserve=own(first).units.find(u=>u.x<0)!,reserveGold=own(first).gold;
  assert.ok(!first.fighters.some(f=>f.id===reserve.id));
  [first,second]=await change(a,{type:'sell',unitId:reserve.id},s=>!own(s).units.some(u=>u.id===reserve.id));
  assert.equal(first.phase,'combat');assert.equal(own(first).gold,reserveGold+unitSellPrice(reserve));assert.ok(own(first).units.some(u=>u.id===unit.id));
  const observed=second.players.find(p=>p.id===a!.sessionId)!;assert.ok(observed.visibility==='opponent'&&!observed.bench.some(u=>u.id===reserve.id));
  assert.deepEqual(first.fighters.map(f=>f.id).sort(),[unit.id,enemy.id].sort());
  [first,second]=await Promise.all([state(a,s=>s.phase==='result'),state(b,s=>s.phase==='result')]);
  for(const s of [first,second]){const record=s.roundHistory.at(-1)!;for(const p of record.players)assert.equal(s.players.find(v=>v.id===p.id)!.health,p.healthAfter);assert.ok(s.players.some(p=>p.health<100));assert.ok(s.gameNow<s.deadline);}
  const gold=own(first).gold;
  [first,second]=await change(a,{type:'sell',unitId:unit.id},s=>!roster(s.players.find(p=>p.id===a!.sessionId)!).some(u=>u.id===unit.id));
  assert.equal(own(first).gold,gold+unitSellPrice(unit));assert.equal(first.phase,'result');
  for(const s of [first,second]){const combatUnit:Snapshot['fighters'][number]|undefined=scoutingBoard(s,b.sessionId).fighters.find(f=>f.id===unit.id);assert.ok(combatUnit);assert.equal(combatUnit.maxHp,frozen.maxHp);assert.equal(combatUnit.rank,frozen.rank);assert.deepEqual(combatUnit.equipment,frozen.equipment);}
  const advanced=await state(b,s=>s.gameNow>second.gameNow+200);assert.ok(advanced.fighters.some(f=>f.id===unit.id));assert.equal(advanced.phase,'result');
 }finally{await a?.leave();await b?.leave();server.kill();}
});
