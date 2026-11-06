import type {Room} from 'colyseus.js';
import type {Snapshot} from '../shared/model';

// PvP-specific regression tests enter the first player duel through the real
// empty-field intro; the production room and its rules are never bypassed.
function state(room:Room,predicate:(s:Snapshot)=>boolean):Promise<Snapshot>{return new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{off();reject(new Error('intro snapshot timeout'));},12000);
 const off=room.onMessage('snapshot',(s:Snapshot)=>{if(predicate(s)){clearTimeout(timer);off();resolve(s);}});
});}
export async function enterPlayerDuel(a:Room,b:Room){
 for(let round=1;round<=3;round++){
  await Promise.all([state(a,s=>s.round===round&&s.phase==='prepare'),state(b,s=>s.round===round&&s.phase==='prepare')]);
  const ended=state(a,s=>s.round===round&&s.phase==='result');a.send('action',{type:'ready'});b.send('action',{type:'ready'});await ended;
 }
 return Promise.all([state(a,s=>s.round===4&&s.phase==='prepare'),state(b,s=>s.round===4&&s.phase==='prepare')]);
}
