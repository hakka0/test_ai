import {newTestPlayer as newPlayer} from "./fixtures";
import test from 'node:test';
import assert from 'node:assert/strict';
import type {Client,Room} from 'colyseus.js';
import {Connection} from '../client/net';
import {snapshotFor} from '../shared/snapshot';
import {newMatch} from "../shared/engine";
import {CONNECTION_STALE_MS, RECONNECT_GRACE_SECONDS} from '../shared/connection-policy';
function deferred<T>(){let resolve!:(v:T)=>void,reject!:(e:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function storage(){const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};}
function fakeRoom(id:string){
 const messages=new Map<string,(data:any)=>void>();let leaveCallback=(_code:number)=>{},errorCallback=(_code:number,_message:string)=>{};
 const fake={sessionId:id,reconnectionToken:`token-${id}`,left:0,sent:[] as Array<[string,unknown]>,
  connection:{isOpen:true,closed:0,close(){this.closed++;this.isOpen=false;leaveCallback(1006);}},
  onMessage(type:string,cb:(data:any)=>void){messages.set(type,cb);},onLeave(cb:(code:number)=>void){leaveCallback=cb;},onError(cb:(code:number,message:string)=>void){errorCallback=cb;},
  send(type:string,data:unknown){this.sent.push([type,data]);},async leave(){this.left++;},
  emit(type:string,data:unknown){messages.get(type)?.(data);},drop(code=1006){this.connection.isOpen=false;leaveCallback(code);},error(){errorCallback(1,'old error');}};
 return {fake,room:fake as unknown as Room};
}
const view=()=>{const m=newMatch();m.players=[newPlayer('a','A')];return snapshotFor(m,'a',Date.now(),'room');};
test('접속: 명시적 떠나기는 토큰/시간 상태 초기화, 새 방 이후 옛 이벤트·재접속·수신 무시',async()=>{
 const a=fakeRoom('a'),b=fakeRoom('b'),store=storage();let reconnects=0,creates=0,snapshots=0,notices=0,statuses=0;
 const client={create:async()=>++creates===1?a.room:b.room,reconnect:async()=>{reconnects++;return a.room;}} as unknown as Client;
 const net=new Connection({client,storage:store});net.onSnapshot=()=>snapshots++;net.onNotice=()=>notices++;net.onStatus=()=>statuses++;
 try{
  await net.connect('practice','A');a.fake.emit('snapshot',view());assert.equal(net.hasSnapshot,true);await net.leave();assert.equal(net.hasSnapshot,false);assert.equal(store.getItem('duel-token'),null);
  await net.connect('create','A');const statusCount=statuses;a.fake.drop();a.fake.emit('snapshot',view());a.fake.emit('notice','OLD');a.fake.emit('pong',{sent:performance.now(),serverNow:1});a.fake.error();
  assert.equal(reconnects,0);assert.equal(net.room,b.room);assert.equal(net.connected,true);assert.equal(snapshots,1);assert.equal(notices,0);assert.equal(statuses,statusCount);assert.equal(store.getItem('duel-token'),'token-b');
 }finally{await net.leave();}
});
test('접속: 이전 재접속 요청이 새 경기 이후 도착해도 새 방/토큰을 덮어쓰지 않고 이전 방을 닫음',async()=>{
 const a=fakeRoom('a'),b=fakeRoom('b'),restored=fakeRoom('old-restored'),pending=deferred<Room>(),store=storage();let creates=0;
 const client={create:async()=>++creates===1?a.room:b.room,reconnect:()=>pending.promise} as unknown as Client,net=new Connection({client,storage:store});
 try{
  await net.connect('practice','A');a.fake.drop();assert.equal(net.connected,false);await net.leave();await net.connect('practice','A');
  pending.resolve(restored.room);await new Promise(r=>setImmediate(r));assert.equal(restored.fake.left,1);assert.equal(net.room,b.room);assert.equal(store.getItem('duel-token'),'token-b');assert.equal(net.connected,true);
 }finally{await net.leave();}
});
test('접속: 취소한 방 생성 요청의 늦은 응답은 붙이지 않고 떠나기, 다음 시도 가능',async()=>{
 const old=fakeRoom('old'),fresh=fakeRoom('fresh'),pending=deferred<Room>(),store=storage();let creates=0;
 const net=new Connection({client:{create:()=>++creates===1?pending.promise:Promise.resolve(fresh.room)} as unknown as Client,storage:store});
 try{
  const connecting=net.connect('create','A');const rejected=assert.rejects(connecting,/취소된 연결/);await net.leave();await net.connect('practice','A');pending.resolve(old.room);await rejected;
  assert.equal(old.fake.left,1);assert.equal(net.room,fresh.room);assert.equal(store.getItem('duel-token'),'token-fresh');
 }finally{await net.leave();}
});
test('접속: 실패한 옛 재접속/복원은 새 경기 토큰을 삭제하지 않음',async()=>{
 const pending=deferred<Room>(),fresh=fakeRoom('fresh'),store=storage();store.setItem('duel-token','old');
 const net=new Connection({client:{reconnect:()=>pending.promise,create:async()=>fresh.room} as unknown as Client,storage:store});
 try{
  const restoring=net.restore();await net.leave();await net.connect('practice','A');pending.reject(new Error('expired'));assert.equal(await restoring,false);assert.equal(store.getItem('duel-token'),'token-fresh');assert.equal(net.room,fresh.room);
 }finally{await net.leave();}
});
test('접속: 새 방 접속 실패 후 잠긴 이전 상태나 토큰 없이 다시 시도 가능',async()=>{
 const store=storage(),room=fakeRoom('fresh');let tries=0;const net=new Connection({client:{create:async()=>{if(++tries===1)throw new Error('unavailable');return room.room;}} as unknown as Client,storage:store});
 try{await assert.rejects(net.connect('practice','A'),/unavailable/);assert.equal(net.connected,false);assert.equal(net.room,null);assert.equal(net.hasSnapshot,false);assert.equal(store.getItem('duel-token'),null);await net.connect('practice','A');assert.equal(net.connected,true);}
 finally{await net.leave();}
});
test('접속: 현재 방 끊김은 자동 복구하며 본인 세션/토큰과 스냅샷 수신 유지',async()=>{
 const a=fakeRoom('a'),restored=fakeRoom('a-restored'),store=storage();const net=new Connection({client:{create:async()=>a.room,reconnect:async()=>restored.room} as unknown as Client,storage:store});let received=0;net.onSnapshot=()=>received++;
 try{await net.connect('practice','A');a.fake.drop();await new Promise(r=>setImmediate(r));assert.equal(net.room,restored.room);restored.fake.emit('snapshot',view());assert.equal(received,1);assert.equal(net.connected,true);assert.equal(store.getItem('duel-token'),'token-a-restored');}
 finally{await net.leave();}
});

test('접속: 응답 없는 열린 소켓은 복귀 시 재연결하고 중복 종료/옛 수신을 무시',async t=>{
 let now=100;t.mock.method(performance,'now',()=>now);
 const a=fakeRoom('a'),restored=fakeRoom('restored'),pending=deferred<Room>(),store=storage();let retries=0,received=0;
 const net=new Connection({client:{create:async()=>a.room,reconnect:()=>{retries++;return pending.promise;}} as unknown as Client,storage:store});net.onSnapshot=()=>received++;
 try{
  await net.connect('practice','A');a.fake.emit('snapshot',view());const gameNow=net.gameNow();
  now+=CONNECTION_STALE_MS+1;net.resume();a.fake.drop();net.resume();
  assert.equal(retries,1);assert.equal(a.fake.connection.closed,1);assert.equal(net.connected,false);assert.equal(net.hasSnapshot,true);assert.ok(net.gameNow()>gameNow);
  a.fake.emit('snapshot',view());assert.equal(received,1);
  pending.resolve(restored.room);await new Promise(r=>setImmediate(r));assert.equal(net.connected,true);assert.equal(net.room,restored.room);
  restored.fake.emit('snapshot',view());assert.equal(received,2);assert.equal(store.getItem('duel-token'),'token-restored');
 }finally{await net.leave();}
});

test('접속: 오래 열린 정상 연결은 최신 수신이 있으면 강제 종료하지 않음',async t=>{
 let now=0;t.mock.method(performance,'now',()=>now);const a=fakeRoom('a');let retries=0;
 const net=new Connection({client:{create:async()=>a.room,reconnect:async()=>{retries++;return a.room;}} as unknown as Client,storage:storage()});
 try{await net.connect('practice','A');now=91*60*1000;a.fake.emit('snapshot',view());net.resume();assert.equal(retries,0);assert.equal(a.fake.connection.closed,0);assert.equal(net.connected,true);}
 finally{await net.leave();}
});

test('접속: 일시 오류의 토큰을 유지하고 온라인 복귀가 재시도 대기를 즉시 깨움',async()=>{
 const a=fakeRoom('a'),restored=fakeRoom('restored'),store=storage();let retries=0;
 const net=new Connection({client:{create:async()=>a.room,reconnect:async()=>{if(++retries===1)throw new Error('offline');return restored.room;}} as unknown as Client,storage:store});
 try{await net.connect('practice','A');a.fake.drop();await new Promise(r=>setImmediate(r));assert.equal(store.getItem('duel-token'),'token-a');assert.equal(net.connected,false);net.resume();await new Promise(r=>setImmediate(r));assert.equal(retries,2);assert.equal(net.room,restored.room);assert.equal(net.connected,true);}
 finally{await net.leave();}
});

test('접속: 새로고침 복원 중 일시 오류도 재시도하며 새 경기 선택은 대기를 취소',async()=>{
 const fresh=fakeRoom('fresh'),store=storage();store.setItem('duel-token','old');let retries=0;
 const net=new Connection({client:{reconnect:async()=>{retries++;throw new Error('offline');},create:async()=>fresh.room} as unknown as Client,storage:store});
 try{const restoring=net.restore();await new Promise(r=>setImmediate(r));assert.equal(store.getItem('duel-token'),'old');await net.connect('practice','A');assert.equal(await restoring,false);assert.equal(retries,1);assert.equal(store.getItem('duel-token'),'token-fresh');assert.equal(net.room,fresh.room);}
 finally{await net.leave();}
});

test('접속: 삭제된 방은 반복 요청하지 않고 토큰과 한국어 안내 정리',async()=>{
 const store=storage();store.setItem('duel-token','gone');let retries=0,notice='';
 const net=new Connection({client:{reconnect:async()=>{retries++;throw Object.assign(new Error('disposed'),{code:4212});}} as unknown as Client,storage:store});net.onNotice=s=>notice=s;
 try{assert.equal(await net.restore(),false);net.resume();assert.equal(retries,1);assert.equal(store.getItem('duel-token'),null);assert.match(notice,/방이 이미 종료/);assert.equal(net.connected,false);}
 finally{await net.leave();}
});

test('접속: 서버의 명시적 종료는 재접속하지 않으며 끊긴 방 떠나기도 즉시 완료',async()=>{
 const a=fakeRoom('a'),store=storage();let retries=0;
 const net=new Connection({client:{create:async()=>a.room,reconnect:async()=>{retries++;return a.room;}} as unknown as Client,storage:store});
 await net.connect('practice','A');a.fake.drop(4000);assert.equal(retries,0);assert.equal(store.getItem('duel-token'),null);await net.leave();assert.equal(a.fake.left,0);
});

test('접속: 재접속 유예 만료와 소켓 종료 인계 후의 잘못된 토큰은 종료 처리',async t=>{
 let now=0;t.mock.method(performance,'now',()=>now);
 for(const code of [0,4214]){
  const store=storage();store.setItem('duel-token','old');let retries=0,notice='';const started=now;
  const net=new Connection({client:{reconnect:async()=>{retries++;throw Object.assign(new Error('unavailable'),{code});}} as unknown as Client,storage:store});net.onNotice=s=>notice=s;
  try{const restoring=net.restore();await new Promise(r=>setImmediate(r));now=started+(code?11_000:RECONNECT_GRACE_SECONDS*1000+1);net.resume();assert.equal(await restoring,false);assert.equal(retries,code?2:1);assert.equal(store.getItem('duel-token'),null);assert.match(notice,/만료|5분/);}
  finally{await net.leave();}
 }
});
