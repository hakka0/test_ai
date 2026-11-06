import {newTestPlayer as newPlayer} from "./fixtures";
import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch, prepare, startCombat, tick, applyAction, botSetup} from "../shared/engine";
import { COLS, MAX_ROUNDS } from '../shared/model';
import { basePlayerDamage, interestFor, stageFor, stageLabel, streakGold } from '../shared/match-rules';
import { EXPERIENCE_TO_NEXT, deploymentLimit } from '../shared/progression';
function setup() { const m = newMatch(); m.players = [newPlayer('a','A'),newPlayer('b','B')]; prepare(m, 0); return m; }
function win(m: ReturnType<typeof setup>, side: number, now: number) {
  m.players.forEach((p,i) => {p.units[0].x = i === side ? 0 : -1; p.units.slice(1).forEach(u => u.x = -1);});
  startCombat(m, now);
}
test('체력 100 생존: 3승 이후에도 계속, 패배 피해·0 이하 탈락', () => {
  const m = setup();
  for(let i=0;i<3;i++) {win(m,0,1000+i*10000); tick(m,m.deadline);}
  assert.equal(m.players[0].score,3); assert.equal(m.phase,'prepare');
  assert.equal(m.players[1].health,100-3*(basePlayerDamage(1)+1));
  m.players[1].health=1; win(m,0,40000); assert.equal(m.players[1].health,0);
  tick(m,m.deadline); assert.equal(m.phase,'finished'); assert.equal(m.winner,'a');
});
test('스테이지·피해 증가, 생존 유닛 피해는 3까지 제한', () => {
  assert.equal(stageLabel(1),'2-1'); assert.equal(stageLabel(5),'2-5'); assert.equal(stageLabel(6),'3-1');assert.equal(stageLabel(40),'9-5');
  assert.equal(stageFor(19),5); assert.ok(basePlayerDamage(25)>basePlayerDamage(1));
  for(let round=1;round<=MAX_ROUNDS;round++)assert.equal(basePlayerDamage(round),[1,2,3,4,6,8,12][Math.min(6,Math.floor((round-1)/6))],'five-round display groups preserve damage progression');
  const m=setup(),p=m.players[0];p.level=10; p.units.forEach((u,i)=>{u.x=i;u.y=0;});
  m.players[1].units.forEach(u=>u.x=-1); m.round=19;startCombat(m,1);
  assert.equal(m.players[1].health,100-basePlayerDamage(19)-3);
});
test('무승부·빈 전장·전투 시간 초과에도 체력 감소와 연속 기록 초기화', () => {
  const m=setup();m.players.forEach(p=>{p.streak='win';p.streakCount=5;p.units.forEach(u=>u.x=-1);});
  startCombat(m,1); assert.equal(m.winner,null);
  assert.ok(m.players.every(p=>p.health===99&&p.streakCount===0&&p.streak===null));
  const other=setup(); startCombat(other,1);
  other.fighters.forEach(f=>{f.nextAttack=Infinity;f.nextMove=Infinity;f.skills=[];});
  tick(other,other.deadline);assert.ok(other.overtime);tick(other,other.deadline);assert.match(other.result,/시간 초과/);assert.ok(other.players.every(p=>p.health===99));
});
test('이자·연승/연패 수입: 정확한 경계와 전투 시작 잔액 고정', () => {
  assert.deepEqual([0,9,10,49,50,100].map(interestFor),[0,0,1,4,5,5]);
  assert.deepEqual([0,1,2,3,4,5,6].map(streakGold),[0,0,1,1,2,3,3]);
  const m=setup(),p=m.players[0];p.gold=29;
  win(m,0,1000);assert.equal(p.gold,30);p.gold=50;
  tick(m,m.deadline);assert.equal(p.gold,57);assert.deepEqual(p.lastIncome,{base:5,interest:2,streak:0,total:7});
  win(m,0,20000);assert.equal(p.lastIncome.streak,1);assert.equal(m.players[1].lastIncome.streak,1);
  const once=p.gold;tick(m,m.deadline-1);assert.equal(p.gold,once);
  tick(m,m.deadline);assert.equal(p.lastIncome.interest,5);assert.equal(p.lastIncome.streak,0);
  assert.equal(m.players[1].lastIncome.streak,0);
});
test('최대 라운드 종료는 체력 우선·동률 승수·양쪽 0은 무승부', () => {
  const m=setup();m.phase='result';m.round=MAX_ROUNDS;m.deadline=1;
  m.players[0].health=20;m.players[1].health=30;m.players[0].score=99;
  tick(m,1);assert.equal(m.winner,'b');
  m.phase='result';m.players.forEach(p=>p.health=0);tick(m,1);assert.equal(m.winner,null);
  m.phase='result';m.players.forEach(p=>p.health=30);tick(m,1);assert.equal(m.winner,'a');
});
test('TFT 경험치 곡선, 최대 레벨 도달과 남은 경험치 처리', () => {
  assert.deepEqual(EXPERIENCE_TO_NEXT,[0,2,2,6,10,20,36,56,68,68]);
  const m=setup(),p=m.players[0];p.gold=300;
  for(let i=0;i<67;i++) assert.equal(applyAction(m,'a',{type:'buyExperience',revision:p.experienceRevision},1),null);
  assert.equal(p.level,10);assert.equal(p.experience,0);assert.equal(p.gold,32);
});
test('1~10레벨 봇 배치가 유효한 칸을 쓰고 실제 골드로 성장', () => {
  for(let level=1;level<=10;level++) {
    const p=newPlayer('practice-bot','Bot');p.level=level;p.gold=100;
    botSetup(p);
    const deployed=p.units.filter(u=>u.x>=0);
    assert.ok(deployed.length>0&&deployed.length<=deploymentLimit(p));
    assert.equal(new Set(deployed.map(u=>`${u.x},${u.y}`)).size,deployed.length);
    assert.ok(deployed.every(u=>u.x<COLS&&u.y>=0&&u.y<4));
    assert.ok(p.gold<100);
  }
});
