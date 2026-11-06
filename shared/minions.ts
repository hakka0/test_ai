import type {Fighter,Match,MinionBattle,Player,Stats,Unit} from './model';
import {COLS} from './model';
import {UNITS} from './catalog';

export const INTRO_MINION_ROUNDS=3;
export function isMinionRound(m:Pick<Match,'mode'|'round'|'minionRounds'>){return m.mode!=='practice'&&m.round>0&&m.round<=(m.minionRounds??0);}
export function sameArena(a:Pick<Fighter,'arena'>,b:Pick<Fighter,'arena'>){return a.arena===b.arena;}
export function minionStats(unit:Unit):Stats{
 const wave=unit.minion?.wave??1;
 return {hp:70+wave*15,attack:3+wave,defense:8,weaponPower:10,critChance:0,critDamage:150,interval:1500,range:unit.minion?.variant==='drone'?3:1,moveMs:550};
}
export function unitDefinition(unit:Pick<Unit,'kind'|'minion'>){
 const base=UNITS[unit.kind];
 return unit.minion?{...base,name:unit.minion.variant==='drone'?'미니언 드론':'훈련 미니언',role:'중립 기계',image:`/units/minion-${unit.minion.variant}.svg`,skills:[],stats:minionStats(unit as Unit),trait:base.trait}:base;
}
export function createMinionBattles(players:readonly Player[],round:number):MinionBattle[]{
 return players.map(player=>{
  const id=`minions:${player.id}`;
  return {owner:player.id,opponent:{id,name:'미니언 부대',units:Array.from({length:Math.min(3,round)},(_,i)=>({
   id:`${id}:${round}:${i}`,owner:id,kind:i%2?'ranger' as const:'knight' as const,rank:1 as const,
   x:COLS-3-i,y:2,benchSlot:null,equipment:[],minion:{wave:round,variant:i%2?'drone' as const:'sentry' as const},
  }))}};
 });
}
