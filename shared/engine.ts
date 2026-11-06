import {planUnitPlacement} from "./placement";
import { combatSeed } from "./damage";
import { attackIntervalMs } from "./attack-speed";
import { STARTING_LEVEL, MAX_LEVEL, EXPERIENCE_BUY_COST, EXPERIENCE_BUY_AMOUNT, ROUND_EXPERIENCE, grantExperience, deploymentLimit, deployedCount } from "./progression";
import { freeBenchSlot, acquireUnit } from "./bench";
import {mergeRoster} from './merge';
import {isBot,practicePairs} from './bot-practice';
import {createMinionBattles,isMinionRound,minionStats,sameArena} from './minions';
import {grantItem} from './crafting';
import {pickPoolKind} from './unit-pool';
import { STARTING_HEALTH, basePlayerDamage, interestFor, streakGold, WIN_GOLD } from "./match-rules";
import { STARTING_GOLD, unitSellPrice, ROUND_INCOME, REROLL_COST, refreshShop, canRefreshShop, removeMaxRankOffers, shopActionsOpen, economyActionOpen, readyActionOpen, sellActionOpen } from "./shop";
import { canClaimUnit } from "./unit-pool";
import { SkillSystem, createSkillStates, combatStats, STEP_MS } from "./skills";
import { offerRoundReward, chooseReward, autoClaimReward } from "./rewards";
import { craftItems } from "./crafting";
import { evaluateSynergies, bonusFor } from "./synergy";
import {
  COLS,
  ROWS,
  MAX_EQUIPMENT,
  PREP_MS,
  MATCHING_MS,
  COMBAT_MS,
  OVERTIME_MS,
  RESULT_MS,
  MAX_ROUNDS,
  type Match,
  type MatchMode,
  type Roster,
  type Player,
  type Action,
  type Fighter,
  type RoundResult,
  type RewardOption,
} from "./model";
import {
  UNITS,
  EQUIPMENT,
  statsFor,
  unitKindsFor,
  type Hook,
  type EffectContext,
} from "./catalog";
export function newMatch(mode:MatchMode="duel",minionRounds=0): Match {
  return {
    overtime:false,
    minionRounds,
    mode,
    endReason: null,
    roundHistory: [],
    phase: "waiting",
    round: 0,
    deadline: 0,
    players: [],
    fighters: [],
    events: [],
    eventId: 0,
    result: "상대가 입장하면 준비 시간이 시작됩니다.",
    winner: null,
    lastTick: 0,
    combatStartedAt: 0,
    combatRandomState: 1,
  };
}
export function newPlayer(id: string, name: string, roster?: Roster): Player {
  const player: Player = {
    nextItemId: 0, nextRewardId: 0, pendingReward: null, lastReward: null,
    mergeRevision: 0, lastMerge: null,
    health: STARTING_HEALTH, streak: null, streakCount: 0, roundInterest: 0,
    lastIncome: {base: 0, interest: 0, streak: 0, total: 0},
    level: STARTING_LEVEL, experience: 0, experienceRevision: 0,
    gold: STARTING_GOLD, shop: [], shopRevision: 0, nextOfferId: 0, nextUnitId: 0,
    id,
    name,
    ...(roster ? { roster } : {}),
    connected: true,
    ready: false,
    score: 0,
    units: [],
    inventory: [],
  };
  if (!roster) refreshShop(player);
  return player;
}
export function prepare(m: Match, now: number) {
  m.endReason = null;
  m.phase = "prepare";
  m.overtime=false;
  m.round++;
  m.pvpBattles=undefined;
  m.minionBattles=isMinionRound(m)?createMinionBattles(m.players,m.round):undefined;
  m.deadline = now + PREP_MS;
  m.fighters = [];
  m.events = [];
  m.result = "배치 후 준비 완료를 누르세요.";
  if(m.round>1)for(const p of m.players)p.shop=[];
  m.players.forEach((p) => {
    if(m.mode==='botPractice'&&p.health<=0){p.ready=true;return;}
    p.ready = false;
    mergeRoster(p);
    if(m.round===1&&!p.shop.length)refreshShop(p,Math.random,m.players);
    if (m.round > 1) {
      const interest = p.roundInterest, streak = 0;
      const total = ROUND_INCOME + interest;
      p.gold += total;
      p.lastIncome = {base: ROUND_INCOME, interest, streak, total};
      p.roundInterest = 0;
      grantExperience(p, ROUND_EXPERIENCE);
      // Refresh once on the next preparation, before the practice bot shops.
      // Round one already has the initial offers created by newPlayer().
      refreshShop(p,Math.random,m.players);
    }
    removeMaxRankOffers(p,m.players);
    offerRoundReward(p, m.round,Math.random,m.players);
    if (isBot(p)) { autoClaimReward(p); botSetup(p,m.players); if(m.mode==='botPractice')p.ready=true; }
  });
}
export function applyAction(
  m: Match,
  playerId: string,
  input: unknown,
  now: number,
): string | null {
  const p = m.players.find((p) => p.id === playerId);
  if (!p) return "참가자를 찾을 수 없습니다.";
  if(m.mode==='botPractice'&&p.health<=0)return "탈락 후에는 관전만 가능합니다. 디버깅 프리셋으로 다시 시작할 수 있습니다.";
  if (!input || typeof input !== "object") return "잘못된 요청입니다.";
  const a = input as Action;
  if(a.type==='ready'){
    if(!readyActionOpen(m.phase,p.ready,now,m.deadline))return "지금은 준비 완료를 변경할 수 없습니다.";
    if(m.phase==='matching')return null; // Reconfirm without restarting or shortening matching.
    autoClaimReward(p);p.ready=true;
    if(m.players.length>=2&&m.players.every(p=>p.ready))finishPreparation(m,now);
    return null;
  }
  const shopAction = a.type === "buy" || a.type === "reroll";
  // Purchases, sales and equipment edit the persistent roster; placement still locks
  // at battle start. Current fighters retain their battle-start stats/loadout.
  const supplyAction = shopAction || a.type === "sell" || a.type === "buyExperience" || a.type === "equip" || a.type === "unequip";
  if (supplyAction) {
    const open=shopAction||a.type==='buyExperience'?economyActionOpen(a.type as 'buy'|'reroll'|'buyExperience',m.phase,p.ready,now,m.deadline):shopActionsOpen(m.phase,p.ready,now,m.deadline);
    if (!open)
      return shopAction ? "상점은 준비 완료 전, 전투 중, 라운드 결과 시간에 이용할 수 있습니다."
        : a.type === "sell" ? "유닛 판매는 준비 완료 전, 전투 중 대기석, 라운드 결과 시간에 가능합니다."
        : "경험치 구매와 장비 변경은 준비 완료 전, 전투 중, 라운드 결과 시간에 가능합니다.";
  } else if (m.phase !== "prepare" || now >= m.deadline) {
    return "지금은 배치를 변경할 수 없습니다.";
  }
  if (p.ready && !supplyAction) return "준비 완료 후에는 배치를 변경할 수 없습니다.";
  if (a.type === "chooseReward") return chooseReward(p, a.rewardId, a.optionId,false,m.players);
  if (a.type === "craft") return craftItems(p, a.itemIds);
  if (a.type === "buyExperience") {
    if (!Number.isInteger(a.revision) || a.revision !== p.experienceRevision)
      return "경험치가 갱신되었습니다. 다시 선택하세요.";
    if (p.level >= MAX_LEVEL) return "최대 10레벨입니다.";
    if (p.gold < EXPERIENCE_BUY_COST) return "골드가 부족합니다.";
    p.gold -= EXPERIENCE_BUY_COST;
    grantExperience(p, EXPERIENCE_BUY_AMOUNT);
    return null;
  }
  if (a.type === "sell") {
    const index = p.units.findIndex(u => u.id === a.unitId);
    if (index < 0) return "판매할 보유 유닛을 찾을 수 없습니다.";
    if(!sellActionOpen(m.phase,p.ready,now,m.deadline,p.units[index],m.fighters))return "전투 중에는 대기석 유닛만 판매할 수 있습니다.";
    const proceeds = unitSellPrice(p.units[index]);
    for (const item of p.inventory) if (item.unitId === a.unitId) item.unitId = null;
    p.units.splice(index, 1);
    p.gold += proceeds;
    return null;
  }
  if (a.type === "buy" || a.type === "reroll") {
    if (!Number.isInteger(a.revision) || a.revision !== p.shopRevision)
      return "상점이 갱신되었습니다. 다시 선택하세요.";
    if (a.type === "reroll") {
      if (p.gold < REROLL_COST) return "골드가 부족합니다.";
      if (!canRefreshShop(p,m.players)) return "현재 뽑을 수 있는 유닛이 없습니다.";
      p.gold -= REROLL_COST;
      refreshShop(p,Math.random,m.players);
    } else {
      const slot = p.shop.findIndex((offer) => offer.id === a.offerId);
      if (slot < 0) return "구매할 수 없는 상품입니다.";
      const offer = p.shop[slot];
      if (offer.sold) return "이미 구매한 상품입니다. 리롤하면 새 상품이 나옵니다.";
      if (!canClaimUnit(p,offer.kind,m.players,{offerId:offer.id})) return "이 유닛은 3성을 완성했거나 공유 풀에 남아 있지 않습니다.";
      if (p.gold < offer.cost) return "골드가 부족합니다.";
      if (!acquireUnit(p, offer.kind, m.phase === 'prepare')) return "대기석이 가득 찼습니다. 빈자리를 만들어 주세요.";
      p.gold -= offer.cost;
      offer.sold = true;
      p.shopRevision++;
      removeMaxRankOffers(p,m.players);
    }
    return null;
  }
  if (a.type === "place" || a.type === "bench") {
    const unit = p.units.find(u => u.id === a.unitId);
    if (!unit) return "내 캐릭터만 배치할 수 있습니다.";
    const destination = a.type === "place" ? {kind: "cell" as const, x: a.x, y: a.y}
      : {kind: "bench" as const, slot: a.slot === undefined ? (unit.x < 0 ? unit.benchSlot ?? -1 : freeBenchSlot(p)) : a.slot};
    const plan = planUnitPlacement(p, unit.id, destination);
    if (plan.error) return plan.error;
    // Validate the whole move before applying either side of a swap.
    for (const move of plan.moves) {
      const target = p.units.find(u => u.id === move.unitId)!;
      Object.assign(target, {x: move.x, y: move.y, benchSlot: move.benchSlot});
    }
    return null;
  }
  if (a.type === "equip" || a.type === "unequip") {
    const item = p.inventory.find((i) => i.id === a.itemId);
    if (!item) return "보유하지 않은 장비입니다.";
    if (a.type === "unequip") {
      for (const u of p.units)
        u.equipment = u.equipment.filter((id) => id !== item.id);
      item.unitId = null;
      return null;
    }
    const u = p.units.find((u) => u.id === a.unitId);
    if (!u) return "내 캐릭터를 선택하세요.";
    if (EQUIPMENT[item.definition]?.category === "material") return "재료는 장착할 수 없습니다. 재료 조합에서 제작하세요.";
    if (item.unitId === u.id) return null;
    if (u.equipment.length >= MAX_EQUIPMENT)
      return `캐릭터당 장비는 ${MAX_EQUIPMENT}개까지입니다.`;
    for (const v of p.units)
      v.equipment = v.equipment.filter((id) => id !== item.id);
    u.equipment.push(item.id);
    item.unitId = u.id;
    return null;
  }
  return "알 수 없는 요청입니다.";
}
function hooks(m: Match, f: Fighter, hook: Hook, ctx: EffectContext) {
  const p = m.players.find((p) => p.id === f.owner)!;
  if(!p)return;
  for (const id of f.equipment) {
    const item = p.inventory.find((i) => i.id === id);
    if (item) EQUIPMENT[item.definition]?.hooks?.[hook]?.(ctx);
  }
}
export function finishPreparation(m:Match,now:number) {
  if(m.mode==='practice'||isMinionRound(m)){startCombat(m,now);return;}
  for(const p of m.players){autoClaimReward(p);p.ready=true;}
  m.phase='matching';m.deadline=now+MATCHING_MS;
  m.fighters=[];m.events=[];m.result='대전 상대 매칭 중';
}
export function startCombat(m: Match, now: number) {
  if(m.mode==='botPractice'&&!isMinionRound(m))m.pvpBattles=practicePairs(m.players,m.round-(m.minionRounds??0)-1);
  for (const p of m.players) { autoClaimReward(p); p.roundInterest = interestFor(p.gold); }
  m.phase = "combat";
  m.overtime=false;
  m.result = "캐릭터가 자동으로 이동하고 공격합니다.";
  m.winner = null;
  m.deadline = now + COMBAT_MS;
  m.lastTick = now;
  m.combatStartedAt = now;
  m.combatRandomState = combatSeed(m.round, m.players.map(p => p.id));
  m.events = [];
  m.fighters = m.players.flatMap((p, side) => {
    const battle=m.pvpBattles?.find(b=>b.players.includes(p.id));
    if(m.mode==='botPractice'&&(p.health<=0||(!isMinionRound(m)&&!battle)))return [];
    if(battle)side=battle.players.indexOf(p.id);
    const deployed = p.units.filter(u => u.x >= 0).slice(0, deploymentLimit(p));
    const synergies = evaluateSynergies(deployed);
    return deployed.map((u) => {
      const bonus = bonusFor(u.kind, synergies);
      const stats = statsFor(u, p.inventory, bonus);
      return {
        ...u,
        equipment: [...u.equipment],
        x: side === 0 ? u.x : COLS - 1 - u.x,
        y: side === 0 || isMinionRound(m) ? ROWS - 1 - u.y : u.y,
        ...(isMinionRound(m)?{arena:p.id,x:u.x}:{}),
        ...(battle?{arena:battle.arena}:{}),
        hp: stats.hp,
        maxHp: stats.hp,
        stats,
        nextAttack: now + 400,
        nextMove: now + 100,
        shield: bonus.shield ?? 0,
        basicAttacks: 0,
        contribution: {damageDealt: 0, damageTaken: 0, healing: 0, shieldBlocked: 0},
        buffs: [],
        skills: createSkillStates(u.kind, now),
      };
    });
  });
  if(isMinionRound(m)){
    m.minionBattles??=createMinionBattles(m.players,m.round);
    for(const battle of m.minionBattles){
      delete battle.outcome;
      for(const unit of battle.opponent.units){
        const stats=minionStats(unit);
        m.fighters.push({...unit,x:COLS-1-unit.x,equipment:[],arena:battle.owner,hp:stats.hp,maxHp:stats.hp,stats,
          nextAttack:now+600,nextMove:now+200,shield:0,basicAttacks:0,buffs:[],skills:[],
          contribution:{damageDealt:0,damageTaken:0,healing:0,shieldBlocked:0}});
      }
    }
    m.result='미니언을 처치하면 보상을 자동으로 획득합니다.';
  }
  for (const f of m.fighters)
    hooks(m, f, "battleStart", { self: f, damage: 0 });
  new SkillSystem(m, now).begin();
  resolve(m, now);
}
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
function nextStep(
  m: Match,
  f: Fighter,
  target: Fighter,
  range: number,
): { x: number; y: number } | null {
  const blocked = new Set(
    m.fighters
      .filter((v) => v.hp > 0 && v.id !== f.id && sameArena(f,v))
      .map((v) => `${v.x},${v.y}`),
  );
  const visited = new Set([`${f.x},${f.y}`]);
  const queue: {
    x: number;
    y: number;
    first: { x: number; y: number } | null;
  }[] = [{ x: f.x, y: f.y, first: null }];
  for (let n = 0; n < queue.length; n++) {
    const c = queue[n];
    if (distance(c, target) <= range) return c.first;
    for (const [dx, dy] of [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ]) {
      const x = c.x + dx,
        y = c.y + dy,
        key = `${x},${y}`;
      if (
        x < 0 ||
        x >= COLS ||
        y < 0 ||
        y >= ROWS ||
        blocked.has(key) ||
        visited.has(key)
      )
        continue;
      visited.add(key);
      queue.push({ x, y, first: c.first ?? { x, y } });
    }
  }
  return null;
}
export function tick(m: Match, now: number) {
  if (m.phase === "prepare" && now >= m.deadline) {
    finishPreparation(m, now);
    return;
  }
  if (m.phase === "matching" && now >= m.deadline) {
    startCombat(m, now);
    return;
  }
  if (m.phase === "result" && now >= m.deadline) {
    const eliminated=m.mode==='botPractice'?m.players.filter(p=>p.health>0).length<=1:m.players.some(p=>p.health<=0);
    if (m.round >= MAX_ROUNDS || eliminated) {
      m.endReason = eliminated ? "elimination" : "roundLimit";
      m.phase = "finished";
      m.deadline = 0;
      const [a, b] = [...m.players].sort((a,b)=>b.health-a.health||b.score-a.score);
      // Health decides survival; at the round cap, wins break a health tie.
      m.winner = a.health === 0 && b.health === 0 ? null
        : a.health !== b.health ? (a.health > b.health ? a.id : b.id)
        : a.score === b.score ? null : a.score > b.score ? a.id : b.id;
      m.result = m.winner
        ? `${m.players.find((p) => p.id === m.winner)!.name} 최종 승리`
        : "최종 무승부";
    } else prepare(m, now);
    return;
  }
  if (m.phase !== "combat") return;
  // Fixed authoritative 100 ms steps. Timer jitter does not change cost gain/drain.
  if (!Number.isFinite(now) || now < m.lastTick) return;
  while (m.phase === "combat" && m.lastTick + STEP_MS <= Math.min(now,m.deadline)) {
    m.lastTick += STEP_MS;
    combatStep(m, m.lastTick);
  }
  if (m.phase === "combat" && now >= m.deadline){
    if(isMinionRound(m)){resolveMinions(m,m.deadline,true);}
    else if(m.pvpBattles){resolvePractice(m,m.deadline,true);}
    else finish(m, m.deadline, null, "전투 시간 초과 · 무승부", "timeout");
  }
}
function combatStep(m: Match, now: number) {
  if(!m.overtime&&now>=m.combatStartedAt+COMBAT_MS){
    m.overtime=true;m.deadline=m.combatStartedAt+COMBAT_MS+OVERTIME_MS;
    m.result='피버타임 · 공격 속도와 피해량이 점점 증가합니다.';
    for(const f of m.fighters)if(!f.inactive&&f.hp>0){
      f.overtimeAt=m.combatStartedAt+COMBAT_MS;
      f.nextAttack=now+Math.max(0,f.nextAttack-now)/1.1;
      f.nextMove=now+Math.max(0,f.nextMove-now)/1.5;
    }
  }
  const skills = new SkillSystem(m, now);
  skills.advance();
  resolve(m, now);
  if (m.phase !== "combat") return;
  const order = [...m.fighters];
  if (Math.floor((now - m.combatStartedAt) / STEP_MS) % 2) order.reverse();
  for (const f of order) {
    if (f.hp <= 0 || f.inactive) continue;
    const stats = combatStats(f, now).stats;
    const enemies = m.fighters
      .filter((v) => v.owner !== f.owner && v.hp > 0 && !v.inactive && sameArena(f,v))
      .sort(
        (a, b) => distance(f, a) - distance(f, b) || a.id.localeCompare(b.id),
      );
    const target = enemies[0];
    if (!target) continue;
    if (distance(f, target) <= stats.range) {
      if (now < f.nextAttack) continue;
      f.nextAttack = now + attackIntervalMs(stats.interval);
      skills.basicAttack(f, target);
    } else if (now >= f.nextMove) {
      f.nextMove = now + stats.moveMs;
      const step = nextStep(m, f, target, stats.range);
      if (step) {
        f.x = step.x;
        f.y = step.y;
      }
    }
  }
  resolve(m, now);
}

function resolve(m: Match, now: number) {
  if(isMinionRound(m)){resolveMinions(m,now);return;}
  if(m.pvpBattles){resolvePractice(m,now);return;}
  const alive = m.players.filter((p) =>
    m.fighters.some((f) => f.owner === p.id && f.hp > 0),
  );
  if (alive.length <= 1)
    finish(
      m,
      now,
      alive[0]?.id ?? null,
      alive.length ? `${alive[0].name} 라운드 승리` : "양쪽 전멸 · 무승부",
    );
}
function resolveMinions(m:Match,now:number,timeout=false){
  for(const battle of m.minionBattles??[]){
    const player=m.players.find(p=>p.id===battle.owner)!;
    const enemies=m.fighters.filter(f=>f.owner===battle.opponent.id);
    for(const enemy of enemies){
      if(enemy.hp>0||enemy.lootGranted)continue;
      enemy.lootGranted=true;
      const index=battle.opponent.units.findIndex(u=>u.id===enemy.id),wave=m.round;
      const types=wave===1?['unit','gold']:wave===2?(index===0?['item']:['gold']):[index===0?'item':index===1?'unit':'gold'];
      for(const type of types){
        const id=`loot:${enemy.id}:${type}`;let loot:RewardOption;
        if(type==='unit'){
          const kind=pickPoolKind(player,m.players,()=>combatSeed(wave,[enemy.id])/0x100000000,unitKindsFor(player.roster).filter(kind=>UNITS[kind].rarity<=2));
          loot=kind&&acquireUnit(player,kind,false)?{id,type:'unit',kind}:{id,type:'gold',amount:kind?UNITS[kind].rarity:2};
        }else if(type==='item'){
          const definition=wave===2?'iron':'blade';grantItem(player,definition);loot={id,type:'item',definition};
        }else loot={id,type:'gold',amount:wave===3?3:2};
        if(loot.type==='gold')player.gold+=loot.amount;
        m.events.push({id:++m.eventId,type:'loot',source:enemy.id,target:enemy.id,amount:loot.type==='gold'?loot.amount:1,loot});
      }
      m.events=m.events.slice(-80);
    }
    if(battle.outcome)continue;
    const ownAlive=m.fighters.some(f=>f.owner===player.id&&f.hp>0),enemyAlive=enemies.some(f=>f.hp>0);
    if(!timeout&&ownAlive&&enemyAlive)continue;
    battle.outcome=!enemyAlive&&ownAlive?'win':enemyAlive?'loss':'draw';
    new SkillSystem(m,now).endBattle(battle.owner);
    for(const f of m.fighters)if(f.arena===battle.owner)f.inactive=true;
  }
  if(!m.minionBattles?.length||m.minionBattles.some(b=>!b.outcome))return;
  m.phase='result';m.deadline=now+RESULT_MS;m.winner=null;m.result='미니언 전투 종료 · 처치 보상 지급 완료';
  m.roundHistory.push({round:m.round,encounter:'minion',winner:null,reason:timeout?'timeout':'victory',
    players:m.minionBattles.flatMap(b=>{
      const p=m.players.find(p=>p.id===b.owner)!;
      const enemies=m.fighters.filter(f=>f.owner===b.opponent.id),maxHp=enemies.reduce((n,f)=>n+f.maxHp,0),hp=enemies.reduce((n,f)=>n+Math.max(0,f.hp),0);
      return [{id:p.id,name:p.name,healthBefore:p.health,healthAfter:p.health,damage:0,
        survivors:m.fighters.filter(f=>f.owner===p.id&&f.hp>0).length,outcome:b.outcome,opponentId:b.opponent.id},
        {id:b.opponent.id,name:b.opponent.name,healthBefore:maxHp,healthAfter:hp,damage:maxHp-hp,
        survivors:enemies.filter(f=>f.hp>0).length,outcome:b.outcome==='win'?'loss' as const:b.outcome==='draw'?'draw' as const:'win' as const,opponentId:p.id}];
    }),units:m.fighters.map(f=>({id:f.id,owner:f.owner,kind:f.kind,rank:f.rank,...(f.minion?{minion:{...f.minion}}:{}),...f.contribution}))});
}
function resolvePractice(m:Match,now:number,timeout=false){
  for(const battle of m.pvpBattles??[]){
    if(battle.results)continue;
    const players=battle.players.map(id=>m.players.find(p=>p.id===id)!);
    const survivors=players.map(p=>m.fighters.filter(f=>f.owner===p.id&&f.hp>0).length);
    if(!timeout&&survivors.every(n=>n>0))continue;
    const winner=survivors[0]>0&&survivors[1]===0?players[0].id:survivors[1]>0&&survivors[0]===0?players[1].id:null;
    const damage=basePlayerDamage(m.round)+(winner?Math.min(3,survivors[players.findIndex(p=>p.id===winner)]):0);
    battle.timeout=timeout;
    battle.results=players.map((p,i)=>{
      const healthBefore=p.health,outcome=winner===null?'draw':winner===p.id?'win':'loss';
      if(outcome==='draw'){p.streak=null;p.streakCount=0;}
      else {p.streakCount=p.streak===outcome?p.streakCount+1:1;p.streak=outcome;}
      if(outcome==='win'){p.score++;p.gold+=WIN_GOLD;}
      else p.health=Math.max(0,p.health-damage);
      const bonus=outcome==='draw'?0:streakGold(p.streakCount);
      p.gold+=bonus;p.lastIncome={base:0,interest:0,streak:bonus,total:bonus};
      return {id:p.id,name:p.name,opponentId:players[1-i].id,outcome,healthBefore,healthAfter:p.health,
        damage:healthBefore-p.health,survivors:survivors[i],...(bonus?{streakGold:bonus}:{})};
    });
    new SkillSystem(m,now).endBattle(battle.arena);
    for(const f of m.fighters)if(f.arena===battle.arena)f.inactive=true;
  }
  if(m.pvpBattles?.some(b=>!b.results))return;
  const results=m.pvpBattles?.flatMap(b=>b.results??[])??[];
  for(const p of m.players.filter(p=>p.health>0&&!results.some(r=>r.id===p.id)))
    results.push({id:p.id,name:p.name,healthBefore:p.health,healthAfter:p.health,damage:0,survivors:0,bye:true,outcome:'draw'});
  m.roundHistory.push({round:m.round,winner:null,reason:timeout?'timeout':'victory',players:results,
    units:m.fighters.map(f=>({id:f.id,owner:f.owner,kind:f.kind,rank:f.rank,...f.contribution}))});
  // Return eliminated rosters and offers to the shared pool; frozen fighters remain for review.
  for(const p of m.players.filter(p=>p.health<=0)){
    p.units=[];p.shop=[];p.pendingReward=null;
    // Keep definitions for frozen fighters' worn equipment during result inspection.
    for(const item of p.inventory)item.unitId=null;
  }
  m.phase='result';m.deadline=now+RESULT_MS;m.winner=null;m.result='모든 전장 전투 종료';
}
function finish(m: Match, now: number, winner: string | null, message: string, reason: RoundResult["reason"] = winner === null ? "elimination" : "victory") {
  if (m.phase !== "combat") return;
  const healthBefore = new Map(m.players.map(p => [p.id, p.health]));
  new SkillSystem(m, now).endBattle();
  m.phase = "result";
  m.deadline = now + RESULT_MS;
  m.winner = winner;
  m.result = message;
  const survivors = m.fighters.filter(f => f.owner === winner && f.hp > 0).length;
  const damage = basePlayerDamage(m.round) + (winner ? Math.min(3, survivors) : 0);
  for (const p of m.players) {
    if (winner === null) {
      p.streak = null; p.streakCount = 0;
      p.health = Math.max(0, p.health - damage);
    } else {
      const outcome = p.id === winner ? "win" : "loss";
      p.streakCount = p.streak === outcome ? p.streakCount + 1 : 1;
      p.streak = outcome;
      if (outcome === "win") { p.score++; p.gold += WIN_GOLD; }
      else p.health = Math.max(0, p.health - damage);
    }
    const bonus=winner===null?0:streakGold(p.streakCount);
    p.gold+=bonus;
    p.lastIncome={base:0,interest:0,streak:bonus,total:bonus};
  }
  // A completed battle is recorded once. Save actual HP lost, including lethal
  // clamping, and survivor counts from fighters rather than the mutable roster.
  m.roundHistory.push({round: m.round, winner, reason, players: m.players.map(p => ({
    id: p.id, name: p.name, healthBefore: healthBefore.get(p.id)!, healthAfter: p.health,
    damage: healthBefore.get(p.id)! - p.health,
    ...(p.lastIncome.streak?{streakGold:p.lastIncome.streak}:{}),
    survivors: m.fighters.filter(f => f.owner === p.id && f.hp > 0).length,
  })), units: m.fighters.map(f => ({
    id: f.id, owner: f.owner, kind: f.kind, rank: f.rank,
    damageDealt: f.contribution.damageDealt, damageTaken: f.contribution.damageTaken,
    healing: f.contribution.healing, shieldBlocked: f.contribution.shieldBlocked,
  }))});
  m.result += winner ? ` · 상대 체력 −${damage}` : ` · 양쪽 체력 −${damage}`;
}
export function botSetup(p: Player, players: readonly Player[] = [p]) {
  // Spend genuine income: level and buy units without spawning free reinforcements.
  if (isBot(p)) {
    while (p.level < MAX_LEVEL && p.gold >= (p.bot?18:34) && p.level < 8) {
      p.gold -= EXPERIENCE_BUY_COST;
      grantExperience(p, EXPERIENCE_BUY_AMOUNT);
    }
    while (p.units.length < deploymentLimit(p)) {
      let offer = p.shop.find(o => !o.sold && o.cost <= p.gold && canClaimUnit(p,o.kind,players,{offerId:o.id}));
      if (!offer) {
        if (p.gold < REROLL_COST + 3) break;
        if (!canRefreshShop(p,players)) break;
        p.gold -= REROLL_COST; refreshShop(p,Math.random,players);
        offer = p.shop.find(o => !o.sold && o.cost <= p.gold && canClaimUnit(p,o.kind,players,{offerId:o.id}));
      }
      if (!offer || !acquireUnit(p, offer.kind)) break;
      p.gold -= offer.cost; offer.sold = true; p.shopRevision++;
      removeMaxRankOffers(p,players);
    }
    if(p.bot){
      // Buy additional copies for upgrades, with a bounded reroll budget.
      for(let roll=0;roll<3;roll++){
        for(const offer of p.shop){
          if(offer.sold||offer.cost>p.gold||!canClaimUnit(p,offer.kind,players,{offerId:offer.id}))continue;
          if(!acquireUnit(p,offer.kind))continue;
          p.gold-=offer.cost;offer.sold=true;p.shopRevision++;removeMaxRankOffers(p,players);
        }
        if(p.gold<REROLL_COST+5||!canRefreshShop(p,players))break;
        p.gold-=REROLL_COST;refreshShop(p,Math.random,players);
      }
      p.units.sort((a,b)=>b.rank-a.rank||UNITS[b.kind].rarity-UNITS[a.kind].rarity);
    }
  }
  p.units.forEach((u, i) => {
    const deployed = i < deploymentLimit(p);
    u.x = deployed ? i % COLS : -1;
    u.y = deployed ? (UNITS[u.kind].stats.range === 1 ? ROWS / 2 - 1 : 0) : -1;
    // Avoid collisions when a role wraps to another row after COLS units.
    if (deployed && p.units.slice(0, i).some(v => v.x === u.x && v.y === u.y)) u.y = 1;
    u.benchSlot = deployed ? null : i - deploymentLimit(p);
  });
  if(p.bot)for(const item of p.inventory){
    if(item.unitId||EQUIPMENT[item.definition]?.category==='material')continue;
    const unit=p.units.find(u=>u.x>=0&&u.equipment.length<MAX_EQUIPMENT);
    if(unit){item.unitId=unit.id;unit.equipment.push(item.id);}
  }
}
