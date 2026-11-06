import type {Action,SelfPlayerSnapshot} from '../shared/model';
import {EQUIPMENT} from '../shared/catalog';
import {MAX_EQUIPMENT} from '../shared/model';
export function equipmentIntent(player:SelfPlayerSnapshot|undefined,itemId:string,unitId:string|undefined,editable:boolean):{valid:boolean;reason:string;action:Action|null} {
 const reject=(reason:string)=>({valid:false,reason,action:null});
 const item=player?.inventory.find(i=>i.id===itemId);
 if(!item)return reject('보관 중인 장비가 없습니다.');
 if(!editable)return reject('준비 완료 전, 전투 중, 라운드 결과 시간에 장착할 수 있습니다.');
 if(EQUIPMENT[item.definition]?.category==='material')return reject('조합 재료는 제작 후 장착하세요.');
 const unit=player!.units.find(u=>u.id===unitId);
 if(!unit||unit.owner!==player!.id)return reject('내 유닛 위에 놓으세요.');
 if(item.unitId===unit.id)return {valid:true,reason:'이미 장착한 장비입니다.',action:null};
 if(item.unitId!==null)return reject('이미 장착된 장비입니다. 먼저 해제하세요.');
 if(unit.equipment.length>=MAX_EQUIPMENT)return reject(`장비 ${MAX_EQUIPMENT}개 한도에 도달했습니다.`);
 return {valid:true,reason:`장비 ${unit.equipment.length+1} / ${MAX_EQUIPMENT} · 놓으면 장착`,action:{type:'equip',itemId:item.id,unitId:unit.id}};
}
