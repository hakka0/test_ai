import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {Client} from 'colyseus.js';
import type {Snapshot,SelfPlayerSnapshot} from '../shared/model';
import {Connection} from '../client/net';
import {finalResult,FinalResultState} from '../client/results';
import {stageLabel} from '../shared/match-rules';
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const own=(s:Snapshot)=>s.players.find((p):p is SelfPlayerSnapshot=>p.visibility==='self')!;
function storage(){const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};}
function izuna(net:Connection){
 const subscribers=new Set<(s:Snapshot)=>void>();net.onSnapshot=s=>{for(const cb of subscribers)cb(s);};
 return (predicate:(s:Snapshot)=>boolean):Promise<Snapshot>=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{subscribers.delete(cb);reject(new Error('snapshot timeout'));},6000);
  const cb=(s:Snapshot)=>{if(predicate(s)){clearTimeout(timer);subscribers.delete(cb);resolve(s);}};subscribers.add(cb);
 });
}
async function boot(port:number){const proc=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:String(port),DEBUG_GAME:'1',NODE_ENV:'development'},stdio:'pipe'});for(let i=0;i<60;i++){try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok)return proc;}catch{}await wait(100);}proc.kill();throw new Error('server unavailable');}
test('실제 서버/클라이언트: 연습 경기 최종 결과·재접속·저장 복원·다시 플레이·로비 후 재시작', {timeout:30000},async()=>{
 const port=2593,proc=await boot(port),store=storage(),net=new Connection({client:new Client(`http://127.0.0.1:${port}`),storage:store}),state=izuna(net);
 try{
  let pending=state(s=>s.phase==='prepare');await net.connect('practice','결과 검사');let s=await pending;assert.equal(s.mode,'practice');const oldId=s.roomId;
  pending=state(s=>s.timeScale===0);net.debug({type:'pause',paused:true});s=await pending;
  pending=state(s=>own(s).units.length===3);net.debug({type:'preset',preset:'early'});s=await pending;
  for(let i=0;i<40&&s.phase!=='finished';i++){
   pending=state(s=>s.phase==='combat');net.debug({type:'nextPhase'});await pending;
   pending=state(s=>s.phase==='result');net.debug({type:'nextPhase'});await pending;
   pending=state(s=>s.phase==='prepare'||s.phase==='finished');net.debug({type:'nextPhase'});s=await pending;
  }
  assert.equal(s.phase,'finished');assert.equal(s.deadline,0);assert.ok(s.roundHistory.length>0);const summary=finalResult(s,net.room!.sessionId)!;
  assert.equal(summary.stage,stageLabel(s.round));assert.equal(summary.completedRounds,s.roundHistory.length);assert.equal(summary.players[0].health,own(s).health);assert.equal(summary.replayMode,'practice');assert.ok(s.endReason==='elimination'||s.endReason==='roundLimit');
  const ui=new FinalResultState();assert.equal(ui.observe(s,net.room!.sessionId),true);assert.equal(ui.observe(s,net.room!.sessionId),false);
  const history=structuredClone(s.roundHistory),oldRoom=net.room!,oldSelf=net.room!.sessionId;
  pending=state(s=>net.room!==oldRoom&&s.phase==='finished'&&own(s).connected);oldRoom.connection.close();s=await pending;
  assert.equal(net.room!.sessionId,oldSelf);assert.deepEqual(finalResult(s,oldSelf),summary);assert.deepEqual(s.roundHistory,history);assert.equal(ui.observe(s,oldSelf),false);
  pending=state(s=>!!s.debug?.hasCheckpoint);net.debug({type:'save'});await pending;
  pending=state(s=>s.phase==='prepare'&&s.round===19);net.debug({type:'preset',preset:'late'});s=await pending;assert.equal(s.endReason,null);assert.equal(finalResult(s,oldSelf),null);
  pending=state(s=>s.phase==='finished');net.debug({type:'load'});s=await pending;assert.deepEqual(finalResult(s,oldSelf),summary);assert.deepEqual(s.roundHistory,history);
  await net.leave();assert.equal(net.hasSnapshot,false);assert.equal(store.getItem('duel-token'),null);
  pending=state(s=>s.phase==='prepare');await net.connect(summary.replayMode,summary.players[0].name);s=await pending;
  assert.notEqual(s.roomId,oldId);assert.equal(s.round,1);assert.equal(s.endReason,null);assert.equal(s.mode,'practice');assert.deepEqual(s.roundHistory,[]);assert.equal(own(s).health,100);assert.equal(own(s).score,0);assert.equal(own(s).name,'결과 검사');assert.equal(finalResult(s,net.room!.sessionId),null);
  await net.leave();assert.equal(store.getItem('duel-token'),null);pending=state(s=>s.phase==='waiting');await net.connect('create','결과 검사');s=await pending;assert.equal(s.mode,'duel');assert.equal(s.round,0);assert.deepEqual(s.roundHistory,[]);
 }finally{await net.leave();proc.kill('SIGTERM');}
});
test('실제 2인 서버/클라이언트: 연결 종료 최종 승패·미완료 기록 제외·새 방에서 친구와 재시작', {timeout:20000},async()=>{
 const port=2594,proc=await boot(port),url=`http://127.0.0.1:${port}`,a=new Connection({client:new Client(url),storage:storage()}),b=new Connection({client:new Client(url),storage:storage()}),sa=izuna(a),sb=izuna(b);
 try{
  let pending=sa(s=>s.phase==='waiting');await a.connect('create','친구 A');let s=await pending;const oldId=s.roomId;
  const pa=sa(s=>s.phase==='prepare'),pb=sb(s=>s.phase==='prepare');await b.connect('join','친구 B',oldId);const [x,y]=await Promise.all([pa,pb]);const bId=b.room!.sessionId;assert.equal(x.mode,'duel');assert.equal(y.mode,'duel');assert.ok(!x.debug);
  pending=sa(s=>s.phase==='finished');await b.leave();s=await pending;assert.equal(s.endReason,'disconnect');assert.equal(s.winner,a.room!.sessionId);assert.equal(s.deadline,0);assert.deepEqual(s.roundHistory,[]);
  const result=finalResult(s,a.room!.sessionId)!;assert.equal(result.title,'최종 승리');assert.equal(result.canReview,false);assert.equal(result.completedRounds,0);assert.equal(result.replayMode,'create');assert.equal(finalResult(s,bId)!.title,'최종 패배');
  assert.ok(result.players.every(p=>p.health===100));const oldWinner=s.winner;
  const next=sa(s=>s.phase==='finished');a.send({type:'ready'});s=await next;assert.equal(s.winner,oldWinner);assert.equal(s.endReason,'disconnect');
  await a.leave();pending=sa(s=>s.phase==='waiting');await a.connect(result.replayMode,result.players[0].name);s=await pending;assert.notEqual(s.roomId,oldId);const newId=s.roomId;
  const qa=sa(s=>s.phase==='prepare'),qb=sb(s=>s.phase==='prepare');await b.connect('join','친구 B',newId);const [freshA,freshB]=await Promise.all([qa,qb]);
  assert.deepEqual(freshA.roundHistory,[]);assert.deepEqual(freshB.roundHistory,[]);assert.equal(freshA.endReason,null);assert.equal(freshA.mode,'duel');assert.equal(own(freshA).name,'친구 A');assert.equal(own(freshB).name,'친구 B');assert.equal(own(freshA).score,0);assert.equal(own(freshB).health,100);
 }finally{await a.leave();await b.leave();proc.kill('SIGTERM');}
});
