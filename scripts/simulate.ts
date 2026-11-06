import { newMatch, newPlayer, applyAction, botSetup } from '../shared/engine';
import { advanceMatch } from '../shared/game-time';
import { MAX_LEVEL } from '../shared/progression';
import { REROLL_COST } from '../shared/shop';
import type { Player, Match } from '../shared/model';

// Real rules, no browser, no waits. Seed only this diagnostic process's shop RNG.
function playPreparation(m: Match, p: Player, now: number, reserve: number) {
  const target = Math.min(MAX_LEVEL, 4 + Math.floor((m.round - 1) / 5));
  while (p.level < target && p.gold >= reserve + 4)
    applyAction(m, p.id, {type: 'buyExperience', revision: p.experienceRevision}, now);
  while (p.units.length < p.level && p.gold >= 3) {
    let offer = p.shop.find(o => !o.sold && o.cost <= p.gold);
    if (!offer) {
      if (p.gold < REROLL_COST + 3) break;
      applyAction(m,p.id,{type:'reroll',revision:p.shopRevision},now);
      offer = p.shop.find(o => !o.sold && o.cost <= p.gold);
    }
    if (!offer || applyAction(m,p.id,{type:'buy',offerId:offer.id,revision:p.shopRevision},now)) break;
  }
  botSetup(p);
  for (let i=0;i<p.inventory.length;i++) {
    const u=p.units[i===1?0:Math.min(i,p.units.length-1)];
    applyAction(m,p.id,{type:'equip',itemId:p.inventory[i].id,unitId:u.id},now);
  }
}
for (const reserves of [[30,30],[50,50],[30,50]]) {
  let seed=123456;
  Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const m=newMatch();m.players=[newPlayer('a','A'),newPlayer('b','B')];
  const {prepare}=await import('../shared/engine');prepare(m,0);
  let now=0;const milestones:Record<string,number>[]=[{},{}];
  while(m.phase!=='finished') {
    if(m.phase==='prepare') {
      m.players.forEach((p,i)=>{
        playPreparation(m,p,now,reserves[i]);
        for(const level of [6,7,8,9,10])if(p.level>=level&&milestones[i][level]===undefined)milestones[i][level]=m.round;
      });
      now=m.deadline;advanceMatch(m,now);
    } else if(m.phase==='combat'){now+=100;advanceMatch(m,now);}
    else if(m.phase==='result'){now=m.deadline;advanceMatch(m,now);}
    else throw new Error('Unexpected phase');
  }
  console.log(JSON.stringify({reserve:reserves,rounds:m.round,minutes:Number((now/60000).toFixed(2)),health:m.players.map(p=>p.health),levels:m.players.map(p=>p.level),milestones}));
}
