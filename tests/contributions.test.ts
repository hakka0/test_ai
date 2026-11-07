import {newTestPlayer as newPlayer, neutralDamage} from "./fixtures";
import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch, prepare, startCombat, tick, applyAction} from "../shared/engine";
import {SkillSystem,createSkillStates} from '../shared/skills';
import type {SkillDefinition} from '../shared/skill-types';
import {snapshotFor} from '../shared/snapshot';
import {acquireUnit} from '../shared/bench';
import {refreshShop} from '../shared/shop';
import {contributionGroups} from '../client/contributions';
import {DebugSession} from '../server/debug';
import {GameClock} from '../shared/game-time';
const zero=()=>({damageDealt:0,damageTaken:0,healing:0,shieldBlocked:0});
function fixture(){
 const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];prepare(m,0);startCombat(m,1);
 const [f,t]=m.fighters;for(const u of m.fighters){u.skills=[];u.buffs=[];u.shield=0;u.hp=u.maxHp=100;}
 neutralDamage(f,t);
 return {m,f,t,at:(now=100)=>new SkillSystem(m,now)};
}
function passive(patch:Partial<SkillDefinition>={}):SkillDefinition{
 return {id:'test',name:'Test',description:'Test',kind:'passive',triggers:[{on:'battleStart'}],cooldownMs:0,
  target:{kind:'self'},effects:[],activation:{mode:'instant'},...patch};
}
function skillFixture(d:SkillDefinition){
 const base=fixture(),defs={[d.id]:d};base.f.skills=createSkillStates(base.f.kind,1,defs,[d.id]);
 return {...base,defs,at:(now=100)=>new SkillSystem(base.m,now,defs)};
}
test('기여도: 기본 공격의 보호막 흡수·실제 HP 피해·초과 피해 제외·사망 후 추가 집계 없음',()=>{
 const {f,t,at}=fixture();f.stats.attack=20;t.hp=25;t.shield=30;
 for(const n of [100,200,300,400])at(n).basicAttack(f,t);
 assert.deepEqual(f.contribution,{...zero(),damageDealt:25});
 assert.deepEqual(t.contribution,{...zero(),damageTaken:25,shieldBlocked:30});assert.equal(t.hp,0);assert.equal(t.shield,0);
});
test('기여도: 스킬의 피해 감소는 보호막 방어에 미포함, 실제 보호막과 남은 체력만 집계',()=>{
 const {f,t,at}=fixture();t.buffs=[{key:'reduction',source:t.id,skillId:'buff',expiresAt:1000,modifiers:{damageTakenMultiplier:0.5}}];t.hp=9;t.shield=7;
 assert.equal(at().damage(f,t,100,'skill','spell'),9);
 assert.deepEqual(f.contribution,{...zero(),damageDealt:9});assert.deepEqual(t.contribution,{...zero(),damageTaken:9,shieldBlocked:7});
});
test('기여도: 보호막 부여 자체는 0, 실제 흡수량은 보호받은 유닛에 귀속',()=>{
 const {f,t,at}=skillFixture(passive({effects:[{type:'shield',amount:55}]}));at().begin();
 assert.equal(f.shield,55);assert.deepEqual(f.contribution,zero());
 at(200).damage(t,f,35,'skill','spell');assert.equal(f.contribution.shieldBlocked,35);assert.equal(f.contribution.damageTaken,0);assert.equal(t.contribution.damageDealt,0);assert.equal(f.shield,20);
});
test('기여도: 아군 유효 회복만 시전자에 귀속, 소수량 보존·과잉 회복 제외',()=>{
 const {m,f,at}=skillFixture(passive({target:{kind:'lowestHealthAlly'},effects:[{type:'heal',amount:20}]}));
 const ally=structuredClone(f);ally.id='ally';ally.skills=[];ally.hp=95.5;m.fighters.push(ally);
 at().begin();assert.equal(ally.hp,100);assert.equal(f.contribution.healing,4.5);assert.equal(ally.contribution.healing,0);
 at(200).begin();assert.equal(f.contribution.healing,4.5);
});
test('기여도: 범위 스킬은 각 적의 실제 피해 합계, 사망한 적은 제외',()=>{
 const {m,f,t,at}=skillFixture(passive({target:{kind:'allEnemies'},effects:[{type:'damage',amount:30}]}));
 const other=structuredClone(t);other.id='other';other.hp=10;other.shield=5;const dead=structuredClone(t);dead.id='dead';dead.hp=0;m.fighters.push(other,dead);
 at().begin();assert.equal(f.contribution.damageDealt,40);assert.equal(t.contribution.damageTaken,30);assert.equal(other.contribution.damageTaken,10);assert.equal(other.contribution.shieldBlocked,5);assert.deepEqual(dead.contribution,zero());
});
test('기여도: 지속 치유·자기 회복 펄스 합산, 고갈 이후 추가 집계 없음',()=>{
 const {f,at}=skillFixture(passive({kind:'active',resource:{max:100,initial:100},activation:{mode:'sustain',drainPerSecond:25,modifiers:{},pulse:{everyMs:1000,effects:[{type:'heal',amount:5}]}}}));
 f.hp=90;at(1).begin();for(const n of [1001,2001,3001,4001,5001])at(n).advance();
 assert.equal(f.hp,100);assert.equal(f.contribution.healing,10);assert.equal(f.skills[0].active,false);
});
test('기여도: 이벤트 80개 제한과 무관하게 누적하며 전투 시작마다 독립된 0으로 초기화',()=>{
 const {m,f,t,at}=fixture();t.hp=t.maxHp=1000;for(let i=1;i<=120;i++)at(i*100).damage(f,t,1,'skill','spell');
 assert.equal(m.events.length,80);assert.equal(f.contribution.damageDealt,120);assert.equal(t.contribution.damageTaken,120);
 prepare(m,20000);startCombat(m,20001);assert.ok(m.fighters.every(u=>JSON.stringify(u.contribution)===JSON.stringify(zero())));assert.notEqual(m.fighters[0].contribution,m.fighters[1].contribution);
});
test('기여도: 전투 중 합성 보류 후 원래 참가자·사망 기록, 대기석 제외 및 과거 값 고정',()=>{
 const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];prepare(m,0);const p=m.players[0];p.level=3;
 const extra=acquireUnit(p,'yuuka')!;assert.equal(applyAction(m,p.id,{type:'place',unitId:extra.id,x:3,y:1},1),null);
 const reserve=acquireUnit(p,'shiroko')!;refreshShop(p,()=>0);startCombat(m,2);const ids=m.fighters.map(f=>f.id),f=m.fighters[0],t=m.fighters.find(f=>f.owner==='b')!;
 m.fighters.forEach(f=>{f.skills=[];});new SkillSystem(m,3).damage(f,t,5,'basic');
 assert.equal(applyAction(m,p.id,{type:'buy',offerId:p.shop[0].id,revision:p.shopRevision},3),null);assert.equal(p.units[0].rank,1);assert.ok(p.units.some(u=>u.id===extra.id));
 new SkillSystem(m,4).damage(f,t,99999,'basic');tick(m,102);const r=m.roundHistory[0];assert.deepEqual(r.units.map(u=>u.id),ids);
 assert.equal(r.units.find(u=>u.id===extra.id)!.rank,1);assert.equal(r.units.find(u=>u.id===f.id)!.rank,1);assert.ok(!r.units.some(u=>u.id===reserve.id));assert.ok(r.units.some(u=>u.id===t.id&&u.damageTaken===t.maxHp));
 const original=structuredClone(r);f.contribution.damageDealt=999;t.contribution.damageTaken=888;prepare(m,20000);startCombat(m,20001);assert.deepEqual(m.roundHistory[0],original);assert.equal(m.fighters[0].rank,2);
});
test('기여도: 완료 기록은 양측 동일한 허용 목록과 깊은 복사, 현재 전투/대기석 내부 값 미공개',()=>{
 const {m,f,t,at}=fixture();const reserve=acquireUnit(m.players[0],'shiroko')!;at().damage(f,t,999,'skill');tick(m,101);
 Object.assign(m.roundHistory[0].units[0],{futurePrivate:'SECRET',equipment:['PRIVATE']});Object.assign(f.contribution,{privateFuture:'SECRET'});
 const before=structuredClone(m),a=snapshotFor(m,'a',102,'room'),b=snapshotFor(m,'b',102,'room');assert.deepEqual(a.roundHistory,b.roundHistory);
 assert.deepEqual(Object.keys(a.roundHistory[0].units[0]).sort(),['id','owner','kind','rank','damageDealt','damageTaken','healing','shieldBlocked'].sort());
 assert.ok(!JSON.stringify(a.roundHistory).includes('SECRET'));assert.ok(!JSON.stringify(a.roundHistory).includes(reserve.id));assert.ok(!('contribution'in a.fighters[0]));
 a.roundHistory[0].units[0].healing=999;a.roundHistory[0].units.pop();assert.deepEqual(m,before);
});
test('기여도: 전투 중 체크포인트 복원 시 누적 값 복원, 같은 진행으로 동일한 최종 기여도 재현',()=>{
 const {m,f,t,at}=fixture(),debug=new DebugSession(),clock=new GameClock(1000);at().damage(f,t,10,'skill');debug.apply(m,clock,{type:'save'},1000);
 at(200).damage(f,t,999,'skill');tick(m,201);const record=structuredClone(m.roundHistory[0]);debug.apply(m,clock,{type:'load'},1000);
 assert.equal(m.fighters[0].contribution.damageDealt,10);assert.equal(m.roundHistory.length,0);
 new SkillSystem(m,200).damage(m.fighters[0],m.fighters[1],999,'skill');tick(m,201);assert.deepEqual(m.roundHistory[0],record);
});
test('기여도 그래프: 진영 선택·피해순·중복 종류 개별 행·강화·소수/천 단위·미출전 안내',()=>{
 const {m,f,t,at}=fixture();at().damage(f,t,999,'skill');tick(m,101);const r=m.roundHistory[0];r.units[0].damageDealt=1234.5;r.units[0].healing=4.5;r.units[0].rank=2;
 r.units.push({...r.units[0],id:'copy',damageDealt:2,rank:1});const before=structuredClone(r),markup=contributionGroups(r,'a');
 assert.equal((markup.match(/data-contribution-unit=/g)||[]).length,2);assert.equal((markup.match(/data-contribution-metric="damageDealt"/g)||[]).length,2);
 assert.ok(markup.includes('아군 · 출전 2명'));assert.ok(markup.indexOf('2성')<markup.lastIndexOf('1성'));assert.ok(markup.includes('1,234.5'));assert.ok(markup.includes('1,236.5'));assert.deepEqual(r,before);
 const opponent=contributionGroups(r,'a','damageTaken','opponent');assert.equal((opponent.match(/data-contribution-unit=/g)||[]).length,1);assert.ok(opponent.includes('상대 · 출전 1명'));
 r.units=[];assert.equal((contributionGroups(r,'a').match(/출전 유닛 없음/g)||[]).length,1);
});
test('기여도 그래프: 선택 항목으로 재정렬, 양 진영 같은 눈금, 전부 0인 항목과 원본 보존',()=>{
 const {m,f,t,at}=fixture();at().damage(f,t,999,'skill');tick(m,101);const r=m.roundHistory[0];
 Object.assign(r.units[0],{healing:10,shieldBlocked:0});Object.assign(r.units[1],{healing:20,shieldBlocked:0});r.units.push({...r.units[0],id:'healer',healing:5});const before=structuredClone(r);
 const allied=contributionGroups(r,'a','healing'),enemy=contributionGroups(r,'a','healing','opponent');
 assert.ok(allied.includes('width:50%'));assert.ok(allied.includes('width:25%'));assert.ok(enemy.includes('width:100%'));
 assert.ok(allied.indexOf(`data-contribution-unit="${r.units[0].id}"`)<allied.indexOf('data-contribution-unit="healer"'));
 assert.ok(contributionGroups(r,'a','shieldBlocked').includes('width:0%'));assert.ok(!contributionGroups(r,'a','shieldBlocked').includes('NaN'));assert.deepEqual(r,before);
});
