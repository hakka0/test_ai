import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch,startCombat,applyAction} from '../shared/engine';
import {newTestPlayer} from './fixtures';
import {snapshotFor} from '../shared/snapshot';
import {ScoutingState,standings,roster,scoutingBoard,battleBoard,opponentFor} from '../client/scouting';
import {unitInspection} from '../client/unit-inspection';
import {preparationPosition} from '../client/board-geometry';
import {synergiesForPlayer} from '../shared/synergy';
function fixture(){const m=newMatch("practice");m.players=Array.from({length:6},(_,i)=>newTestPlayer(`p${i}`,`유저 ${i+1}`));m.phase='prepare';m.round=1;m.deadline=30000;return m;}
test('6인 순위는 체력순·동률은 참가 순서, 현재 상대와 관전 선택은 정렬과 독립',()=>{
 const m=fixture();[70,100,70,0,30,0].forEach((hp,i)=>m.players[i].health=hp);
 const s=snapshotFor(m,'p0',1,'six');s.opponentId='p4';s.battlePairs=[['p0','p4']];const before=structuredClone(s);
 assert.deepEqual(standings(s).map(r=>r.player.id),['p1','p0','p2','p4','p3','p5']);assert.equal(opponentFor(s,'p0')?.id,'p4');
 const state=new ScoutingState();assert.ok(state.watch(s,'p0','p3'));assert.equal(state.playerId,'p3');s.players.reverse();s.players.find(p=>p.id==='p3')!.health=90;state.observe(s,'p0');assert.equal(state.playerId,'p3');
 assert.equal(before.players[0].health,70);assert.equal(standings(before).length,6);
});
test('관전 대상은 라운드·연결 복구 중 유지, 퇴장·새 방·뷰어 교체·내 전장 복귀에서 해제',()=>{
 const s=snapshotFor(fixture(),'p0',1,'six'),state=new ScoutingState();state.watch(s,'p0','p2');
 state.observe({...s,round:2},'p0');assert.equal(state.active,true);assert.equal(state.watch(s,'p0','missing'),false);assert.equal(state.playerId,'p2');
 state.observe({...s,players:s.players.filter(p=>p.id!=='p2')},'p0');assert.equal(state.active,false);
 state.watch(s,'p0','p1');state.observe({...s,roomId:'new'},'p0');assert.equal(state.active,false);
 state.watch(s,'p0','p1');state.observe(s,'p5');assert.equal(state.active,false);state.watch(s,'p0','p1');state.watch(s,'p0','p0');assert.equal(state.active,false);
});
test('관전은 선택한 한 유저의 배치·12칸 대기석만 투영하며 원본/경제/전투를 바꾸지 않음',()=>{
 const m=fixture(),s=snapshotFor(m,'p0',1,'six'),before=structuredClone(s),target=s.players[4],view=scoutingBoard(s,target.id);
 assert.equal(view.players.length,1);assert.equal(view.players[0].id,'p4');assert.deepEqual(view.fighters,[]);assert.deepEqual(view.events,[]);assert.equal(view.phase,'prepare');
 assert.equal(roster(target).length,3);assert.deepEqual(roster(target).filter(u=>u.x<0).map(u=>u.benchSlot),[0,1]);
 assert.deepEqual(preparationPosition(0,target.units[0].x,target.units[0].y),{x:2,y:6});
 assert.ok(!('gold'in target)&&!('shop'in target)&&!('pendingReward'in target));assert.deepEqual(s,before);
 const unit=roster(target).find(u=>u.x<0)!;assert.equal(unitInspection(s,unit.id,true)?.unit.id,unit.id);
});
test('6인 대전 표시에는 내 상대 한 명만 포함하고 다른 전장이나 효과가 섞이지 않음',()=>{
 const m=fixture(),s=snapshotFor(m,'p0',1,'six');s.opponentId='p4';s.battlePairs=[['p0','p4']];const view=battleBoard(s,'p0');assert.deepEqual(view.players.map(p=>p.id),['p0','p4']);
 const legacy={...s,players:s.players.slice(0,2),battlePairs:undefined,opponentId:undefined};assert.equal(battleBoard(legacy,'p0').players.length,2);
});

test('준비 관전은 양쪽 실시간 배치를 대전 순서대로 투영하고 이동·대기석·판매를 반영',()=>{
 const m=fixture();m.players=m.players.slice(0,2);
 const project=()=>scoutingBoard(snapshotFor(m,'p0',1,'prepare'),'p1'),before=project(),unit=m.players[0].units[0];
 assert.deepEqual(before.players.map(p=>p.id),['p0','p1']);assert.equal(before.phase,'prepare');assert.deepEqual(before.fighters,[]);
 assert.equal(applyAction(m,'p0',{type:'place',unitId:unit.id,x:5,y:2},2),null);
 const moved=project();assert.equal(moved.players[0].units[0].x,5);assert.equal(before.players[0].units[0].x,2);
 assert.equal(applyAction(m,'p0',{type:'bench',unitId:unit.id,slot:4},3),null);
 assert.equal(project().players[0].units.filter(u=>u.x>=0).length,0);
 assert.equal(applyAction(m,'p0',{type:'sell',unitId:unit.id},4),null);assert.ok(!roster(project().players[0]).some(u=>u.id===unit.id));
 const reversed=snapshotFor(m,'p0',1,'prepare');reversed.players.reverse();const pair=scoutingBoard(reversed,'p1');assert.deepEqual(pair.players.map(p=>p.id),['p0','p1']);
 assert.ok(!('shop'in pair.players[1])&&!('gold'in pair.players[1]));
 const six=snapshotFor(fixture(),'p0',1,'six');six.battlePairs=[['p0','p1'],['p2','p3'],['p4','p5']];assert.deepEqual(scoutingBoard(six,'p3').players.map(p=>p.id),['p2','p3']);
});
test('공개 대기석·착용 장비는 깊은 복사와 허용 목록, 미착용 장비·상점·내부 필드는 비공개',()=>{
 const m=fixture(),p=m.players[1],unit=p.units[1],item=p.inventory[0];unit.equipment=[item.id];item.unitId=unit.id;Object.assign(unit,{secret:'HIDDEN'});Object.assign(item,{secret:'HIDDEN'});
 const before=structuredClone(m),s=snapshotFor(m,'p0',1,'six'),target=s.players[1];assert.ok(target.visibility==='opponent');assert.ok(target.inventory.some(i=>i.id===item.id));assert.equal(target.inventory.length,1);
 assert.ok(!JSON.stringify(s).includes('HIDDEN'));target.bench[0].equipment.push('changed');target.inventory[0].definition='changed';assert.deepEqual(m,before);
});
test('전투 중 관전도 고정 전투 유닛·양쪽 진영·스킬을 유지하고 대기석은 현재 보유 상태 조회',()=>{
 const m=fixture();m.players=m.players.slice(0,2);startCombat(m,1);const unit=m.players[1].units[0];unit.rank=2;
 const reserve=m.players[1].units.find(u=>u.x<0)!;reserve.rank=3;
 const s=snapshotFor(m,'p0',2,'battle'),before=structuredClone(s),view=scoutingBoard(s,'p1');
 assert.equal(unitInspection(s,unit.id)?.unit.rank,1);assert.equal(unitInspection(s,unit.id,true)?.unit.rank,1);assert.ok(unitInspection(s,unit.id,true)?.fighter);
 assert.equal(unitInspection(s,reserve.id,true)?.unit.rank,3);assert.equal(unitInspection(s,reserve.id,true)?.fighter,undefined);
 assert.equal(view.phase,'combat');assert.deepEqual(view.players.map(p=>p.id),['p0','p1']);assert.deepEqual(view.fighters,s.fighters);assert.equal(opponentFor(s,'p1')?.id,'p0');assert.deepEqual(s,before);
 for(const phase of ['result','finished'] as const)assert.equal(scoutingBoard({...s,phase},'p1').phase,phase);
 const legacy={...s,battlePairs:undefined};assert.deepEqual(scoutingBoard(legacy,'p1').fighters,s.fighters);assert.equal(opponentFor(legacy,'p1')?.id,'p0');
});

test('여러 전장의 관전은 선택한 상대의 실제 대전 쌍만 표시하며 목록 정렬·내 상대와 독립',()=>{
 const m=fixture(),pairs:[string,string][]=[['p0','p1'],['p2','p3'],['p4','p5']];
 m.phase='combat';m.fighters=[];m.events=[];
 for(const [a,b] of pairs){
  const battle=newMatch("practice");battle.players=m.players.filter(p=>p.id===a||p.id===b);startCombat(battle,1);m.fighters.push(...battle.fighters);
  m.events.push({id:m.events.length+1,type:'attack',source:battle.fighters[0].id,target:battle.fighters[1].id,amount:12});
 }
 const s=snapshotFor(m,'p0',100,'six-battle');s.battlePairs=pairs;s.opponentId='p1';s.players.reverse();const before=structuredClone(s);
 for(const [a,b] of pairs)for(const watched of [a,b]){
  const view=scoutingBoard(s,watched);
  assert.equal(view.phase,'combat');assert.deepEqual(view.players.map(p=>p.id),[a,b]);assert.deepEqual([...new Set(view.fighters.map(f=>f.owner))],[a,b]);
  assert.equal(view.events.length,1);assert.ok(view.fighters.some(f=>f.id===view.events[0].source)&&view.fighters.some(f=>f.id===view.events[0].target));
  assert.equal(opponentFor(s,watched)?.id,watched===a?b:a);
  const elsewhere=s.fighters.find(f=>f.owner!==a&&f.owner!==b)!;assert.equal(unitInspection(view,elsewhere.id,true),undefined);
 }
 const view=scoutingBoard(s,'p3'),player=s.players.find(p=>p.id==='p3')!;
 assert.deepEqual(synergiesForPlayer(view,player),synergiesForPlayer(s,player));
 const noBattle={...s,battlePairs:pairs.slice(0,2)},idle=scoutingBoard(noBattle,'p4');assert.equal(idle.phase,'prepare');assert.equal(idle.players.length,1);assert.deepEqual(idle.events,[]);assert.deepEqual(idle.fighters,[]);
 assert.deepEqual(s,before);
});

test('전투 시작 뒤 합성된 원본도 관전에서 조회하고 한 진영이 비어 있어도 상대 전투 표시',()=>{
 const m=fixture();m.players=m.players.slice(0,2);startCombat(m,1);const foreign=m.players[1].units[0],own=m.players[0].units[0];
 m.players[1].units=m.players[1].units.filter(u=>u.id!==foreign.id);m.players[0].units=m.players[0].units.filter(u=>u.id!==own.id);
 const s=snapshotFor(m,'p0',2,'battle');assert.equal(unitInspection(s,foreign.id,true)?.unit.id,foreign.id);assert.equal(unitInspection(s,own.id,true)?.unit.id,own.id);
 m.fighters=m.fighters.filter(f=>f.owner==='p0');const oneSide=snapshotFor(m,'p0',3,'battle');assert.equal(scoutingBoard(oneSide,'p1').phase,'combat');assert.equal(scoutingBoard(oneSide,'p1').fighters.length,1);
});
