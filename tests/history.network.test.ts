import test from 'node:test';
import {enterPlayerDuel} from './network-intro';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {Client,type Room} from 'colyseus.js';
import type {Snapshot,SelfPlayerSnapshot} from '../shared/model';
import {HistoryPanelState,resultFor} from '../client/history';
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const own=(s:Snapshot)=>s.players.find((p):p is SelfPlayerSnapshot=>p.visibility==='self')!;
function state(room:Room,predicate:(s:Snapshot)=>boolean):Promise<Snapshot>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(new Error('snapshot timeout'));},8000);const off=room.onMessage('snapshot',(s:Snapshot)=>{if(predicate(s)){clearTimeout(timer);off();resolve(s);}});});}
async function send(room:Room,type:string,input:unknown,predicate:(s:Snapshot)=>boolean){const pending=state(room,predicate);room.send(type,input);return pending;}
async function boot(port:number,debug=false){const proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:String(port),DEBUG_GAME:debug?'1':'0',NODE_ENV:'development'},stdio:'pipe'});for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok)return proc;}catch{}await wait(100);}proc.kill();throw new Error('server unavailable');}
test('실제 서버: 닫힌 상태 기록 누적·다음 라운드·재접속·체크포인트 복원·프리셋 초기화', {timeout:25000},async()=>{
 const port=2586,proc=await boot(port,true),client=new Client(`http://127.0.0.1:${port}`);let room:Room|undefined;
 try{
  room=await client.create('duel',{practice:true,name:'기록 검사'});let s=await state(room,s=>s.phase==='prepare');const panel=new HistoryPanelState();panel.observe(s,room.sessionId);assert.equal(panel.open,false);
  await send(room,'debug',{type:'pause',paused:true},s=>s.timeScale===0);await send(room,'debug',{type:'preset',preset:'early'},s=>own(s).units.length===3);await send(room,'action',{type:'ready'},s=>s.phase==='combat');
  s=await send(room,'debug',{type:'nextPhase'},s=>s.phase==='result');assert.equal(s.roundHistory.length,1);const first=structuredClone(s.roundHistory[0]);assert.equal(first.units.length,s.fighters.length);assert.ok(first.units.some(u=>u.damageDealt>0));
  for(const p of first.players){assert.equal(p.damage,p.healthBefore-p.healthAfter);assert.equal(p.survivors,s.fighters.filter(f=>f.owner===p.id&&f.hp>0).length);}
  panel.observe(s,room.sessionId);assert.equal(panel.open,false);panel.toggle();panel.select(1);panel.toggle();assert.equal(panel.detailVisible,false);
  await send(room,'debug',{type:'save'},s=>!!s.debug?.hasCheckpoint);s=await send(room,'debug',{type:'nextPhase'},s=>s.phase==='prepare');assert.deepEqual(s.roundHistory[0],first);
  await send(room,'action',{type:'ready'},s=>s.phase==='combat');s=await send(room,'debug',{type:'nextPhase'},s=>s.roundHistory.length===2);const history=structuredClone(s.roundHistory);
  panel.observe(s,room.sessionId);assert.equal(panel.open,false);panel.toggle();assert.equal(panel.selectedRound,1);assert.equal(panel.detailVisible,true);
  const token=room.reconnectionToken;room.connection.close();await wait(150);room=await client.reconnect(token);s=await state(room,s=>own(s).connected);assert.deepEqual(s.roundHistory,history);
  s=await send(room,'debug',{type:'load'},s=>s.roundHistory.length===1);assert.deepEqual(s.roundHistory[0],first);
  await send(room,'debug',{type:'nextPhase'},s=>s.phase==='prepare');await send(room,'action',{type:'ready'},s=>s.phase==='combat');s=await send(room,'debug',{type:'nextPhase'},s=>s.roundHistory.length===2);assert.deepEqual(s.roundHistory,history);
  s=await send(room,'debug',{type:'preset',preset:'late'},s=>s.round===19&&s.phase==='prepare');assert.deepEqual(s.roundHistory,[]);panel.observe(s,room.sessionId);assert.equal(panel.selectedRound,null);assert.equal(panel.detailVisible,false);
 }finally{await room?.leave();proc.kill('SIGTERM');}
});
test('실제 2인 대전: 기록 양측 동일·승패 관점과 실제 체력 감소·비공개 정보 유지', {timeout:55000},async()=>{
 const port=2587,proc=await boot(port),ca=new Client(`http://127.0.0.1:${port}`),cb=new Client(`http://127.0.0.1:${port}`);let a:Room|undefined,b:Room|undefined;
 try{
  a=await ca.create('duel',{name:'기록 A'});await state(a,s=>s.phase==='waiting');b=await cb.joinById(a.roomId,{name:'기록 B'});let [s]=await enterPlayerDuel(a,b);
  const p=own(s);s=await send(a,'action',{type:'buy',offerId:p.shop[0].id,revision:p.shopRevision},s=>own(s).units.length===1);const unit=own(s).units[0];
  const bp=own(await state(b,s=>s.phase==='prepare'));const bs=await send(b,'action',{type:'buy',offerId:bp.shop[0].id,revision:bp.shopRevision},s=>own(s).units.length===1);
  await send(b,'action',{type:'place',unitId:own(bs).units[0].id,x:2,y:1},s=>own(s).units[0].x===2);
  await send(a,'action',{type:'ready'},s=>own(s).ready);const aa=state(a,s=>s.phase==='result'),bb=state(b,s=>s.phase==='result');b.send('action',{type:'ready'});const [x,y]=await Promise.all([aa,bb]);
  assert.deepEqual(x.roundHistory,y.roundHistory);const record=x.roundHistory.at(-1)!;assert.equal(record.winner,b.sessionId);assert.equal(resultFor(record,a.sessionId),'loss');assert.equal(resultFor(record,b.sessionId),'win');
  assert.equal(record.players.find(p=>p.id===a!.sessionId)!.damage,2);assert.equal(record.players.find(p=>p.id===b!.sessionId)!.damage,0);
  for(const player of record.players)assert.deepEqual(Object.keys(player).sort(),['id','name','healthBefore','healthAfter','damage','survivors'].sort());
  assert.equal(record.units.length,1);assert.equal(record.units[0].owner,b.sessionId);assert.ok(!record.units.some(u=>u.id===unit.id));const publicA=y.players.find(p=>p.id===a!.sessionId)!;assert.ok(publicA.visibility==='opponent'&&publicA.bench.some(u=>u.id===unit.id));assert.ok(!('gold'in publicA));
 }finally{await a?.leave();await b?.leave();proc.kill('SIGTERM');}
});
test('실제 서버: 6종 전투 기여도·피해 합계·치유/보호막·체크포인트 재현·다음 라운드 기록 유지', {timeout:25000},async()=>{
 const port=2591,proc=await boot(port,true),client=new Client(`http://127.0.0.1:${port}`);let room:Room|undefined;
 try{
  room=await client.create('duel',{practice:true,name:'기여도 검사'});await state(room,s=>s.phase==='prepare');await send(room,'debug',{type:'pause',paused:true},s=>s.timeScale===0);
  await send(room,'debug',{type:'preset',preset:'synergy'},s=>s.round===7&&s.phase==='prepare');let s=await send(room,'action',{type:'ready'},s=>s.phase==='combat');
  assert.equal(s.fighters.length,12);const participants=s.fighters.map(f=>({id:f.id,owner:f.owner,kind:f.kind,rank:f.rank}));assert.ok(s.fighters.every(f=>!('contribution'in f)));
  const gameNow=s.gameNow;await send(room,'debug',{type:'step',ms:1000},s=>s.gameNow===gameNow+1000);await send(room,'debug',{type:'save'},s=>!!s.debug?.hasCheckpoint);
  s=await send(room,'debug',{type:'nextPhase'},s=>s.phase==='result');const record=structuredClone(s.roundHistory[0]);assert.equal(record.units.length,12);
  assert.deepEqual(record.units.map(u=>({id:u.id,owner:u.owner,kind:u.kind,rank:u.rank})),participants);
  const sum=(key:'damageDealt'|'damageTaken'|'healing'|'shieldBlocked')=>record.units.reduce((n,u)=>n+u[key],0);
  assert.ok(Math.abs(sum('damageDealt')-sum('damageTaken'))<1e-7);assert.ok(sum('damageDealt')>0);assert.ok(sum('healing')>0);assert.ok(sum('shieldBlocked')>0);
  for(const u of record.units){for(const key of ['damageDealt','damageTaken','healing','shieldBlocked'] as const)assert.ok(Number.isFinite(u[key])&&u[key]>=0);assert.deepEqual(Object.keys(u).sort(),['id','owner','kind','rank','damageDealt','damageTaken','healing','shieldBlocked'].sort());}
  await send(room,'debug',{type:'load'},s=>s.phase==='combat'&&s.roundHistory.length===0);s=await send(room,'debug',{type:'nextPhase'},s=>s.phase==='result');assert.deepEqual(s.roundHistory[0],record);
  s=await send(room,'debug',{type:'nextPhase'},s=>s.phase==='prepare');assert.deepEqual(s.roundHistory[0],record);
  await send(room,'action',{type:'ready'},s=>s.phase==='combat');s=await send(room,'debug',{type:'nextPhase'},s=>s.roundHistory.length===2);assert.deepEqual(s.roundHistory[0],record);
 }finally{await room?.leave();proc.kill('SIGTERM');}
});
