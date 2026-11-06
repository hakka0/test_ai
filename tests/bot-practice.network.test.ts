import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {Client,type Room} from 'colyseus.js';
import type {Snapshot,DebugAction,SelfPlayerSnapshot} from '../shared/model';
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function state(room:Room,predicate:(s:Snapshot)=>boolean):Promise<Snapshot>{return new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{off();reject(new Error('snapshot timeout'));},6000);
 const off=room.onMessage('snapshot',(s:Snapshot)=>{if(predicate(s)){clearTimeout(timer);off();resolve(s);}});
});}
async function command(room:Room,action:DebugAction,predicate:(s:Snapshot)=>boolean){const pending=state(room,predicate);room.send('debug',action);return pending;}
test('실제 6인 봇 방: 일반 실행에서 디버깅·미니언 3회·5초 매칭·3개 전장·관전 데이터·복원/재접속', {timeout:25000},async()=>{
 const port=2690,proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:String(port),DEBUG_GAME:'0',NODE_ENV:'production'},stdio:'pipe'});
 const client=new Client(`http://127.0.0.1:${port}`);let room:Room|undefined;
 try{
  let healthy=false;for(let i=0;i<70;i++){try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok){healthy=true;break;}}catch{}await wait(100);}assert.ok(healthy);
  room=await client.create('duel',{botPractice:true,name:'혼자 검사'});
  const initial=await state(room,s=>s.phase==='prepare'&&!!s.debug);assert.equal(initial.mode,'botPractice');assert.equal(initial.players.length,6);assert.equal(initial.players.filter(p=>p.bot).length,5);
  assert.ok(initial.players.slice(1).every(p=>p.ready&&p.visibility==='opponent'&&p.rosterVisible&&!('shop'in p)&&!('gold'in p)));
  assert.ok(initial.players[0].units.length===0);assert.ok(initial.players[0].visibility==='self'&&initial.players[0].shop.length>0);
  await assert.rejects(client.joinById(room.roomId,{name:'추가 접속'}));
  await command(room,{type:'pause',paused:true},s=>s.timeScale===0);
  for(let round=1;round<=3;round++){
   const battle=await command(room,{type:'nextPhase'},s=>s.phase==='combat');assert.equal(battle.neutralOpponents?.length,6);
   await command(room,{type:'nextPhase'},s=>s.phase==='result');await command(room,{type:'nextPhase'},s=>s.phase==='prepare'&&s.round===round+1);
  }
  const generation=initial.debug!.generation;
  for(const preset of ['synergyBulwark','synergyScout','synergyArcane'] as const){
   const expanded=await command(room,{type:'preset',preset},s=>s.phase==='prepare'&&s.players.some(p=>p.visibility==='self'&&p.units.length===18));
   const own=expanded.players.find((p):p is SelfPlayerSnapshot=>p.visibility==='self')!;
   assert.equal(new Set(own.units.map(u=>u.kind)).size,18);assert.equal(own.units.filter(u=>u.x>=0).length,6);assert.equal(own.units.filter(u=>u.x<0).length,12);
   assert.ok(expanded.players.slice(1).every(p=>p.visibility==='opponent'&&p.units.length===6&&p.bench.length===12));
   await command(room,{type:'nextPhase'},s=>s.phase==='matching');
   const fighting=await command(room,{type:'nextPhase'},s=>s.phase==='combat');assert.equal(fighting.fighters.length,36);assert.equal(fighting.battlePairs!.length,3);
  }
  const mid=await command(room,{type:'preset',preset:'mid'},s=>s.round===13&&s.debug!.generation>generation);
  assert.equal(mid.mode,'botPractice');assert.equal(mid.players.filter(p=>p.bot).length,5);
  const pending=state(room,s=>s.phase==='matching');room.send('action',{type:'ready'});const matching=await pending;
  assert.equal(matching.deadline-matching.gameNow,5000);assert.deepEqual(matching.battlePairs,[]);
  const combat=await command(room,{type:'nextPhase'},s=>s.phase==='combat');assert.equal(combat.battlePairs!.length,3);assert.equal(new Set(combat.battlePairs!.flat()).size,6);assert.equal(combat.fighters.length,42);
  assert.ok(combat.players.slice(1).every(p=>p.visibility==='opponent'&&p.rosterVisible&&p.units.length===7&&!('gold'in p)&&!('shop'in p)));
  const saved=await command(room,{type:'save'},s=>!!s.debug?.hasCheckpoint);
  const own=saved.players.find((p):p is SelfPlayerSnapshot=>p.visibility==='self')!,offer=own.shop.find(o=>!o.sold&&o.cost<=own.gold)!;
  assert.ok(offer);const bought=state(room,s=>s.players.some(p=>p.visibility==='self'&&p.gold===own.gold-offer.cost));room.send('action',{type:'buy',offerId:offer.id,revision:own.shopRevision});await bought;
  const result=await command(room,{type:'nextPhase'},s=>s.phase==='result');assert.equal(result.roundHistory.at(-1)!.players.length,6);assert.ok(result.roundHistory.at(-1)!.players.every(p=>p.opponentId&&p.outcome));
  const restored=await command(room,{type:'load'},s=>s.phase==='combat');assert.deepEqual(restored.fighters,saved.fighters);assert.deepEqual(restored.battlePairs,saved.battlePairs);
  const token=room.reconnectionToken;room.connection.close();await wait(250);room=await client.reconnect(token);const recovered=await state(room,s=>s.players.some(p=>p.visibility==='self'&&p.connected));
  assert.equal(recovered.mode,'botPractice');assert.equal(recovered.players.length,6);assert.deepEqual(recovered.fighters,restored.fighters);assert.deepEqual(recovered.battlePairs,restored.battlePairs);assert.ok(recovered.debug);
 }finally{await room?.leave();proc.kill();}
});
