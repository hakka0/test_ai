import {newTestPlayer as newPlayer} from "./fixtures";
import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch, prepare, applyAction, startCombat, botSetup} from "../shared/engine";
import { acquireUnit } from '../shared/bench';
import { grantExperience, MAX_LEVEL, EXPERIENCE_TO_NEXT, EXPERIENCE_BUY_COST, ROUND_EXPERIENCE, deploymentLimit, deployedCount } from '../shared/progression';
function setup(){const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];prepare(m,0);return {m,p:m.players[0]};}
test('시작 1레벨/1명: 초과 배치 거부, 기존 유닛 이동과 빈자리 재사용',()=>{
 const {m,p}=setup();assert.equal(p.level,1);assert.equal(deploymentLimit(p),1);assert.equal(deployedCount(p),1);
 const extra=p.units[1];const before=structuredClone(p);
 assert.ok(applyAction(m,p.id,{type:'place',unitId:extra.id,x:0,y:0},1));assert.deepEqual(p,before);
 assert.equal(applyAction(m,p.id,{type:'place',unitId:p.units[0].id,x:0,y:0},1),null);
 assert.equal(applyAction(m,p.id,{type:'bench',unitId:p.units[0].id},1),null);
 assert.equal(applyAction(m,p.id,{type:'place',unitId:extra.id,x:1,y:0},1),null);assert.equal(deployedCount(p),1);
});
test('레벨 1~10 출전 정원, 10명까지만 배치 및 전투 참여',()=>{
 const {m,p}=setup();p.units=[];
 for(let level=1;level<=MAX_LEVEL;level++){
  p.level=level;assert.equal(deploymentLimit(p),level);
  const u=acquireUnit(p,'knight')!;u.rank=3;
  assert.equal(applyAction(m,p.id,{type:'place',unitId:u.id,x:(level-1)%6,y:Math.floor((level-1)/6)},1),null);
  const blocked=acquireUnit(p,'mage')!;const before=structuredClone(p);
  assert.ok(applyAction(m,p.id,{type:'place',unitId:blocked.id,x:5,y:2},1));assert.deepEqual(p,before);
  assert.equal(applyAction(m,p.id,{type:'sell',unitId:blocked.id},1),null);
 }
 startCombat(m,2);assert.equal(m.fighters.filter(f=>f.owner===p.id).length,10);
});
test('경험치 구매: 정확 차감·여분 유지·위조량 무시·중복 revision 거부',()=>{
 const {m,p}=setup();const action={type:'buyExperience',revision:p.experienceRevision,amount:999999,level:10,cost:0};
 assert.equal(applyAction(m,p.id,action,1),null);assert.equal(p.gold,10-EXPERIENCE_BUY_COST);assert.equal(p.level,3);assert.equal(p.experience,0);
 const before=structuredClone(p);assert.ok(applyAction(m,p.id,action,2));assert.deepEqual(p,before);
 assert.equal(applyAction(m,p.id,{type:'place',unitId:p.units[1].id,x:0,y:0},2),null);assert.equal(deployedCount(p),2);
});
test('충분한 경험치 여러 레벨 상승·10레벨 초과 방지·최대 레벨 추가 결제 금지',()=>{
 const {m,p}=setup();grantExperience(p,EXPERIENCE_TO_NEXT.slice(1).reduce((a,b)=>a+b,0)+100);
 assert.equal(p.level,10);assert.equal(p.experience,0);const before=structuredClone(p);
 assert.ok(applyAction(m,p.id,{type:'buyExperience',revision:p.experienceRevision},1));assert.deepEqual(p,before);
 grantExperience(p,4);assert.deepEqual(p,before);
});
test('골드 부족·준비 완료·마감·대기·경기 종료 경험치 구매 차단',()=>{
 const {m,p}=setup();const action={type:'buyExperience',revision:p.experienceRevision};
 p.gold=3;const before=structuredClone(p);assert.ok(applyAction(m,p.id,action,1));assert.deepEqual(p,before);
 p.gold=10;p.ready=true;assert.ok(applyAction(m,p.id,action,1));p.ready=false;
 assert.ok(applyAction(m,p.id,action,m.deadline));for(const phase of ['waiting','finished'] as const){m.phase=phase;assert.ok(applyAction(m,p.id,action,1));}assert.equal(p.gold,10);assert.equal(p.level,1);
});
test('다음 라운드 경험치 자동 지급과 봇 한도 준수',()=>{
 const {m,p}=setup();assert.equal(p.experience,0);assert.equal(p.level,1);
 prepare(m,100);assert.equal(p.level,2);assert.equal(p.experience,ROUND_EXPERIENCE-EXPERIENCE_TO_NEXT[1]);
 const bot=newPlayer('practice-bot','Bot');botSetup(bot);assert.equal(deployedCount(bot),1);
 bot.level=2;botSetup(bot);assert.equal(deployedCount(bot),2);assert.equal(bot.units.filter(u=>u.x<0)[0].benchSlot,0);
});
