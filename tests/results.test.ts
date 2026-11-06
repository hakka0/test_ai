import {newTestPlayer as newPlayer} from "./fixtures";
import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatch, prepare, startCombat, tick} from "../shared/engine";
import {snapshotFor} from '../shared/snapshot';
import {finalResult,FinalResultState} from '../client/results';
import {HistoryPanelState} from '../client/history';
import {MAX_ROUNDS} from '../shared/model';
import {GameClock} from '../shared/game-time';
import {DebugSession} from '../server/debug';
function setup(){const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];prepare(m,0);return m;}
const view=(m:ReturnType<typeof setup>,viewer='a',mode:'duel'|'practice'='duel')=>snapshotFor(m,viewer,1,'room',1,1,undefined,mode);
function end(m:ReturnType<typeof setup>){m.players[1].health=1;m.players[1].units.forEach(u=>u.x=-1);startCombat(m,1);tick(m,m.deadline);return m;}
test('최종 결과: 준비/전투/라운드 결과에는 표시하지 않고 실제 경기 종료만 표시',()=>{
 const m=setup();for(const phase of ['waiting','prepare','combat','result'] as const){m.phase=phase;assert.equal(finalResult(view(m),'a'),null);}
 m.phase='prepare';end(m);assert.equal(m.phase,'finished');assert.equal(m.endReason,'elimination');assert.equal(finalResult(view(m),'unknown'),null);
});
test('최종 결과: 양측 승패 관점·체력·승수·도달 스테이지·완료 전투·허용된 필드와 값 복사',()=>{
 const m=end(setup()),s=view(m),original=structuredClone(s),a=finalResult(s,'a')!,b=finalResult(view(m,'b'),'b')!;
 assert.equal(a.title,'최종 승리');assert.equal(b.title,'최종 패배');assert.equal(a.stage,'2-1');assert.equal(a.completedRounds,1);assert.equal(a.canReview,true);assert.match(a.reason,/체력이 소진/);
 assert.deepEqual(a.players,[{id:'a',name:'A',health:100,wins:1,self:true},{id:'b',name:'B',health:0,wins:0,self:false}]);assert.equal(b.players[0].id,'b');
 assert.deepEqual(Object.keys(a.players[0]).sort(),['id','name','health','wins','self'].sort());a.players[0].health=999;assert.deepEqual(s,original);
 tick(m,100000);assert.equal(m.endReason,'elimination');assert.equal(m.roundHistory.length,1);
});
test('최종 결과: 양쪽 체력 소진은 최종 무승부, 라운드 기록의 무승부와 구분',()=>{
 const m=setup();m.players.forEach(p=>{p.health=1;p.units=[];});startCombat(m,1);assert.equal(m.phase,'result');tick(m,m.deadline);
 const result=finalResult(view(m),'a')!;assert.equal(result.outcome,'draw');assert.equal(result.title,'최종 무승부');assert.ok(result.players.every(p=>p.health===0));assert.equal(m.endReason,'elimination');
});
test('최종 결과: 최대 40라운드 체력/승수 판정과 마지막 전투 승자는 별개',()=>{
 const m=setup();m.round=MAX_ROUNDS;m.phase='result';m.deadline=1;m.players[0].health=30;m.players[1].health=40;m.winner='a';
 tick(m,1);const result=finalResult(view(m),'a')!;assert.equal(result.outcome,'loss');assert.equal(result.stage,'9-5');assert.equal(m.endReason,'roundLimit');assert.match(result.reason,/체력, 승수/);
 m.phase='result';m.players.forEach(p=>p.health=30);m.players[0].score=2;m.players[1].score=1;tick(m,1);assert.equal(finalResult(view(m),'a')!.outcome,'win');
 m.phase='result';m.players[1].score=2;tick(m,1);assert.equal(finalResult(view(m),'a')!.outcome,'draw');
});
test('최종 결과: 연결 종료로 미완료 전투는 기록을 만들지 않고 조회 비활성·실제 도달 스테이지',()=>{
 const m=setup();m.round=7;startCombat(m,1);m.phase='finished';m.endReason='disconnect';m.winner='a';
 const result=finalResult(view(m),'a')!;assert.equal(result.stage,'3-2');assert.equal(result.completedRounds,0);assert.equal(result.canReview,false);assert.match(result.reason,/연결 종료/);
 assert.equal(result.players[0].health,100);assert.equal(m.roundHistory.length,0);
});
test('최종 결과: 연습은 새 연습 경기·대전은 새 방, 공개된 서버 모드 기준',()=>{
 const m=end(setup());assert.equal(finalResult(view(m,'a','practice'),'a')!.replayMode,'practice');assert.equal(finalResult(view(m,'a','duel'),'a')!.replayMode,'create');
 assert.equal(view(m,'a','practice').mode,'practice');assert.equal(view(m).mode,'duel');
});
test('최종 결과 화면: 종료 때 한 번 자동 열기·닫은 뒤 반복 갱신으로 재열림 없음·재접속/새 방/복원',()=>{
 const m=setup(),state=new FinalResultState();assert.equal(state.observe(view(m),'a'),false);end(m);const s=view(m);assert.equal(state.observe(s,'a'),true);
 for(let i=0;i<5;i++)assert.equal(state.observe({...s,serverNow:i},'a'),false);
 const refreshed=new FinalResultState();assert.equal(refreshed.observe(s,'a'),true);
 assert.equal(state.observe({...s,roomId:'new'},'a'),true);assert.equal(state.observe({...s,phase:'prepare'},'a'),false);assert.equal(state.observe(s,'a'),true);
 assert.equal(state.observe({...s,debug:{generation:1,paused:true,speed:1,hasCheckpoint:true}},'a'),true);
 state.reset();assert.equal(state.observe(s,'a'),true);assert.equal(state.observe(null,'a'),false);
});
test('최종 결과: 기록 조회/닫기/선택과 새 경기 초기화는 서버 최종 결과를 변경하지 않음',()=>{
 const m=end(setup()),s=view(m),original=structuredClone(s),panel=new HistoryPanelState();panel.observe(s,'a');assert.equal(panel.open,false);
 panel.toggle();panel.select(1);panel.closeDetail();assert.deepEqual(s,original);assert.equal(finalResult(s,'a')!.title,'최종 승리');
 const fresh=setup();panel.observe({...view(fresh),roomId:'new'},'a');assert.equal(panel.open,false);assert.equal(panel.selectedRound,null);assert.equal(finalResult(view(fresh),'a'),null);assert.equal(fresh.endReason,null);
});
test('최종 결과: 개발 체크포인트 저장/복원은 종료 사유/최종 승자/기록을 재현, 프리셋은 초기화',()=>{
 const m=end(setup()),debug=new DebugSession(),clock=new GameClock(1000),expected=finalResult(view(m),'a');debug.apply(m,clock,{type:'save'},1000);
 debug.apply(m,clock,{type:'preset',preset:'late'},1000);assert.equal(m.endReason,null);assert.equal(finalResult(view(m),'a'),null);
 debug.apply(m,clock,{type:'load'},1000);assert.deepEqual(finalResult(view(m),'a'),expected);assert.equal(m.endReason,'elimination');
});
