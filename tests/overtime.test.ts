import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch,startCombat,tick,prepare} from '../shared/engine';
import {newTestPlayer,neutralDamage} from './fixtures';
import {COMBAT_MS,OVERTIME_MS} from '../shared/model';
import {overtimeModifiers} from '../shared/overtime';
import {combatStats,SkillSystem,createSkillStates} from '../shared/skills';
import type {SkillDefinition} from '../shared/skill-types';
import {snapshotFor} from '../shared/snapshot';
import {advanceMatch,GameClock} from '../shared/game-time';
import {DebugSession} from '../server/debug';

function fixture(){const m=newMatch('practice');m.players=[newTestPlayer('a','A'),newTestPlayer('b','B')];startCombat(m,1000);for(const f of m.fighters){f.skills=[];f.nextAttack=Infinity;f.nextMove=Infinity;}return m;}
test('일반 20초 → 피버 15초 → 시간 초과: 정확한 경계, 스냅샷, 다음 준비 초기화',()=>{
 const m=fixture(),start=m.combatStartedAt;assert.equal(COMBAT_MS,20000);assert.equal(OVERTIME_MS,15000);assert.equal(m.deadline,start+20000);
 tick(m,start+19999);assert.equal(m.overtime,false);tick(m,start+20000);assert.equal(m.phase,'combat');assert.equal(m.overtime,true);assert.equal(m.deadline,start+35000);assert.ok(m.fighters.every(f=>f.overtimeAt===start+20000));
 assert.equal(snapshotFor(m,'a',0,'TEST').overtime,true);assert.ok(!('overtimeAt'in snapshotFor(m,'a',0,'TEST').fighters[0]));
 tick(m,start+34999);assert.equal(m.phase,'combat');tick(m,start+35000);assert.equal(m.phase,'result');assert.equal(m.roundHistory[0].reason,'timeout');assert.ok(m.players.every(p=>p.health===99));
 const hp=m.players.map(p=>p.health);tick(m,m.deadline-1);assert.deepEqual(m.players.map(p=>p.health),hp);tick(m,m.deadline);assert.equal(m.phase,'prepare');assert.equal(m.overtime,false);
});
test('큰 게임 시간 이동도 피버 구간을 건너뛰지 않고 일반 35초 진행과 같은 결과',()=>{
 const a=fixture(),b=structuredClone(a);for(let t=1100;t<=36000;t+=100)tick(a,t);advanceMatch(b,36000);assert.deepEqual(b,a);
});
test('매초 공격 속도/피해 강화와 회복/보호막 70% 감소 상한, 기존 능력치는 보존',()=>{
 const m=fixture(),[f,t]=m.fighters;neutralDamage(f,t);f.stats.attack=100;t.hp=t.maxHp=10000;const original=structuredClone(f.stats);
 assert.equal(new SkillSystem(m,19999).damage(f,t,100,'basic'),100);
 f.overtimeAt=t.overtimeAt=20000;
 assert.equal(new SkillSystem(m,20000).damage(f,t,100,'basic'),110);assert.equal(new SkillSystem(m,21000).damage(f,t,100,'skill'),121);
 assert.ok(Math.abs(combatStats(f,21000).stats.interval-original.interval/1.21)<1e-6);assert.equal(combatStats(f,21000).stats.moveMs,original.moveMs/1.5);assert.deepEqual(f.stats,original);
 assert.equal(overtimeModifiers(20000,19000).power,1);assert.equal(overtimeModifiers(20000,26000).recovery,.3);assert.equal(overtimeModifiers(20000,35000).stacks,15);
 const d:SkillDefinition={id:'recovery',name:'회복 시험',description:'',kind:'active',triggers:[{on:'battleStart'}],cooldownMs:0,target:{kind:'self'},effects:[{type:'heal',amount:100},{type:'shield',amount:100}],activation:{mode:'instant',spend:0}};
 for(const [at,expected] of [[21000,80],[26000,30]]){
  f.hp=100;f.maxHp=1000;f.shield=0;f.skills=createSkillStates(f.kind,at,{recovery:d},['recovery']);new SkillSystem(m,at,{recovery:d}).begin();assert.equal(f.hp,100+expected);assert.equal(f.shield,expected);
 }
});
test('피버 저장·복원은 시계/배율/타이머를 재현하고 프리셋은 초기화',()=>{
 const m=fixture(),clock=new GameClock(1000),d=new DebugSession();tick(m,21000);clock.seek(21000,1000);d.apply(m,clock,{type:'save'},1000);const saved=structuredClone(m);
 tick(m,22000);d.apply(m,clock,{type:'load'},1000);assert.deepEqual(m,saved);assert.equal(clock.now,21000);assert.equal(clock.paused,true);
 d.apply(m,clock,{type:'preset',preset:'mid'},1000);assert.equal(m.overtime,false);assert.ok(m.fighters.every(f=>f.overtimeAt===undefined));
});
test('두 유저 체력은 전투 종료 순간 감소하고 6초 결과 중/다음 준비에서 중복되지 않음',()=>{
 const m=fixture();m.fighters[1].hp=0;tick(m,1100);assert.equal(m.phase,'result');const hp=m.players[1].health;assert.ok(hp<100);const s=snapshotFor(m,'b',1100,'TEST');assert.equal(s.players[1].health,hp);assert.ok(s.gameNow<s.deadline);
 tick(m,m.deadline-1);assert.equal(m.players[1].health,hp);tick(m,m.deadline);assert.equal(m.players[1].health,hp);
});
test('6인에서 먼저 끝난 쌍의 체력은 다른 두 전장이 전투 중일 때 즉시 공개',()=>{
 const m=fixture();m.mode='botPractice';m.players.push(...Array.from({length:4},(_,i)=>newTestPlayer(`p${i}`,`P${i}`)));prepare(m,0);startCombat(m,1000);
 for(const f of m.fighters){f.skills=[];f.nextAttack=Infinity;f.nextMove=Infinity;}
 const pair=m.pvpBattles![0],loser=pair.players[1];m.fighters.find(f=>f.owner===loser)!.hp=0;tick(m,1100);assert.equal(m.phase,'combat');assert.ok(pair.results);assert.ok(snapshotFor(m,'a',1100,'TEST').players.find(p=>p.id===loser)!.health<100);
 const done=structuredClone(m.fighters.filter(f=>f.arena===pair.arena));tick(m,21000);assert.ok(m.overtime);assert.deepEqual(m.fighters.filter(f=>f.arena===pair.arena),done);
});
