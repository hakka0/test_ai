import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch,newPlayer,prepare,startCombat,tick,applyAction,botSetup} from '../shared/engine';
import {practicePairs} from '../shared/bot-practice';
import {newTestPlayer} from './fixtures';
import {snapshotFor} from '../shared/snapshot';
import {battleBoard,opponentFor} from '../client/scouting';
import {roundSummary} from '../client/history';
import {GameClock} from '../shared/game-time';
import {DebugSession} from '../server/debug';
import {canClaimUnit,remainingCopies,unitCopies,UNIT_POOL_SIZE} from '../shared/unit-pool';
import {UNIT_KINDS} from '../shared/catalog';
import {contributionGroups} from '../client/contributions';

function setup(){const m=newMatch('botPractice');m.players=Array.from({length:6},(_,i)=>newTestPlayer(`p${i}`,`P${i}`));prepare(m,0);return m;}
function finishPairs(m:ReturnType<typeof setup>){for(const b of m.pvpBattles!)for(const f of m.fighters)if(f.owner===b.players[1])f.hp=0;tick(m,m.lastTick+100);}

test('6인 순환 매칭: 5회 동안 중복 없이 모든 상대와 1:1, 매 회 세 쌍',()=>{
 const m=setup(),seen=new Map(m.players.map(p=>[p.id,new Set<string>()]));
 for(let r=0;r<5;r++){
  const pairs=practicePairs(m.players,r);assert.equal(pairs.length,3);assert.equal(new Set(pairs.flatMap(b=>b.players)).size,6);
  for(const b of pairs)for(const id of b.players){const other=b.players.find(p=>p!==id)!;assert.ok(!seen.get(id)!.has(other));seen.get(id)!.add(other);}
 }
 assert.ok([...seen.values()].every(s=>s.size===5));
});
test('서로 다른 전장 사이 공격/스킬 간섭 없이 먼저 끝난 전장만 정지',()=>{
 const m=setup();startCombat(m,1);assert.equal(new Set(m.fighters.map(f=>f.arena)).size,3);
 for(const f of m.fighters){f.skills=[];f.nextAttack=Infinity;f.nextMove=Infinity;}
 const first=m.pvpBattles![0];m.fighters.find(f=>f.owner===first.players[1])!.hp=0;
 const untouched=structuredClone(m.fighters.filter(f=>f.arena!==first.arena));tick(m,101);
 assert.equal(m.phase,'combat');assert.ok(first.results);assert.ok(m.fighters.filter(f=>f.arena===first.arena).every(f=>f.inactive));
 assert.deepEqual(m.fighters.filter(f=>f.arena!==first.arena),untouched);
 for(const b of m.pvpBattles!.slice(1))m.fighters.find(f=>f.owner===b.players[1])!.hp=0;tick(m,201);
 assert.equal(m.phase,'result');assert.equal(m.roundHistory.length,1);assert.equal(m.roundHistory[0].players.length,6);
});
test('각 쌍의 체력/승리/연속 보상과 실제 상대 기록, 여섯 시점 관전',()=>{
 const m=setup();m.players.forEach(p=>{p.streak='win';p.streakCount=1;});startCombat(m,1);finishPairs(m);
 const snap=snapshotFor(m,'p0',1,'TEST');assert.equal(snap.battlePairs?.length,3);
 for(const b of m.pvpBattles!){
  const win=m.players.find(p=>p.id===b.players[0])!,lose=m.players.find(p=>p.id===b.players[1])!;
  assert.equal(win.health,100);assert.equal(win.score,1);assert.equal(win.lastIncome.streak,1);assert.ok(lose.health<100);assert.equal(lose.score,0);
  for(const id of b.players){const view=battleBoard(snap,id);assert.deepEqual(view.players.map(p=>p.id),b.players);assert.ok(view.fighters.every(f=>b.players.includes(f.owner)));assert.equal(opponentFor(snap,id)?.id,b.players.find(p=>p!==id));}
  assert.match(roundSummary(m.roundHistory[0],win.id),new RegExp(`상대 체력 −${100-lose.health}`));
 }
});
test('준비/매칭의 배치는 공개하고 대전 쌍은 비공개, 준비 완료 후 5초 매칭',()=>{
 const m=setup();m.players.slice(1).forEach(p=>p.ready=true);
 assert.equal(applyAction(m,'p0',{type:'ready'},1),null);assert.equal(m.phase,'matching');assert.equal(m.deadline,5001);
 const hidden=snapshotFor(m,'p0',1,'TEST');assert.deepEqual(hidden.battlePairs,[]);assert.ok(hidden.players.slice(1).every(p=>p.visibility==='opponent'&&p.rosterVisible&&p.units.length&&p.bench.length));
 tick(m,m.deadline);assert.equal(m.phase,'combat');assert.equal(snapshotFor(m,'p0',5001,'TEST').battlePairs?.length,3);
});
test('한 명 탈락해도 계속 진행, 공유 풀 반환, 홀수 생존자 한 명은 체력 유지',()=>{
 const m=setup();m.players[5].health=1;
 const item=m.players[5].inventory[0];item.unitId=m.players[5].units[0].id;m.players[5].units[0].equipment.push(item.id);
 startCombat(m,1);
 const pair=m.pvpBattles!.find(b=>b.players.includes('p5'))!,dead='p5',kind=m.players[5].units[0].kind;
 for(const b of m.pvpBattles!)for(const f of m.fighters)if(f.owner===(b===pair?dead:b.players[1]))f.hp=0;
 tick(m,101);assert.equal(m.players[5].health,0);assert.equal(m.players[5].units.length,0);assert.ok(remainingCopies(m.players,kind)>0);
 assert.ok(snapshotFor(m,'p0',101,'TEST').players.find(p=>p.id==='p5')!.inventory.some(i=>i.id===item.id));
 tick(m,m.deadline);assert.equal(m.phase,'prepare');assert.equal(m.players[5].shop.length,0);assert.match(applyAction(m,dead,{type:'ready'},m.deadline-1)!,/탈락/);
 startCombat(m,m.deadline-1);assert.equal(m.pvpBattles!.length,2);finishPairs(m);
 const bye=m.roundHistory.at(-1)!.players.find(p=>p.bye)!;assert.ok(bye);assert.equal(bye.damage,0);assert.match(roundSummary(m.roundHistory.at(-1)!,bye.id),/부전승/);
 assert.match(contributionGroups(m.roundHistory.at(-1)!,bye.id,'damageDealt','opponent'),/출전 0명/);
 assert.ok(!m.roundHistory.at(-1)!.players.some(p=>p.id===dead));
});
test('시간 초과는 각 미결 전장만 무승부, 마지막 생존자에서 최종 종료',()=>{
 const m=setup();startCombat(m,1);for(const f of m.fighters){f.skills=[];f.nextAttack=Infinity;f.nextMove=Infinity;}
 tick(m,m.deadline);assert.equal(m.phase,'combat');assert.ok(m.overtime);tick(m,m.deadline);assert.equal(m.phase,'result');assert.ok(m.roundHistory[0].players.every(p=>p.outcome==='draw'&&p.damage>0));
 m.players.forEach((p,i)=>p.health=i===3?45:0);tick(m,m.deadline);assert.equal(m.phase,'finished');assert.equal(m.winner,'p3');
});
test('6명 프리셋/저장/복원은 모드, 봇, 전장 분리와 결과를 보존',()=>{
 const m=setup();m.players.slice(1).forEach(p=>p.bot=true);const d=new DebugSession(),clock=new GameClock(100);
 assert.equal(d.apply(m,clock,{type:'preset',preset:'mid'},100),null);assert.equal(m.mode,'botPractice');assert.equal(m.players.filter(p=>p.bot).length,5);assert.ok(m.players.slice(1).every(p=>p.ready&&p.gold===50));
 for(const p of m.players)for(const offer of p.shop)assert.ok(canClaimUnit(p,offer.kind,m.players,{offerId:offer.id}));
 startCombat(m,100);d.apply(m,clock,{type:'save'},100);const saved=structuredClone(m);finishPairs(m);d.apply(m,clock,{type:'load'},100);assert.deepEqual(m,saved);assert.equal(clock.paused,true);
});
test('봇은 실제 골드로 구매/레벨업/장착, 도입부 미니언전도 여섯 전장',()=>{
 const m=setup(),p=m.players[1];p.bot=true;p.gold=35;const before=p.gold;botSetup(p,m.players);assert.ok(p.gold<before);assert.ok(p.units.some(u=>u.x>=0));assert.ok(p.inventory.some(i=>i.unitId));
 m.minionRounds=3;m.round=0;prepare(m,1);assert.equal(m.minionBattles?.length,6);startCombat(m,2);assert.equal(new Set(m.fighters.map(f=>f.arena)).size,6);assert.equal(m.pvpBattles,undefined);
});
test('보통 시작 상태로 6인 경기 완주: 모든 라운드 공유 풀/골드/칸 중복과 이벤트 격리 유지',()=>{
 for(let game=0;game<3;game++){
  const m=newMatch('botPractice',3);m.players=Array.from({length:6},(_,i)=>({...newPlayer(`p${i}`,`P${i}`),bot:true,shop:[]}));prepare(m,0);
  let transitions=0;
  while(m.phase!=='finished'&&transitions++<200){
   if(m.phase==='combat'){
    while(m.phase==='combat')tick(m,Math.min(m.deadline,m.lastTick+1000));
    const arenas=new Map(m.fighters.map(f=>[f.id,f.arena]));
    for(const e of m.events)assert.equal(arenas.get(e.source),arenas.get(e.target));
   }else tick(m,m.deadline);
   for(const p of m.players){assert.ok(p.gold>=0);const cells=p.units.filter(u=>u.x>=0).map(u=>`${u.x},${u.y}`);assert.equal(cells.length,new Set(cells).size);}
   for(const kind of UNIT_KINDS){
    const used=m.players.reduce((sum,p)=>sum+p.units.filter(u=>u.kind===kind).reduce((n,u)=>n+unitCopies(u.rank),0)+p.shop.filter(o=>!o.sold&&o.kind===kind).length+(p.pendingReward?.options.filter(o=>o.type==='unit'&&o.kind===kind).length??0),0);
    assert.ok(used<=UNIT_POOL_SIZE,`${kind}: ${used} reserved`);
   }
  }
  assert.equal(m.phase,'finished');assert.ok(m.round<=40);assert.ok(m.players.filter(p=>p.health>0).length<=1||m.round===40);
 }
});
