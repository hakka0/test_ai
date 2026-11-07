import {newTestPlayer as newPlayer} from "./fixtures";
import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch, prepare, applyAction, startCombat, tick} from "../shared/engine";
import { EQUIPMENT, UNITS, UNIT_KINDS, ITEM_RECIPES, statsFor } from '../shared/catalog';
import { ITEM_REWARD_ODDS, UNIT_REWARD_ODDS, offerRoundReward, chooseReward, rollTier } from '../shared/rewards';
import { grantItem, craftItems, recipeFor } from '../shared/crafting';
import { snapshotFor } from '../shared/snapshot';
import { DebugSession } from '../server/debug';
import { GameClock } from '../shared/game-time';
import type { SelfPlayerSnapshot, Kind } from '../shared/model';
function setup(round=5) { const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];m.round=round-1;prepare(m,1000);return {m,p:m.players[0],q:m.players[1]}; }
function selectGold(p:ReturnType<typeof newPlayer>) { const r=p.pendingReward!,o=r.options.find(o=>o.type==='gold')!;return {type:'chooseReward',rewardId:r.id,optionId:o.id}; }

test('5,10,...40라운드만 보상: 정확히 세 후보, 일회 발급, 지급 수입 별도',()=>{
 for(let round=1;round<=40;round++) {
  const {p}=setup(round);assert.equal(!!p.pendingReward,round%5===0);
  if(round%5) continue;
  const r=structuredClone(p.pendingReward);assert.deepEqual(r!.options.map(o=>o.type),['gold','unit','item']);
  offerRoundReward(p,round);assert.deepEqual(p.pendingReward,r);
  const gold=p.gold,a=selectGold(p);assert.equal(chooseReward(p,a.rewardId,a.optionId),null);
  assert.equal(p.gold,gold+(r!.options[0] as {amount:number}).amount);
  offerRoundReward(p,round);assert.equal(p.pendingReward,null);
 }
});
test('등급 확률 합계·경계·후반 누적 고등급 확률은 감소하지 않음',()=>{
 for(const table of [UNIT_REWARD_ODDS,ITEM_REWARD_ODDS]) {
  for(const row of table) {assert.equal(row.reduce((a,b)=>a+b),100);assert.ok(row.every(v=>v>=0));let cumulative=0;
   row.forEach((w,i)=>{ if(w>0){assert.equal(rollTier(row,()=>cumulative/100),(i+1));assert.equal(rollTier(row,()=>(cumulative+w-0.0001)/100),i+1);}cumulative+=w; });
  }
  for(let r=1;r<table.length;r++)for(let tier=2;tier<=table[r].length;tier++)assert.ok(table[r].slice(tier-1).reduce((a,b)=>a+b)>=table[r-1].slice(tier-1).reduce((a,b)=>a+b));
 }
});
test('모든 보상 단계·난수 경계에서 실제 존재하는 종류만 나옴, 유닛 1성·장비 1~5',()=>{
 for(let round=5;round<=40;round+=5)for(const value of [0,.049,.1,.25,.5,.75,.9,.99,1]) {
  const p=newPlayer('a','A');offerRoundReward(p,round,()=>value);
  const unit=p.pendingReward!.options[1],item=p.pendingReward!.options[2];assert.equal(unit.type,'unit');assert.equal(item.type,'item');
  if(unit.type==='unit')assert.ok(UNITS[unit.kind]);if(item.type==='item')assert.ok(EQUIPMENT[item.definition]);
 }
});
test('위조·타인 보상·중복 수령·다른 후보 추가 수령은 무변경 거부',()=>{
 const {m,p,q}=setup();const before=structuredClone(m),a=selectGold(p);
 for(const input of [{...a,rewardId:q.pendingReward!.id},{...a,optionId:'fake'},{...a,rewardId:'fake'}]) {assert.ok(applyAction(m,p.id,input,1100));assert.deepEqual(m,before);}
 assert.equal(applyAction(m,p.id,{...a,amount:99999,type:'chooseReward'},1100),null);
 const after=structuredClone(m);assert.ok(applyAction(m,p.id,a,1100));assert.deepEqual(m,after);
});
test('골드·유닛·아이템은 한 가지만 실제 지급, 서버 후보가 지급량 결정',()=>{
 for(const type of ['gold','unit','item']) {const {m,p}=setup(),r=p.pendingReward!,o=r.options.find(o=>o.type===type)!,gold=p.gold,units=p.units.length,items=p.inventory.length;
  assert.equal(applyAction(m,p.id,{type:'chooseReward',rewardId:r.id,optionId:o.id,kind:'hifumi',definition:'plate-t5',amount:99999},1100),null);
  assert.equal(p.pendingReward,null);assert.equal(p.lastReward!.automatic,false);
  assert.equal(p.gold,gold+(o.type==='gold'?o.amount:0));assert.equal(p.inventory.length,items+(type==='item'?1:0));
  // Starting copies can merge, so count represented originals instead of physical instances.
  assert.equal(p.units.reduce((n,u)=>n+3**(u.rank-1),0),units+(type==='unit'?1:0));
 }
});
test('만석 유닛 보상 거부는 후보·ID 유지: 자리 확보 후 수령 또는 골드 대안',()=>{
 const {m,p}=setup();p.units=[];for(let i=0;i<12;i++)p.units.push({id:`fill${i}`,owner:p.id,kind:UNIT_KINDS[i%6],rank:2,x:-1,y:-1,benchSlot:i,equipment:[]});
 const r=p.pendingReward!,o=r.options[1];assert.equal(o.type,'unit');const before=structuredClone(p);
 assert.match(applyAction(m,p.id,{type:'chooseReward',rewardId:r.id,optionId:o.id},1100)!,/대기석/);assert.deepEqual(p,before);
 assert.equal(applyAction(m,p.id,selectGold(p),1100),null);
});
test('만석에서도 보상 유닛 즉시 자동 합성이면 수령 허용·골드 미차감',()=>{
 const {m,p}=setup();offerRoundReward(p,5);const r=p.pendingReward!,o=r.options[1];if(o.type!=='unit')throw Error();
 const others=UNIT_KINDS.filter(kind=>kind!==o.kind);
 p.units=[];for(let i=0;i<12;i++)p.units.push({id:`fill${i}`,owner:p.id,kind:i<2?o.kind:others[(i-2)%others.length],rank:i<2?1:2,x:-1,y:-1,benchSlot:i,equipment:[]});
 const gold=p.gold;assert.equal(applyAction(m,p.id,{type:'chooseReward',rewardId:r.id,optionId:o.id},1100),null);assert.equal(p.gold,gold);assert.equal(p.units.length,11);assert.ok(p.units.some(u=>u.rank===2));
});
test('준비 완료·시간 만료는 골드 자동 수령 1회, 전투 시작 이자에도 반영',()=>{
 for(const mode of ['ready','deadline']) {const {m,p}=setup(),r=p.pendingReward!,gold=(r.options[0] as {amount:number}).amount,before=p.gold;
  if(mode==='ready'){assert.equal(applyAction(m,p.id,{type:'ready'},1100),null);startCombat(m,1200);}else tick(m,m.deadline);
  assert.equal(p.gold,before+gold+(m.winner===p.id?1:0));assert.equal(p.lastReward!.automatic,true);assert.equal(p.pendingReward,null);
  assert.ok(applyAction(m,p.id,{type:'chooseReward',rewardId:r.id,optionId:r.options[1].id},m.deadline));
 }
});
test('준비 완료·마감·전투·종료 중 보상·제작 차단',()=>{
 for(const mode of ['ready','deadline','combat','finished']) {const {m,p}=setup();const a=grantItem(p,'iron'),b=grantItem(p,'cloth');if(mode==='ready')p.ready=true;else if(mode!=='deadline')m.phase=mode as 'combat'|'finished';const before=structuredClone(m),now=mode==='deadline'?m.deadline:1100;
  assert.ok(applyAction(m,p.id,selectGold(p),now));assert.deepEqual(m,before);
  assert.ok(applyAction(m,p.id,{type:'craft',itemIds:[a.id,b.id]},now));assert.deepEqual(m,before);
 }
});
test('재료 3종의 6개 제작법·역순·같은 재료 별개 인스턴스: 정확한 두개 소모',()=>{
 for(const recipe of ITEM_RECIPES)for(const ids of [recipe.materials,[...recipe.materials].reverse()]) {
  const {m,p}=setup(1),a=grantItem(p,ids[0]),b=grantItem(p,ids[1]),gold=p.gold,count=p.inventory.length;
  assert.equal(recipeFor(ids[0],ids[1]),`${recipe.result}-t2`);
  assert.equal(applyAction(m,p.id,{type:'craft',itemIds:[a.id,b.id]},1100),null);
  assert.equal(p.inventory.length,count-1);assert.equal(p.gold,gold);assert.ok(!p.inventory.some(i=>i.id===a.id||i.id===b.id));
  const result=p.inventory.at(-1)!;assert.equal(result.definition,`${recipe.result}-t2`);assert.equal(result.unitId,null);
 }
});
test('위조·없는·타인·동일 ID·장착 중·완성품 조합 및 재전송은 소모 없이 거부',()=>{
 const {m,p,q}=setup(1),a=grantItem(p,'iron'),b=grantItem(p,'cloth'),other=grantItem(q,'crystal');
 for(const input of [null,{},[],[a.id],[a.id,b.id,other.id],[a.id,a.id],[a.id,other.id],[a.id,'fake'],[a.id,p.inventory[0].id],[a.id,3]]){const before=structuredClone(p);assert.ok(craftItems(p,input));assert.deepEqual(p,before);}
 b.unitId=p.units[0].id;let before=structuredClone(p);assert.ok(craftItems(p,[a.id,b.id]));assert.deepEqual(p,before);b.unitId=null;
 p.units[0].equipment.push(b.id);before=structuredClone(p);assert.ok(craftItems(p,[a.id,b.id]));assert.deepEqual(p,before);p.units[0].equipment=[];
 assert.equal(craftItems(p,[a.id,b.id]),null);before=structuredClone(p);assert.ok(craftItems(p,[a.id,b.id]));assert.deepEqual(p,before);
});
test('재료 장착 차단, 신규 장비 장착·능력치·보호막 훅·장착한도·판매 반환',()=>{
 const {m,p}=setup(1),u=p.units[0],material=grantItem(p,'iron');const before=structuredClone(p);
 assert.match(applyAction(m,p.id,{type:'equip',itemId:material.id,unitId:u.id},1100)!,/재료/);assert.deepEqual(p,before);
 const blade=grantItem(p,'greatblade-t5'),shield=grantItem(p,'aegis-t3'),extra=grantItem(p,'plate-t2');
 assert.equal(applyAction(m,p.id,{type:'equip',itemId:blade.id,unitId:u.id},1100),null);
 assert.equal(applyAction(m,p.id,{type:'equip',itemId:shield.id,unitId:u.id},1100),null);
 assert.ok(applyAction(m,p.id,{type:'equip',itemId:extra.id,unitId:u.id},1100));
 assert.equal(statsFor(u,p.inventory).attack,UNITS[u.kind].stats.attack+64);startCombat(m,1200);
 assert.equal(m.fighters.find(f=>f.id===u.id)!.shield,140);
 m.phase='prepare';m.deadline=9000;assert.equal(applyAction(m,p.id,{type:'sell',unitId:u.id},1300),null);assert.equal(blade.unitId,null);assert.equal(shield.unitId,null);
});
test('보상 후보·수령 기록·아이템 내부 ID는 본인에게만, 복사 수정도 서버 무변경',()=>{
 const {m,p}=setup(),r=p.pendingReward!;Object.assign(r,{secret:'SECRET'});Object.assign(r.options[0],{secret:'SECRET'});
 const s=snapshotFor(m,p.id,1100,'r'),own=s.players[0] as SelfPlayerSnapshot,other=snapshotFor(m,'b',1100,'r').players[0];
 assert.ok(!('pendingReward'in other)&&!('lastReward'in other));assert.ok(!('nextItemId'in own)&&!('nextRewardId'in own));assert.ok(!JSON.stringify(s).includes('SECRET'));
 const before=structuredClone(p);own.pendingReward!.options[0].id='tampered';assert.deepEqual(p,before);
 applyAction(m,p.id,selectGold(p),1100);assert.ok(!('lastReward'in snapshotFor(m,'b',1100,'r').players[0]));
});
test('디버깅 보상 프리셋·저장 복원·과거 선택/재료 요청 차단',()=>{
 const {m,p}=setup(1),clock=new GameClock(1000),debug=new DebugSession();
 assert.equal(debug.apply(m,clock,{type:'preset',preset:'reward'},1000),null);
 const own=m.players[0],r=own.pendingReward!,materials=own.inventory.filter(i=>EQUIPMENT[i.definition].category==='material');assert.equal(m.round,5);assert.equal(materials.length,4);
 debug.apply(m,clock,{type:'save'},1000);const saved=structuredClone(m);
 applyAction(m,own.id,selectGold(own),1000);applyAction(m,own.id,{type:'craft',itemIds:[materials[0].id,materials[1].id]},1000);
 debug.apply(m,clock,{type:'load'},1000);assert.deepEqual(m,saved);
 debug.apply(m,clock,{type:'preset',preset:'reward'},1000);const before=structuredClone(m);
 assert.ok(applyAction(m,p.id,{type:'chooseReward',rewardId:r.id,optionId:r.options[0].id},1000));assert.deepEqual(m,before);
 assert.ok(applyAction(m,p.id,{type:'craft',itemIds:[materials[0].id,materials[1].id]},1000));assert.deepEqual(m,before);
});
