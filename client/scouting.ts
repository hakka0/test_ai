import type {Snapshot,PublicPlayerSnapshot,SelfPlayerSnapshot} from '../shared/model';
export type ViewedPlayer=PublicPlayerSnapshot|SelfPlayerSnapshot;
export function roster(player:ViewedPlayer){return player.visibility==='self'?player.units:[...player.units,...player.bench];}
export function opponentFor(s:Snapshot,viewerId:string){
 const pair=battlePairFor(s,viewerId);
 return [...s.players,...s.neutralOpponents??[]].find(p=>p.id===pair?.find(id=>id!==viewerId));
}
function battlePairFor(s:Snapshot,playerId:string):[string,string]|undefined{
 if(s.mode!=='practice'&&s.encounter!=='minion'&&['waiting','prepare','matching'].includes(s.phase))return;
 if(s.battlePairs!==undefined)return s.battlePairs.find(pair=>pair.includes(playerId)&&pair.every(id=>[...s.players,...s.neutralOpponents??[]].some(p=>p.id===id)));
 // Older snapshots only name the authenticated viewer's opponent.
 const viewer=s.players.find(p=>p.visibility==='self')?.id;
 if(viewer&&s.opponentId&&s.players.some(p=>p.id===s.opponentId)&&(playerId===viewer||playerId===s.opponentId))return [viewer,s.opponentId];
 if(s.players.length===2&&s.players.some(p=>p.id===playerId))return [s.players[0].id,s.players[1].id];
 const owners=[...new Set(s.fighters.map(f=>f.owner))];
 if(owners.length===2&&owners.includes(playerId)&&owners.every(id=>s.players.some(p=>p.id===id)))return [owners[0],owners[1]];
}
export function standings(s:Snapshot){
 return s.players.map((player,index)=>({player,index})).sort((a,b)=>b.player.health-a.player.health||a.index-b.index).slice(0,6);
}
export function scoutingBoard(s:Snapshot,playerId:string):Snapshot{
 const battle=battleBoard(s,playerId);
 if(['combat','result','finished'].includes(s.phase)&&battle.players.length===2&&battle.fighters.length)return battle;
 return {...battle,phase:'prepare',fighters:[],events:[]};
}
export function battleBoard(s:Snapshot,viewerId:string):Snapshot{
 const pair=battlePairFor(s,viewerId),idsInOrder=pair??[viewerId];
 const players=idsInOrder.flatMap(id=>[...s.players,...s.neutralOpponents??[]].filter(p=>p.id===id));
 const fighters=s.fighters.filter(f=>players.some(p=>p.id===f.owner)),ids=new Set(fighters.map(f=>f.id));
 return {...s,players,fighters,events:s.events.filter(e=>ids.has(e.source)&&ids.has(e.target))};
}
/** Keep a selected participant through health/rank/round changes, never across rooms. */
export class ScoutingState{
 private scope='';private target='';
 get active(){return !!this.target;}
 get playerId(){return this.target;}
 observe(s:Snapshot,viewerId:string){
  const scope=`${s.roomId}:${viewerId}`;
  if(this.scope!==scope){this.scope=scope;this.target='';}
  if(!s.players.some(p=>p.id===this.target))this.target='';
 }
 watch(s:Snapshot,viewerId:string,playerId:string){this.observe(s,viewerId);if(!s.players.some(p=>p.id===playerId))return false;this.target=playerId===viewerId?'':playerId;return true;}
 home(){this.target='';}
 reset(){this.scope='';this.target='';}
}
