import type { Item, Match, Snapshot, Unit, DebugState, MatchMode } from "./model";
import {isMinionRound} from './minions';

function unitSnapshot(u: Unit, own = false): Unit {
  return {
    id: u.id, owner: u.owner, kind: u.kind, rank: u.rank, x: u.x, y: u.y,
    equipment: [...u.equipment],
    ...(u.minion?{minion:{...u.minion}}:{}),
    ...(own ? { benchSlot: u.benchSlot ?? null } : {}),
  };
}
function itemSnapshot(i: Item): Item {
  return { id: i.id, definition: i.definition, unitId: i.unitId };
}

// viewerId comes exclusively from the authenticated room connection. Use explicit
// allowlists, rather than deleting private keys from a copy of the server state.
export function snapshotFor(m: Match, viewerId: string, serverNow: number, roomId: string, gameNow = serverNow, timeScale = 1, debug?: DebugState, mode: MatchMode = m.mode): Snapshot {
  const combatVisible=['combat','result','finished'].includes(m.phase);
  const roster = m.players[0]?.roster;
  const rosterVisible=mode==='practice'||['prepare','matching'].includes(m.phase)||combatVisible;
  const neutral=isMinionRound(m)?m.minionBattles:undefined;
  const pairs:[string,string][]=neutral?neutral.map(b=>[b.owner,b.opponent.id]):mode!=='practice'&&!combatVisible?[]:
    m.pvpBattles?m.pvpBattles.map(b=>[...b.players]):m.players.length===2?[[m.players[0].id,m.players[1].id]]:[];
  return {
    ...(roster ? { roster } : {}),
    overtime:!!m.overtime,
    encounter:neutral?'minion':'pvp',
    ...(neutral?{neutralOpponents:neutral.map(b=>({id:b.opponent.id,name:b.opponent.name,neutral:true,
      visibility:'opponent' as const,rosterVisible:true,health:m.phase==='combat'||m.phase==='result'?m.fighters.filter(f=>f.owner===b.opponent.id&&f.hp>0).length:b.opponent.units.length,level:1,connected:true,ready:true,score:0,
      units:b.opponent.units.map(u=>unitSnapshot(u)),bench:[],inventory:[]}))}:{}),
    opponentId:pairs.find(pair=>pair.includes(viewerId))?.find(id=>id!==viewerId)??null,
    battlePairs:pairs,
    endReason: m.endReason, mode,
    gameNow, timeScale, ...(debug ? { debug: { ...debug } } : {}),
    phase: m.phase, round: m.round, deadline: m.deadline,
    roundHistory: m.roundHistory.map(r => ({
      round: r.round, winner: r.winner, reason: r.reason,...(r.encounter?{encounter:r.encounter}:{}),
      players: r.players.map(p => ({id: p.id, name: p.name, healthBefore: p.healthBefore,
        healthAfter: p.healthAfter, damage: p.damage, survivors: p.survivors,
        ...(p.bye?{bye:true}:{}),...(p.outcome?{outcome:p.outcome}:{}),...(p.opponentId?{opponentId:p.opponentId}:{}),...(p.streakGold?{streakGold:p.streakGold}:{}),})),
      units: r.units.map(u => ({id: u.id, owner: u.owner, kind: u.kind, rank: u.rank,
        damageDealt: u.damageDealt, damageTaken: u.damageTaken,
        healing: u.healing, shieldBlocked: u.shieldBlocked,...(u.minion?{minion:{...u.minion}}:{})})),
    })),
    players: m.players.map(p => {
      const publicFields = {
        ...(p.bot?{bot:true}:{}),
        id: p.id, name: p.name, level: p.level, health: p.health,
        connected: p.connected, ready: p.ready, score: p.score,
      };
      if (p.id === viewerId) return {
        ...publicFields, visibility: "self" as const,
        pendingReward: p.pendingReward ? {
          id: p.pendingReward.id, round: p.pendingReward.round,
          options: p.pendingReward.options.map(o => o.type === "gold" ? {id: o.id, type: o.type, amount: o.amount}
            : o.type === "unit" ? {id: o.id, type: o.type, kind: o.kind} : {id: o.id, type: o.type, definition: o.definition}),
        } : null,
        lastReward: p.lastReward ? {
          round: p.lastReward.round, automatic: p.lastReward.automatic,
          option: p.lastReward.option.type === "gold" ? {id: p.lastReward.option.id, type: "gold" as const, amount: p.lastReward.option.amount}
            : p.lastReward.option.type === "unit" ? {id: p.lastReward.option.id, type: "unit" as const, kind: p.lastReward.option.kind}
            : {id: p.lastReward.option.id, type: "item" as const, definition: p.lastReward.option.definition},
        } : null,
        mergeRevision: p.mergeRevision,
        lastMerge: p.lastMerge ? {
          unitId: p.lastMerge.unitId, kind: p.lastMerge.kind, rank: p.lastMerge.rank,
          consumedIds: [...p.lastMerge.consumedIds], returnedEquipment: p.lastMerge.returnedEquipment,
        } : null,
        experience: p.experience, experienceRevision: p.experienceRevision,
        streak: p.streak, streakCount: p.streakCount,
        lastIncome: {base: p.lastIncome.base, interest: p.lastIncome.interest, streak: p.lastIncome.streak, total: p.lastIncome.total},
        gold: p.gold, shopRevision: p.shopRevision,
        shop: p.shop.map(o => ({ id: o.id, kind: o.kind, cost: o.cost, sold: o.sold })),
        units: p.units.map(u => unitSnapshot(u, true)),
        inventory: p.inventory.map(itemSnapshot),
      };
      const units = rosterVisible?p.units.filter(u => u.x >= 0).map(u => unitSnapshot(u)):[];
      const bench = rosterVisible?p.units.filter(u => u.x < 0).map(u => unitSnapshot(u, true)):[];
      const visibleUnits = m.phase === "combat" || m.phase === "result" || m.phase === "finished"
        ? [...units, ...bench, ...m.fighters.filter(f => f.owner === p.id)] : [...units, ...bench];
      return {
        ...publicFields, visibility: "opponent" as const, rosterVisible, units, bench,
        // Combat equipment stays public for inspection even when a shop merge
        // has returned it to storage. Never include unrelated stored items.
        inventory: p.inventory.filter(i => visibleUnits.some(u =>
          u.equipment.includes(i.id))).map(i => ({
            ...itemSnapshot(i),
            // Keep the current roster wearer when an item moves mid-combat.
            unitId: visibleUnits.find(u => u.equipment.includes(i.id))!.id,
          })),
      };
    }),
    fighters: (combatVisible?m.fighters:[]).map(f => ({
      ...unitSnapshot(f), hp: f.hp, maxHp: f.maxHp, shield: f.shield,
      skills: f.skills.map(s => ({
        id: s.id, cost: s.cost, active: s.active,
        cooldownUntil: s.cooldownUntil, activations: s.activations,
      })),
    })),
    events: (combatVisible?m.events:[]).map(e => ({
      id: e.id, type: e.type, source: e.source, target: e.target, amount: e.amount,
      ...(e.skillId === undefined ? {} : { skillId: e.skillId }),
      ...(e.shieldDamage === undefined ? {} : { shieldDamage: e.shieldDamage }),
      ...(e.healthDamage === undefined ? {} : { healthDamage: e.healthDamage }),
      ...(e.shieldBroken === undefined ? {} : { shieldBroken: e.shieldBroken }),
      ...(e.critical === undefined ? {} : { critical: e.critical }),
      ...(e.loot?{loot:{...e.loot}}:{}),
    })),
    eventId: m.eventId, result: m.result, winner: m.winner, serverNow, roomId,
  };
}
