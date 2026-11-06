import type {RoundResult, Snapshot} from '../shared/model';
import {MAX_ROUNDS} from '../shared/model';
import {ROUNDS_PER_STAGE,stageFor} from '../shared/match-rules';
export function roundsInStage(stage:number):number[]{
 const first=(stage-2)*ROUNDS_PER_STAGE+1;
 return Array.from({length:ROUNDS_PER_STAGE},(_,i)=>first+i).filter(r=>r>=1&&r<=MAX_ROUNDS);
}
export function resultFor(result:RoundResult,viewerId:string):'win'|'loss'|'draw'{
 return result.players.find(p=>p.id===viewerId)?.outcome??(result.winner===null?'draw':result.winner===viewerId?'win':'loss');
}
export function roundSummary(result:RoundResult,viewerId:string):string {
 const me=result.players.find(p=>p.id===viewerId),other=result.players.find(p=>me?.opponentId?p.id===me.opponentId:p.id!==viewerId);
 if(!me)return '탈락 · 관전 중';
 if(me.bye)return '부전승 · 체력 유지';
 const outcome=resultFor(result,viewerId);
 if(result.encounter==='minion')return `미니언전 ${outcome==='win'?'승리':outcome==='loss'?'패배':'무승부'}`;
 if(outcome==='win')return `승리 · 상대 체력 −${other?.damage??0}`;
 if(outcome==='loss')return `패배 · 내 체력 −${me?.damage??0}`;
 return `무승부 · 내 체력 −${me?.damage??0} · 상대 −${other?.damage??0}`;
}
export class HistoryPanelState {
 open=false;detailOpen=false;stage=2;selectedRound:number|null=null;
 private viewed=false;private scope='';private currentStage=2;private records:RoundResult[]=[];
 observe(s:Snapshot,viewerId:string):boolean{
  const scope=`${s.roomId}:${viewerId}`,changed=scope!==this.scope;
  this.currentStage=stageFor(s.round);this.records=s.roundHistory;
  if(changed){this.viewed=false;this.scope=scope;this.open=false;this.detailOpen=false;this.selectedRound=null;this.stage=this.currentStage;}
  this.stage=this.viewed?Math.max(2,Math.min(this.currentStage,this.stage)):this.currentStage;
  if(this.selectedRound!==null&&!this.records.some(r=>r.round===this.selectedRound)){this.selectedRound=null;this.detailOpen=false;}
  return changed;
 }
 get maxStage(){return this.currentStage;}
 get selected(){return this.records.find(r=>r.round===this.selectedRound)??null;}
 get detailVisible(){return this.open&&this.detailOpen&&this.selected!==null&&stageFor(this.selected.round)===this.stage;}
 toggle(){if(!this.open)this.viewed=true;this.open=!this.open;}
 select(round:number){if(!this.records.some(r=>r.round===round))return;this.viewed=true;this.selectedRound=round;this.stage=stageFor(round);this.detailOpen=true;}
 closeDetail(){this.detailOpen=false;}
 navigate(stage:number){if(!Number.isInteger(stage)||stage<2||stage>this.currentStage)return;this.viewed=true;this.stage=stage;this.detailOpen=false;this.selectedRound=null;}
 preferences(){return {stage:this.stage,selectedRound:this.selectedRound,detailOpen:this.detailOpen};}
 restore(value:unknown){
  if(!value||typeof value!=='object')return;
  const prefs=value as {stage?:unknown;selectedRound?:unknown;detailOpen?:unknown};
  if(typeof prefs.stage==='number'&&Number.isInteger(prefs.stage)&&prefs.stage>=2&&prefs.stage<=this.currentStage){this.stage=prefs.stage;this.viewed=true;}
  if(typeof prefs.selectedRound==='number'&&Number.isInteger(prefs.selectedRound)&&this.records.some(r=>r.round===prefs.selectedRound&&stageFor(r.round)===this.stage)){
   this.selectedRound=prefs.selectedRound;this.detailOpen=prefs.detailOpen===true;
  }
  // Refresh/reconnection restore the chosen record, never automatically open it.
 }
}
