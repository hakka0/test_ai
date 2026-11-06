import {newTestPlayer as newPlayer} from "./fixtures";
import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch, prepare, startCombat, tick, applyAction} from "../shared/engine";
import {snapshotFor} from '../shared/snapshot';
import {HistoryPanelState,resultFor,roundsInStage,roundSummary} from '../client/history';
import {DebugSession} from '../server/debug';
import {GameClock} from '../shared/game-time';
import {acquireUnit} from '../shared/bench';
import {refreshShop} from '../shared/shop';
function setup(){const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];prepare(m,0);return m;}
function win(m:ReturnType<typeof setup>,id='a',now=1){m.players.forEach(p=>p.units.forEach((u,i)=>u.x=p.id===id&&i===0?2:-1));startCombat(m,now);}
const view=(m:ReturnType<typeof setup>,room='room')=>snapshotFor(m,'a',1,room);
test('승패·상대·실제 체력 감소 기록, 체력 0 제한과 결과/종료 단계 중복 방지',()=>{
 const m=setup();assert.equal(m.roundHistory.length,0);m.players[1].health=1;win(m);
 const record=m.roundHistory[0];assert.equal(record.round,1);assert.equal(record.winner,'a');assert.equal(record.reason,'victory');
 assert.deepEqual(record.players,[{id:'a',name:'A',healthBefore:100,healthAfter:100,damage:0,survivors:1},{id:'b',name:'B',healthBefore:1,healthAfter:0,damage:1,survivors:0}]);
 assert.equal(resultFor(record,'a'),'win');assert.equal(resultFor(record,'b'),'loss');
 tick(m,m.deadline-1);assert.equal(m.roundHistory.length,1);tick(m,m.deadline);assert.equal(m.phase,'finished');tick(m,100000);assert.equal(m.roundHistory.length,1);
});
test('양쪽 전멸/전투 시간 초과 구분, 무승부 피해와 양쪽 생존 유닛 기록',()=>{
 const empty=setup();empty.players.forEach(p=>p.units=[]);startCombat(empty,1);
 const r=empty.roundHistory[0];assert.equal(r.reason,'elimination');assert.equal(r.winner,null);assert.ok(r.players.every(p=>p.damage===1&&p.survivors===0));assert.equal(resultFor(r,'a'),'draw');
 const timeout=setup();timeout.round=7;startCombat(timeout,1);timeout.fighters.forEach(f=>{f.nextAttack=Infinity;f.nextMove=Infinity;f.skills=[];});tick(timeout,timeout.deadline);tick(timeout,timeout.deadline);
 const t=timeout.roundHistory[0];assert.equal(t.reason,'timeout');assert.equal(t.winner,null);assert.ok(t.players.every(p=>p.damage===2&&p.survivors===1));
});
test('다음 준비 단계·상점 소비·이름/체력 변경·최종 승자 변경으로 과거 기록이 바뀌지 않음',()=>{
 const m=setup();win(m);const first=structuredClone(m.roundHistory[0]);tick(m,m.deadline);
 assert.equal(m.phase,'prepare');assert.deepEqual(m.roundHistory[0],first);m.players[0].name='새 이름';m.players[0].gold=999;win(m,'b',20000);
 assert.deepEqual(m.roundHistory[0],first);assert.equal(m.roundHistory[1].round,2);assert.equal(m.roundHistory[1].winner,'b');
 m.round=40;prepare(m,40000);m.round=40;m.players.forEach(p=>{p.units=[];});startCombat(m,40001);const last=structuredClone(m.roundHistory.at(-1));
 tick(m,m.deadline);assert.equal(m.phase,'finished');assert.deepEqual(m.roundHistory.at(-1),last);assert.equal(last!.winner,null);
});
test('전투 중 합성 보류 구매의 대기석은 생존 수에서 제외하고 실제 참가자로 계산',()=>{
 const m=setup(),p=m.players[0];p.level=3;const extra=acquireUnit(p,'knight')!;applyAction(m,p.id,{type:'place',unitId:extra.id,x:3,y:1},1);refreshShop(p,()=>0);startCombat(m,2);
 assert.equal(applyAction(m,p.id,{type:'buy',offerId:p.shop[0].id,revision:p.shopRevision},3),null);assert.equal(p.units.filter(u=>u.x>=0).length,2);
 m.fighters.filter(f=>f.owner==='b').forEach(f=>f.hp=0);tick(m,102);
 assert.equal(m.roundHistory[0].players[0].survivors,2);assert.equal(m.roundHistory[0].players[1].survivors,0);
});
test('스냅샷 기록은 허용 목록·깊은 복사, 미래 비공개 필드와 상점/대기석 전송 없음',()=>{
 const m=setup();win(m);Object.assign(m.roundHistory[0],{futurePrivate:'SECRET_RECORD'});Object.assign(m.roundHistory[0].players[0],{gold:999,futurePrivate:'SECRET_PLAYER'});
 const before=structuredClone(m),a=view(m),b=snapshotFor(m,'b',1,'room');assert.deepEqual(a.roundHistory,b.roundHistory);
 assert.ok(!JSON.stringify(a.roundHistory).includes('SECRET'));assert.ok(!JSON.stringify(a.roundHistory).includes('gold'));
 a.roundHistory[0].players[0].damage=999;a.roundHistory.push(structuredClone(a.roundHistory[0]));assert.deepEqual(m,before);
});
test('디버깅 저장/복원은 기록을 되돌리고 같은 전투 결과를 재현, 시작 프리셋은 초기화',()=>{
 const m=setup(),debug=new DebugSession(),clock=new GameClock(1000);debug.apply(m,clock,{type:'pause',paused:true},1000);
 debug.apply(m,clock,{type:'save'},1000);win(m);const result=structuredClone(m.roundHistory);debug.apply(m,clock,{type:'load'},1000);assert.deepEqual(m.roundHistory,[]);
 win(m);assert.deepEqual(m.roundHistory,result);debug.apply(m,clock,{type:'save'},1000);prepare(m,20000);debug.apply(m,clock,{type:'load'},1000);assert.deepEqual(m.roundHistory,result);
 debug.apply(m,clock,{type:'preset',preset:'late'},1000);assert.deepEqual(m.roundHistory,[]);
});
test('패널 기본 접힘·결과 추가 시 자동 열림 없음·전체 닫기/다시 열기와 상세 독립 닫기',()=>{
 const m=setup(),panel=new HistoryPanelState();panel.observe(view(m),'a');assert.equal(panel.open,false);win(m);panel.observe(view(m),'a');assert.equal(panel.open,false);
 panel.toggle();panel.select(1);assert.equal(panel.detailVisible,true);panel.toggle();assert.equal(panel.open,false);assert.equal(panel.detailVisible,false);
 prepare(m,20000);win(m,'b',20001);panel.observe(view(m),'a');assert.equal(panel.open,false);assert.equal(panel.selectedRound,1);
 panel.toggle();assert.equal(panel.detailVisible,true);assert.equal(panel.selected!.winner,'a');panel.closeDetail();assert.equal(panel.open,true);assert.equal(panel.detailVisible,false);
 panel.toggle();panel.toggle();assert.equal(panel.detailVisible,false);assert.equal(panel.selectedRound,1);
});
test('처음 열 때 현재 스테이지, 이후 단계 진행 중 선택 유지와 기록 없는 라운드 차단',()=>{
 const m=setup(),panel=new HistoryPanelState();panel.observe(view(m),'a');m.round=7;win(m);panel.observe(view(m),'a');assert.equal(panel.stage,3);panel.toggle();panel.select(7);
 m.round=13;panel.observe(view(m),'a');assert.equal(panel.stage,3);assert.equal(panel.selectedRound,7);assert.equal(panel.open,true);
 panel.select(12);assert.equal(panel.selectedRound,7);panel.navigate(2);assert.equal(panel.stage,2);assert.equal(panel.detailVisible,false);panel.navigate(99);assert.equal(panel.stage,2);
 panel.navigate(panel.maxStage);assert.equal(panel.stage,4);
});
test('새로고침 선택 복원은 기본 접힘, 잘못된 저장 값·사라진 기록·새 방 처리',()=>{
 const m=setup();win(m);const panel=new HistoryPanelState();panel.observe(view(m),'a');panel.toggle();panel.select(1);const preferences=panel.preferences();
 const restored=new HistoryPanelState();restored.observe(view(m),'a');restored.restore(preferences);assert.equal(restored.open,false);assert.equal(restored.selectedRound,1);restored.toggle();assert.equal(restored.detailVisible,true);
 restored.restore({stage:-10,selectedRound:999,detailOpen:true});assert.equal(restored.stage,2);assert.equal(restored.selectedRound,1);
 m.roundHistory=[];restored.observe(view(m),'a');assert.equal(restored.selectedRound,null);assert.equal(restored.detailVisible,false);
 restored.observe(view(m,'another-room'),'a');assert.equal(restored.open,false);assert.equal(restored.selectedRound,null);
});
test('스테이지 경계와 마지막 40라운드, 기록 선택은 기록을 변경하지 않음',()=>{
 assert.deepEqual(roundsInStage(2),[1,2,3,4,5]);assert.deepEqual(roundsInStage(3),[6,7,8,9,10]);assert.deepEqual(roundsInStage(9),[36,37,38,39,40]);
 assert.deepEqual(Array.from({length:8},(_,i)=>roundsInStage(i+2)).flat(),Array.from({length:40},(_,i)=>i+1));
 const m=setup();win(m);const s=view(m),original=structuredClone(s),panel=new HistoryPanelState();panel.observe(s,'a');panel.toggle();panel.select(1);panel.closeDetail();panel.navigate(2);assert.deepEqual(s,original);
});
test('새 기록은 패널·지난 선택을 바꾸지 않고 사라진 기록·새 방에서 선택을 초기화',()=>{
 const m=setup(),panel=new HistoryPanelState();panel.observe(view(m),'a');win(m);panel.observe(view(m),'a');assert.equal(panel.open,false);
 panel.toggle();panel.select(1);panel.toggle();prepare(m,20000);win(m,'b',20001);panel.observe(view(m),'a');
 assert.equal(panel.selectedRound,1);assert.equal(panel.open,false);
 m.roundHistory=[];panel.observe(view(m),'a');assert.equal(panel.selectedRound,null);
 panel.observe(view(m,'new-room'),'a');assert.equal(panel.open,false);
});
test('결과 요약은 승리·패배·무승부에서 각 플레이어의 실제 체력 감소를 사용',()=>{
 const m=setup();win(m);const record=structuredClone(m.roundHistory[0]);record.players[0].damage=1;record.players[1].damage=3;
 assert.equal(roundSummary(record,'a'),'승리 · 상대 체력 −3');assert.equal(roundSummary(record,'b'),'패배 · 내 체력 −3');
 record.winner=null;assert.equal(roundSummary(record,'a'),'무승부 · 내 체력 −1 · 상대 −3');
});
