import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {Client,type Room} from 'colyseus.js';
import type {Snapshot,SelfPlayerSnapshot,CombatEvent} from '../shared/model';
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const own=(s:Snapshot)=>s.players.find((p):p is SelfPlayerSnapshot=>p.visibility==='self')!;
function state(room:Room,predicate:(s:Snapshot)=>boolean):Promise<Snapshot>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(new Error(`snapshot timeout: ${predicate}`));},15000);const off=room.onMessage('snapshot',(s:Snapshot)=>{if(predicate(s)){clearTimeout(timer);off();resolve(s);}});});}
async function action(room:Room,input:unknown,predicate:(s:Snapshot)=>boolean){const pending=state(room,predicate);room.send('action',input);return pending;}
test('실제 PvP 서버: 3회 미니언전/처치 드롭/중도 복귀 후 PvP 매칭과 즉시 연속 골드',{timeout:100000},async()=>{
 const port=2684,url=`http://127.0.0.1:${port}`,server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:String(port)},stdio:'pipe'});
 let a:Room|undefined,b:Room|undefined;const drops=new Map<number,CombatEvent>();
 const record=(room:Room)=>room.onMessage('snapshot',(s:Snapshot)=>{for(const e of s.events)if(e.type==='loot')drops.set(e.id,e);});
 try{
  let healthy=false;for(let i=0;i<70;i++){try{if((await fetch(url+'/health')).ok){healthy=true;break;}}catch{}await wait(100);}assert.ok(healthy);
  const ca=new Client(url),cb=new Client(url);a=await ca.create('duel',{name:'도입부 A'});await state(a,s=>s.phase==='waiting');b=await cb.joinById(a.roomId,{name:'도입부 B'});record(a);record(b);
  const roomCode=a.roomId,session=a.sessionId;
  for(let round=1;round<=3;round++){
   for(const room of [a,b]){
    let s=await state(room,s=>s.round===round&&s.phase==='prepare');assert.equal(s.encounter,'minion');assert.equal(s.players.length,2);assert.equal(s.neutralOpponents?.length,2);
    const other=s.players.find(p=>p.visibility==='opponent')!;assert.ok(other.visibility==='opponent'&&other.rosterVisible);assert.ok(other.units.every(u=>u.x>=0));assert.deepEqual(other.inventory,[]);assert.ok(!('shop'in other)&&!('gold'in other));
    if(own(s).units.length<round){const p=own(s),offer=p.shop.find(o=>!o.sold&&o.cost<=p.gold)!;assert.ok(offer);s=await action(room,{type:'buy',offerId:offer.id,revision:p.shopRevision},v=>own(v).shop.some(o=>o.id===offer.id&&o.sold));}
    const count=Math.min(round,own(s).level),units=own(s).units.slice(0,count);
    for(let i=0;i<units.length;i++)s=await action(room,{type:'place',unitId:units[i].id,x:2+i,y:3},v=>own(v).units.find(u=>u.id===units[i].id)?.x===2+i);
   }
   await action(a,{type:'ready'},s=>own(s).ready);let pending=state(b,s=>s.round===round&&s.phase==='combat');b.send('action',{type:'ready'});await pending;
   if(round===1){const token:string=a.reconnectionToken;a.connection.close();await wait(150);a=await ca.reconnect(token);record(a);assert.equal(a.sessionId,session);assert.equal(a.roomId,roomCode);}
   const [x,y]:[Snapshot,Snapshot]=await Promise.all([state(a,s=>s.round===round&&s.phase==='result'),state(b,s=>s.round===round&&s.phase==='result')]);assert.deepEqual(x.roundHistory,y.roundHistory);
   for(const s of [x,y]){assert.equal(own(s).health,100);assert.equal(own(s).streakCount,0);assert.equal(own(s).score,0);assert.equal(s.roundHistory.at(-1)?.encounter,'minion');assert.equal(s.roundHistory.at(-1)?.players.find(p=>p.id===own(s).id)?.outcome,'win');}
  }
  assert.equal(drops.size,14);assert.deepEqual([...new Set([...drops.values()].map(e=>e.loot!.type))].sort(),['gold','item','unit']);
  let s=await state(a,s=>s.round===4&&s.phase==='prepare');assert.equal(s.encounter,'pvp');assert.equal(s.opponentId,null);assert.equal(s.neutralOpponents,undefined);
  for(const u of own(s).units.filter(u=>u.x>=0))s=await action(a,{type:'bench',unitId:u.id},v=>own(v).units.find(x=>x.id===u.id)?.x===-1);
  for(const round of [4,5]){
   const before=[];
   for(const room of [a,b]){let current=await state(room,s=>s.round===round&&s.phase==='prepare');const reward=own(current).pendingReward;
    if(reward){const gold=reward.options.find(o=>o.type==='gold')!;current=await action(room,{type:'chooseReward',rewardId:reward.id,optionId:gold.id},s=>!own(s).pendingReward);}before.push(own(current).gold);}
   await action(a,{type:'ready'},s=>own(s).ready);const matching=state(a,s=>s.phase==='matching');b.send('action',{type:'ready'});const during=await matching;assert.deepEqual(during.fighters,[]);assert.equal(during.opponentId,null);
   const [x,y]:[Snapshot,Snapshot]=await Promise.all([state(a,s=>s.round===round&&s.phase==='result'),state(b,s=>s.round===round&&s.phase==='result')]);
   assert.equal(x.winner,b.sessionId);assert.ok(x.fighters.every(f=>!f.minion));const bonus=round===5?1:0;assert.equal(own(x).gold,before[0]+bonus);assert.equal(own(y).gold,before[1]+1+bonus);assert.equal(own(x).lastIncome.streak,bonus);assert.equal(own(y).lastIncome.streak,bonus);
   assert.equal(own(x).streakCount,round-3);assert.equal(own(y).streakCount,round-3);
  }
 }finally{if(a?.connection.isOpen)await a.leave();if(b?.connection.isOpen)await b.leave();server.kill();}
});
