import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Client, type Room } from 'colyseus.js';
import type { DebugAction, Snapshot, SelfPlayerSnapshot } from '../shared/model';
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function state(room:Room,predicate:(s:Snapshot)=>boolean):Promise<Snapshot>{
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(new Error('snapshot timeout'));},5000);const off=room.onMessage('snapshot',(s:Snapshot)=>{if(predicate(s)){clearTimeout(timer);off();resolve(s);}});});
}
async function command(room:Room,action:DebugAction,predicate:(s:Snapshot)=>boolean){const pending=state(room,predicate);room.send('debug',action);return pending;}
async function notice(room:Room,action:DebugAction){const pending=new Promise<string>(resolve=>{const off=room.onMessage('notice',(n:string)=>{off();resolve(n);});});room.send('debug',action);return pending;}
async function boot(port:number,production=false){
 const proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:String(port),DEBUG_GAME:'1',NODE_ENV:production?'production':'development'},stdio:'pipe'});
 let output='';proc.stderr.on('data',d=>output+=d);
 for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok)return proc;}catch{}await wait(100);}
 proc.kill();throw new Error('server unavailable '+output);
}
test('실제 디버깅 서버: 대전 거부·배속·정지·단계·프리셋·저장 복원·재접속', {timeout:25000},async()=>{
 const port=2578,proc=await boot(port),client=new Client(`http://127.0.0.1:${port}`);let room:Room|undefined;
 try{
  room=await client.create('duel',{name:'대전 제한'});const normal=await state(room,s=>s.phase==='waiting');assert.ok(!normal.debug);
  assert.match(await notice(room,{type:'preset',preset:'late'}),/혼자 연습/);await room.leave();
  room=await client.create('duel',{name:'디버깅',practice:true});const initial=await state(room,s=>!!s.debug);
  assert.equal(initial.timeScale,1);
  const fast=await command(room,{type:'speed',value:10},s=>s.timeScale===10);await wait(200);
  const fastLater=await state(room,s=>s.timeScale===10);assert.ok(fastLater.gameNow-fast.gameNow>=1000);
  const paused=await command(room,{type:'pause',paused:true},s=>s.timeScale===0);await wait(200);
  const frozen=await state(room,s=>s.timeScale===0);assert.equal(frozen.gameNow,paused.gameNow);assert.ok(frozen.serverNow>paused.serverNow);
  const step=await command(room,{type:'step',ms:100},s=>s.gameNow===frozen.gameNow+100);assert.equal(step.timeScale,0);
  const mergePreset=await command(room,{type:'preset',preset:'merge'},s=>s.phase==='prepare'&&s.players.some(p=>p.visibility==='self'&&p.level===3&&p.units.filter(u=>u.kind==='shiroko').length===2));
  const mergeOwn=mergePreset.players.find((p):p is SelfPlayerSnapshot=>p.visibility==='self')!;
  const mergeBuy={type:'buy',offerId:mergeOwn.shop[0].id,revision:mergeOwn.shopRevision,rank:3,cost:0};
  const mergePending=state(room,s=>s.players.some(p=>p.visibility==='self'&&p.units.some(u=>u.kind==='shiroko'&&u.rank===2)));
  room.send('action',mergeBuy);const merged=await mergePending;
  const upgraded=merged.players.find((p):p is SelfPlayerSnapshot=>p.visibility==='self')!;
  assert.equal(upgraded.gold,9);assert.equal(upgraded.units.length,2);assert.equal(upgraded.units[0].equipment.length,2);
  assert.equal(upgraded.lastMerge!.rank,2);assert.ok(!('lastMerge'in merged.players.find(p=>p.visibility==='opponent')!));
  room.onMessage('notice',()=>{});room.send('action',mergeBuy);await wait(100);
  const unchanged=await state(room,s=>s.players.some(p=>p.visibility==='self'&&p.gold===9));
  assert.deepEqual(unchanged.players.find(p=>p.visibility==='self'),upgraded);
  await command(room,{type:'save'},s=>!!s.debug?.hasCheckpoint);
  const mergeCombat=await command(room,{type:'nextPhase'},s=>s.phase==='combat');
  assert.equal(mergeCombat.fighters.find(f=>f.id===upgraded.units[0].id)!.maxHp,402);
  const mergeLoaded=await command(room,{type:'load'},s=>s.phase==='prepare');assert.deepEqual(mergeLoaded.players.find(p=>p.visibility==='self'),upgraded);
  const mergeToken=room.reconnectionToken;room.connection.close();await wait(300);room=await client.reconnect(mergeToken);
  const mergeRecovered=await state(room,s=>s.players.some(p=>p.visibility==='self'&&p.connected));
  assert.deepEqual(mergeRecovered.players.find(p=>p.visibility==='self'),upgraded);
  const salePending=state(room,s=>s.players.some(p=>p.visibility==='self'&&p.gold===12));
  room.send('action',{type:'sell',unitId:upgraded.units[0].id});const soldMerge=await salePending;
  const soldOwn=soldMerge.players.find((p):p is SelfPlayerSnapshot=>p.visibility==='self')!;assert.ok(soldOwn.inventory.slice(0,2).every(i=>i.unitId===null));
  const synergyPreset=await command(room,{type:'preset',preset:'synergy'},s=>s.round===7&&s.phase==='prepare');
  const synergyOwn=synergyPreset.players.find((p):p is SelfPlayerSnapshot=>p.visibility==='self')!;
  assert.equal(synergyOwn.level,6);assert.equal(new Set(synergyOwn.units.map(u=>u.kind)).size,6);
  assert.ok(synergyOwn.units.every(u=>u.x>=0&&u.rank===1));
  const synergyCombat=await command(room,{type:'nextPhase'},s=>s.phase==='combat');
  assert.equal(synergyCombat.fighters.length,12);
  assert.equal(synergyCombat.fighters.find(f=>f.owner===room!.sessionId&&f.kind==='yuuka')!.maxHp,374);
  assert.equal(synergyCombat.fighters.find(f=>f.owner===room!.sessionId&&f.kind==='hifumi')!.shield,65);
  const synergyBot=synergyCombat.players.find(p=>p.visibility==='opponent')!;
  assert.ok(!('gold'in synergyBot)&&!('shop'in synergyBot)&&!('lastMerge'in synergyBot));
  await command(room,{type:'save'},s=>!!s.debug?.hasCheckpoint);
  await command(room,{type:'step',ms:1000},s=>s.gameNow===synergyCombat.gameNow+1000);
  const synergyLoaded=await command(room,{type:'load'},s=>s.phase==='combat'&&s.gameNow===synergyCombat.gameNow);
  assert.deepEqual(synergyLoaded.fighters,synergyCombat.fighters);
  const synergyToken=room.reconnectionToken;room.connection.close();await wait(300);room=await client.reconnect(synergyToken);
  const synergyRecovered=await state(room,s=>s.players.some(p=>p.visibility==='self'&&p.connected));
  assert.deepEqual(synergyRecovered.fighters,synergyLoaded.fighters);
  const late=await command(room,{type:'preset',preset:'late'},s=>s.round===19&&s.phase==='prepare');
  const own=late.players.find((p):p is SelfPlayerSnapshot=>p.visibility==='self')!;
  assert.equal(own.level,8);assert.equal(own.gold,60);assert.equal(own.health,50);assert.equal(own.units.length,8);
  const bot=late.players.find(p=>p.visibility==='opponent')!;assert.ok(!('gold'in bot)&&!('shop'in bot));
  const combat=await command(room,{type:'nextPhase'},s=>s.phase==='combat');assert.equal(combat.fighters.length,16);
  await command(room,{type:'step',ms:1000},s=>s.gameNow===combat.gameNow+1000);
  const saved=await command(room,{type:'save'},s=>!!s.debug?.hasCheckpoint);
  await command(room,{type:'preset',preset:'level10'},s=>s.round===25);
  const loaded=await command(room,{type:'load'},s=>s.round===19&&s.phase==='combat');
  assert.equal(loaded.gameNow,saved.gameNow);assert.equal(loaded.timeScale,0);
  assert.deepEqual(loaded.fighters,saved.fighters);assert.deepEqual(loaded.players,saved.players);
  assert.ok(loaded.debug!.generation>saved.debug!.generation);
  // serverNow has millisecond precision: ensure a later real-time sample while game time is paused.
  await wait(50);
  room.onMessage('pong',()=>{});const pong=new Promise<{serverNow:number}>(resolve=>{const off=room!.onMessage('pong',(p:any)=>{off();resolve(p);});});room.send('ping',123);
  assert.ok((await pong).serverNow>loaded.serverNow);
  const token=room.reconnectionToken,id=room.sessionId;room.connection.close();await wait(300);room=await client.reconnect(token);
  const recovered=await state(room,s=>s.players.some(p=>p.id===id&&p.connected));assert.equal(recovered.gameNow,loaded.gameNow);assert.equal(recovered.timeScale,0);assert.ok(recovered.debug?.hasCheckpoint);
  assert.deepEqual(recovered.players.find(p=>p.id===id),loaded.players.find(p=>p.id===id));
  await command(room,{type:'pause',paused:false},s=>s.timeScale===10);
 }finally{await room?.leave();proc.kill('SIGTERM');}
});
test('운영 서버: DEBUG_GAME=1이어도 디버깅 비활성화', {timeout:10000},async()=>{
 const proc=await boot(2579,true);let room:Room|undefined;
 try{room=await new Client('http://127.0.0.1:2579').create('duel',{practice:true});const s=await state(room,s=>s.phase==='prepare');assert.equal(s.debug,undefined);assert.equal(s.timeScale,1);assert.match(await notice(room,{type:'speed',value:10}),/개발 서버/);}
 finally{await room?.leave();proc.kill('SIGTERM');}
});

test('실제 서버: 결과 상품 유지·기존 상품 구매·준비 진입 무료 갱신·이전 요청 거부', {timeout:20000},async()=>{
 const proc=await boot(2589);let room:Room|undefined;
 const own=(s:Snapshot)=>s.players.find((p):p is SelfPlayerSnapshot=>p.visibility==='self')!;
 try{
  room=await new Client('http://127.0.0.1:2589').create('duel',{practice:true});
  await state(room,s=>s.phase==='prepare');await command(room,{type:'pause',paused:true},s=>s.timeScale===0);
  const initial=await command(room,{type:'preset',preset:'early'},s=>s.phase==='prepare'&&s.round===1);
  const before=own(initial);
  await command(room,{type:'nextPhase'},s=>s.phase==='combat');
  const result=await command(room,{type:'nextPhase'},s=>s.phase==='result'),after=own(result);
  assert.equal(after.shopRevision,before.shopRevision);assert.deepEqual(after.shop,before.shop);
  assert.equal(after.gold,before.gold+(result.winner===room.sessionId?1:0));
  const unchanged=await state(room,s=>s.phase==='result');assert.deepEqual(own(unchanged).shop,after.shop);assert.equal(own(unchanged).gold,after.gold);
  const offer=after.shop[0],bought=state(room,s=>own(s).shop.some(o=>o.id===offer.id&&o.sold));
  room.send('action',{type:'buy',offerId:offer.id,revision:after.shopRevision});const purchase=own(await bought);
  assert.equal(purchase.gold,after.gold-offer.cost);
  const next=await command(room,{type:'nextPhase'},s=>s.phase==='prepare'&&s.round===2);
  assert.equal(own(next).shopRevision,purchase.shopRevision+1);
  assert.ok(own(next).shop.every(o=>!o.sold&&!purchase.shop.some(old=>old.id===o.id)));
  assert.deepEqual(own(next).units,purchase.units);
  const rejected=new Promise<string>(resolve=>{const off=room!.onMessage('notice',(n:string)=>{off();resolve(n);});});
  room.send('action',{type:'buy',offerId:purchase.shop[1].id,revision:purchase.shopRevision});assert.ok(await rejected);
  const stable=await state(room,s=>s.phase==='prepare');assert.deepEqual(own(stable),own(next));
 }finally{await room?.leave();proc.kill('SIGTERM');}
});
