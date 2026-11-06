import {newTestPlayer as newPlayer} from "./fixtures";
import test from 'node:test';
import assert from 'node:assert/strict';
import {RewardPresentation} from '../client/reward-presentation';
import {newMatch, prepare, applyAction, startCombat} from "../shared/engine";
import {offerRoundReward} from '../shared/rewards';
import {snapshotFor} from '../shared/snapshot';
function setup(){const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];m.round=4;prepare(m,0);const view=()=>snapshotFor(m,'a',1,'room');return {m,p:m.players[0],view};}
test('보상 팝업: 새 보상 자동 열기, 닫은 뒤 반복 갱신으로 재열림 없음, 버튼으로 복원',()=>{
 const {view}=setup(),state=new RewardPresentation();state.observe(view(),'a',1);assert.equal(state.visible,true);assert.equal(state.available,true);
 state.dismiss();for(let i=0;i<5;i++){state.observe(view(),'a',i);assert.equal(state.visible,false);}assert.equal(state.available,true);state.open();assert.equal(state.visible,true);
});
test('보상 팝업: 실제 보상 수령 때 닫고 다음 보상/새 방/개발 복원에서 새로 열기',()=>{
 const {m,p,view}=setup(),state=new RewardPresentation();state.observe(view(),'a',1);const reward=p.pendingReward!;
 assert.equal(applyAction(m,'a',{type:'chooseReward',rewardId:reward.id,optionId:reward.options[0].id},1),null);state.observe(view(),'a',1);assert.equal(state.visible,false);assert.equal(state.available,false);
 offerRoundReward(p,10);state.observe(view(),'a',1);assert.equal(state.visible,true);state.dismiss();
 state.observe({...view(),debug:{generation:1,paused:true,speed:1,hasCheckpoint:true}},'a',1);assert.equal(state.visible,true);state.dismiss();state.observe({...view(),roomId:'new'},'a',1);assert.equal(state.visible,true);
});
test('보상 팝업: 준비 완료/전투/결과/종료/마감/모르는 접속에는 표시하지 않고 확인 모드 해제',()=>{
 const {m,view}=setup();for(const phase of ['combat','result','finished','waiting'] as const){const state=new RewardPresentation();state.observe(view(),'a',1);state.togglePeek();state.observe({...view(),phase},'a',1);assert.equal(state.visible,false);assert.equal(state.peeking,false);}
 const state=new RewardPresentation();state.observe(view(),'a',m.deadline);assert.equal(state.visible,false);state.observe(view(),'unknown',1);assert.equal(state.visible,false);m.players[0].ready=true;state.observe(view(),'a',1);assert.equal(state.visible,false);
});
test('눈 버튼: 한 번 전환한 확인 모드는 반복 스냅샷에서도 유지하고 다음 전환으로 복원',()=>{
 const {view}=setup(),state=new RewardPresentation();state.observe(view(),'a',1);assert.equal(state.togglePeek(),true);assert.equal(state.peeking,true);
 for(let i=0;i<5;i++){state.observe(view(),'a',i);assert.equal(state.peeking,true);assert.equal(state.available,true);}
 assert.equal(state.togglePeek(),true);assert.equal(state.peeking,false);assert.equal(state.visible,true);
 state.togglePeek();state.open();assert.equal(state.peeking,false);assert.equal(state.visible,true);
});
test('눈 버튼: 닫힘·미수령 보상 없음은 전환 차단, 새 보상/복원/리셋은 확인 모드 해제',()=>{
 const {view}=setup(),state=new RewardPresentation();assert.equal(state.togglePeek(),false);state.observe(view(),'a',1);state.togglePeek();state.dismiss();assert.equal(state.peeking,false);assert.equal(state.togglePeek(),false);
 state.open();state.togglePeek();state.observe({...view(),debug:{generation:1,paused:true,speed:1,hasCheckpoint:true}},'a',1);assert.equal(state.peeking,false);assert.equal(state.visible,true);
 state.togglePeek();state.reset();assert.equal(state.peeking,false);assert.equal(state.available,false);assert.equal(state.togglePeek(),false);
});
test('눈 버튼/닫기/재열기: 서버 보상/골드/시간/후보는 변경하지 않으며 새로고침은 보상 다시 표시',()=>{
 const {m,view}=setup(),before=structuredClone(m),s=view(),snapshot=structuredClone(s),state=new RewardPresentation();state.observe(s,'a',1);state.togglePeek();state.togglePeek();state.dismiss();state.open();
 assert.deepEqual(m,before);assert.deepEqual(s,snapshot);const refreshed=new RewardPresentation();refreshed.observe(s,'a',1);assert.equal(refreshed.visible,true);assert.equal(refreshed.peeking,false);
});
test('보상 팝업: 확인 모드에서도 준비 마감은 서버 골드 자동 지급, 팝업 상태 초기화',()=>{
 const {m,p,view}=setup(),state=new RewardPresentation();state.observe(view(),'a',1);state.togglePeek();const amount=p.pendingReward!.options.find(o=>o.type==='gold')!.amount,gold=p.gold;
 startCombat(m,m.deadline);assert.equal(p.pendingReward,null);assert.equal(p.gold,gold+amount);assert.equal(p.lastReward!.automatic,true);state.observe(view(),'a',m.deadline);assert.equal(state.visible,false);assert.equal(state.peeking,false);state.reset();assert.equal(state.available,false);
});
