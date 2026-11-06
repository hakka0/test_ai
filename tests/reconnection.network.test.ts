import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {Client,type Room} from 'colyseus.js';
import type {Snapshot,SelfPlayerSnapshot} from '../shared/model';

const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const own=(s:Snapshot)=>s.players.find((p):p is SelfPlayerSnapshot=>p.visibility==='self')!;
function state(room:Room,predicate:(s:Snapshot)=>boolean):Promise<Snapshot>{
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{off();reject(new Error('snapshot timeout'));},6000);
  const off=room.onMessage('snapshot',(s:Snapshot)=>{if(predicate(s)){clearTimeout(timer);off();resolve(s);}});
 });
}
async function debug(room:Room,action:unknown,predicate:(s:Snapshot)=>boolean){const pending=state(room,predicate);room.send('debug',action);return pending;}

test('실제 서버: 65초 단절 복귀·토큰 갱신·동시 단절 복귀·명시적 종료 후 방 정리',{timeout:90000},async()=>{
 const port=2680,url=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:String(port),DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});
 let a:Room|undefined,b:Room|undefined;
 try{
  let healthy=false;for(let i=0;i<80;i++){try{if((await fetch(url+'/health')).ok){healthy=true;break;}}catch{}await wait(100);}assert.ok(healthy,'test server started');
  const client=new Client(url),peer=new Client(url);
  a=await client.create('duel',{name:'장기 복귀',practice:true});await state(a,s=>s.phase==='prepare');
  await debug(a,{type:'pause',paused:true},s=>s.timeScale===0);
  const before=await debug(a,{type:'preset',preset:'early'},s=>s.phase==='prepare'&&own(s).units.length===3);
  const identity={room:a.roomId,session:a.sessionId,token:a.reconnectionToken};
  a.connection.close();
  // Cross the previous 60-second server reservation in real time.
  await wait(65000);
  a=await client.reconnect(identity.token);const after=await state(a,s=>own(s).connected);
  assert.equal(a.roomId,identity.room);assert.equal(a.sessionId,identity.session);assert.notEqual(a.reconnectionToken,identity.token);
  for(const key of ['units','inventory','shop','gold','health','level','pendingReward'] as const)assert.deepEqual(own(after)[key],own(before)[key],key);
  assert.equal(after.gameNow,before.gameNow);assert.equal(after.phase,before.phase);
  const nextToken=a.reconnectionToken;a.connection.close();await wait(150);a=await client.reconnect(nextToken);await state(a,s=>own(s).connected);assert.equal(a.sessionId,identity.session);
  await a.leave();a=undefined;

  a=await client.create('duel',{name:'동시 복귀 A'});await state(a,s=>s.phase==='waiting');b=await peer.joinById(a.roomId,{name:'동시 복귀 B'});
  const [first,second]=await Promise.all([state(a,s=>s.phase==='prepare'),state(b,s=>s.phase==='prepare')]);
  const roomCode=a.roomId,ids=[a.sessionId,b.sessionId],tokens=[a.reconnectionToken,b.reconnectionToken];
  a.connection.close();b.connection.close();await wait(250);
  [a,b]=await Promise.all([client.reconnect(tokens[0]),peer.reconnect(tokens[1])]);
  const [backA,backB]=await Promise.all([state(a,s=>s.players.every(p=>p.connected)),state(b,s=>s.players.every(p=>p.connected))]);
  assert.deepEqual([a.sessionId,b.sessionId],ids);assert.equal(a.roomId,roomCode);assert.equal(b.roomId,roomCode);
  for(const [before,after] of [[first,backA],[second,backB]]){assert.equal(own(after).gold,own(before).gold);assert.deepEqual(own(after).units,own(before).units);assert.deepEqual(own(after).shop,own(before).shop);}
  const finalToken=b.reconnectionToken;await a.leave();a=undefined;await b.leave();b=undefined;await wait(250);
  await assert.rejects(peer.reconnect(finalToken),(e:unknown)=>(e as {code:number}).code===4212);
 }finally{
  if(a?.connection.isOpen)await a.leave();if(b?.connection.isOpen)await b.leave();server.kill();
 }
});
