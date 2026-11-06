import {ROWS} from '../shared/model';
import type {Action, SelfPlayerSnapshot, Snapshot, Unit} from '../shared/model';
import {planUnitPlacement} from '../shared/placement';
import {unitSellPrice} from '../shared/shop';

export type Destination = {kind:'cell';x:number;y:number} | {kind:'bench';slot:number} | {kind:'shop'} | {kind:'outside'};
export function placementIntent(p:SelfPlayerSnapshot|undefined,id:string,to:Destination,editable:boolean,sellable=editable):{action:Action|null;reason:string;valid:boolean} {
 const reject=(reason:string)=>({action:null,reason,valid:false});
 if(!p?.units.some(u=>u.id===id))return reject('먼저 내 유닛을 선택하세요.');
 if(to.kind==='shop')return sellable?{action:{type:'sell',unitId:id},reason:`판매 · ${unitSellPrice(p.units.find(u=>u.id===id)!)} G`,valid:true}:reject('지금은 판매할 수 없습니다.');
 if(!editable)return reject('준비 완료 전 준비 시간에만 배치할 수 있습니다.');
 if(to.kind==='outside')return reject('전장이나 대기석에 놓으세요.');
 if(to.kind==='cell'&&(!Number.isInteger(to.y)||to.y<ROWS/2||to.y>=ROWS))return reject('아래쪽 아군 영역에 배치하세요.');
 const destination=to.kind==='bench'?to:{kind:'cell' as const,x:to.x,y:ROWS-1-to.y};
 const plan=planUnitPlacement(p,id,destination);
 if(plan.error)return reject(plan.error);
 const action:Action|null=!plan.moves.length?null:destination.kind==='bench'
   ? {type:'bench',unitId:id,slot:destination.slot} : {type:'place',unitId:id,x:destination.x,y:destination.y};
 return {valid:true,reason:plan.swapped?'자리 교환':to.kind==='bench'?'대기석으로':'여기에 배치',action};
}
// Ignore only the compatibility click belonging to this completed gesture.
// A new pointerdown and keyboard activation remain usable immediately.
export class GestureClicks {
 private previous?:{pointer:number;x:number;y:number;at:number};
 begin(){this.previous=undefined;}
 end(pointer:number,x:number,y:number,at:number){this.previous={pointer,x,y,at};}
 consume(e:{detail:number;pointerId?:number;clientX:number;clientY:number},now:number):boolean {
  const p=this.previous;
  if(!p||e.detail===0||now-p.at>400||now<p.at)return false;
  if(e.pointerId!==undefined&&e.pointerId!==p.pointer)return false;
  if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>4)return false;
  this.previous=undefined;return true;
 }
}
function preparationKey(s:Snapshot):string {
 const p=s.players.find(p=>p.visibility==='self');
 return JSON.stringify([s.phase,s.round,s.deadline,s.debug?.generation,p?.id,
  p?.visibility==='self'?[p.gold,p.shopRevision,p.experienceRevision,p.units,p.inventory,p.ready]:null]);
}
// One mutation in flight. Repeated unchanged snapshots are not acknowledgements.
export class MutationGate {
 private baseline:string|null=null;
 get busy(){return this.baseline!==null;}
 start(s:Snapshot):boolean {if(this.busy)return false;this.baseline=preparationKey(s);return true;}
 observe(s:Snapshot){if(this.busy&&this.baseline!==preparationKey(s))this.reset();}
 reset(){this.baseline=null;}
}
export class SaleConfirmation {
 private pending?:{id:string;rank:number;price:number};
 arm(u:Unit){this.pending={id:u.id,rank:u.rank,price:unitSellPrice(u)};}
 matches(u:Unit|undefined):boolean{return !!u&&!!this.pending&&u.id===this.pending.id&&u.rank===this.pending.rank&&unitSellPrice(u)===this.pending.price;}
 clear(){this.pending=undefined;}
}
