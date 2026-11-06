import {BENCH_SIZE, COLS, ROWS, type Player} from './model';
import {deploymentLimit, deployedCount} from './progression';

export type UnitDestination = {kind:'cell';x:number;y:number} | {kind:'bench';slot:number};
type UnitMove = {unitId:string;x:number;y:number;benchSlot:number|null};
export type PlacementPlan = {error:string|null;moves:UnitMove[];swapped:boolean};

// Pure planning shared by drop hints and the authoritative server. Both units
// move in one action, so full deployment/bench capacity never blocks a swap.
export function planUnitPlacement(p:Pick<Player,'units'|'level'>, id:string, to:UnitDestination):PlacementPlan {
  const reject=(error:string):PlacementPlan=>({error,moves:[],swapped:false});
  const unit=p.units.find(u=>u.id===id);
  if(!unit)return reject('내 캐릭터만 배치할 수 있습니다.');
  let destination:{x:number;y:number;benchSlot:number|null};
  if(to.kind==='bench'){
    if(!Number.isInteger(to.slot)||to.slot<0||to.slot>=BENCH_SIZE)
      return reject('대기석에 빈자리가 없거나 잘못된 자리입니다.');
    destination={x:-1,y:-1,benchSlot:to.slot};
  }else{
    if(!Number.isInteger(to.x)||!Number.isInteger(to.y)||to.x<0||to.x>=COLS||to.y<0||to.y>=ROWS/2)
      return reject('아군 영역에 배치하세요.');
    destination={x:to.x,y:to.y,benchSlot:null};
  }
  if(unit.x===destination.x&&unit.y===destination.y&&unit.benchSlot===destination.benchSlot)
    return {error:null,moves:[],swapped:false};
  const occupant=p.units.find(u=>u.id!==id&&(to.kind==='bench'
    ? u.x<0&&u.benchSlot===to.slot : u.x===to.x&&u.y===to.y));
  if(!occupant&&to.kind==='cell'&&unit.x<0&&deployedCount(p)>=deploymentLimit(p))
    return reject(`출전 한도 ${deploymentLimit(p)}명입니다. 경험치를 구매해 레벨을 올리거나 출전 유닛을 대기석으로 옮기세요.`);
  const moves:UnitMove[]=[{unitId:id,...destination}];
  if(occupant)moves.push({unitId:occupant.id,x:unit.x,y:unit.y,benchSlot:unit.benchSlot??null});
  return {error:null,moves,swapped:!!occupant};
}
