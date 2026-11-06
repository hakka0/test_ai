import { createOffer, SHOP_SIZE, removeMaxRankOffers } from "../shared/shop";
import type { DebugAction, DebugState, Match, Player, Trait } from "../shared/model";
import { PREP_MS } from "../shared/model";
import { newMatch, newPlayer, botSetup, tick } from "../shared/engine";
import { GameClock, advanceMatch } from "../shared/game-time";
import { unitPrice } from "../shared/shop";
import { grantItem } from "../shared/crafting";
import { offerRoundReward, autoClaimReward } from "../shared/rewards";
import { UNIT_KINDS, CORE_UNIT_KINDS, UNITS } from "../shared/catalog";
import {createMinionBattles} from '../shared/minions';
import {isBot} from '../shared/bot-practice';

export function debugAllowed(enabled: boolean, practice: boolean, viewerId: string, m: Match): boolean {
  return enabled && practice && m.players.some(p => p.id === viewerId && !isBot(p));
}
export class DebugSession {
  generation = 0;
  private checkpoint?: { match: Match; now: number };
  state(clock: GameClock): DebugState {
    return {speed: clock.speed, paused: clock.paused, hasCheckpoint: !!this.checkpoint, generation: this.generation};
  }
  apply(m: Match, clock: GameClock, input: unknown, realNow: number): string | null {
    if (!input || typeof input !== "object") return "잘못된 디버깅 요청입니다.";
    const action = input as DebugAction;
    switch (action.type) {
      case "speed":
        if (![1, 2, 5, 10].includes(action.value)) return "배속은 1·2·5·10배만 가능합니다.";
        clock.speed = action.value;
        return null;
      case "pause":
        if (typeof action.paused !== "boolean") return "일시정지 값이 잘못되었습니다.";
        clock.paused = action.paused;
        return null;
      case "step":
        if (!clock.paused) return "일시정지 후 단계 진행을 사용하세요.";
        if (![100, 1000].includes(action.ms)) return "진행 단위는 0.1초 또는 1초입니다.";
        clock.seek(clock.now + action.ms, realNow);
        advanceMatch(m, clock.now);
        return null;
      case "nextPhase":
        if (!m.deadline || m.phase === "finished" || m.phase === "waiting") return "진행할 단계가 없습니다.";
        if (m.phase === "combat") {
          // Stop at the actual end of combat instead of skipping the result
          // phase when a fight finishes before its time limit.
          while (m.phase === "combat") {
            clock.seek(Math.min(m.deadline, Math.max(clock.now, m.lastTick) + 100), realNow);
            tick(m, clock.now);
          }
        } else {
          clock.seek(Math.max(clock.now, m.deadline), realNow);
          tick(m, clock.now);
        }
        return null;
      case "preset": {
        if (m.players.some(p => p.roster === "blueArchive")) return "블루 아카이브 테스트에서는 기본 유닛 프리셋을 사용할 수 없습니다.";
        const configs = {
          overtime: {round:4,level:1,gold:30,health:100},
          minion: {round: 1, level: 1, gold: 10, health: 100},
          reward: {round: 5, level: 4, gold: 30, health: 100},
          synergy: {round: 7, level: 6, gold: 30, health: 100},
          synergyBulwark: {round:7,level:6,gold:100,health:100},
          synergyScout: {round:7,level:6,gold:100,health:100},
          synergyArcane: {round:7,level:6,gold:100,health:100},
          merge: {round: 1, level: 3, gold: 10, health: 100},
          early: {round: 1, level: 1, gold: 10, health: 100},
          mid: {round: 13, level: 7, gold: 50, health: 75},
          late: {round: 19, level: 8, gold: 60, health: 50},
          level10: {round: 25, level: 10, gold: 40, health: 35},
        };
        if (!Object.hasOwn(configs, action.preset)) return "알 수 없는 시작 상태입니다.";
        const config = configs[action.preset];
        const focus:Partial<Record<string,Trait>>={synergyBulwark:'bulwark',synergyScout:'scout',synergyArcane:'arcane'};
        const focusedTrait=focus[action.preset];
        // Six unique deployed kinds, with all other twelve kinds on the bench.
        const roster=focusedTrait?[...UNIT_KINDS.filter(k=>UNITS[k].trait===focusedTrait),...UNIT_KINDS.filter(k=>UNITS[k].trait!==focusedTrait)]:null;
        const players = m.players.map(p => {
          const fresh = newPlayer(p.id, p.name);
          fresh.bot=p.bot;
          fresh.connected = p.connected;
          Object.assign(fresh, {level: config.level, gold: config.gold, health: config.health});
          fresh.experienceRevision = p.experienceRevision + 1;
          fresh.shopRevision = p.shopRevision + 1;
          // Keep all allocations unique across resets, including late old UI requests.
          fresh.nextUnitId = p.nextUnitId;
          fresh.nextItemId = p.nextItemId;
          fresh.nextRewardId = p.nextRewardId;
          // Explicit debug fixtures carry equipment; ordinary new players do not.
          for (const definition of ["blade", "armor", "charm"]) grantItem(fresh, definition);
          fresh.nextOfferId = p.nextOfferId;
          fresh.shop.forEach(o => o.id = `${p.id}-offer-${fresh.nextOfferId++}`);
          fresh.units = [];
          // Fixtures already contain upgraded units; ordinary acquisitions still merge.
          for (let i = 0; i < (roster?.length??Math.max(3, config.level)); i++) fresh.units.push({
            id: `${fresh.id}-${fresh.nextUnitId++}`, owner: fresh.id,
            kind: roster?.[i]??(action.preset === "synergy" ? CORE_UNIT_KINDS[i] : (["knight", "ranger", "mage"] as const)[i % 3]),
            rank: roster||action.preset === "synergy" ? 1 : (Math.min(3, 1 + Math.floor(i / 3))) as 1 | 2 | 3,
            x: -1, y: -1, benchSlot: i, equipment: [],
          });
          if(action.preset==='overtime')fresh.units.forEach(u=>{u.kind='warden';u.rank=1;});
          arrange(fresh);
          if (action.preset === "merge") {
            fresh.units[1].kind = "knight";
            fresh.units[1].x = fresh.units[1].y = -1; fresh.units[1].benchSlot = 0;
            fresh.units[2].x = fresh.units[2].y = -1; fresh.units[2].benchSlot = 1;
            Object.assign(fresh.shop[0], {kind: "knight", cost: unitPrice("knight"), sold: false});
          }
          if (config.level > 1) fresh.inventory.forEach((item, i) => {
            const unit = fresh.units[i]; item.unitId = unit.id; unit.equipment.push(item.id);
          });
          if (action.preset === "reward") for (const definition of ["iron", "iron", "cloth", "crystal"]) grantItem(fresh, definition);
          offerRoundReward(fresh, config.round);
          if (isBot(fresh)){autoClaimReward(fresh);fresh.ready=m.mode==='botPractice';}
          return fresh;
        });
        for(const player of players)removeMaxRankOffers(player,players);
        if(m.mode==='botPractice'){
          // newPlayer initially draws against itself. Six populated fixtures must
          // reserve offers together after every roster exists, not independently.
          for(const player of players)player.shop=[];
          if(action.preset==='merge')for(const player of players)player.shop.push({
            id:`${player.id}-offer-${player.nextOfferId++}`,kind:'knight',cost:unitPrice('knight'),sold:false,
          });
          for(const player of players){
            while(player.shop.length<SHOP_SIZE){const offer=createOffer(player,Math.random,players);if(!offer)break;player.shop.push(offer);}
            player.shopRevision++;
          }
        }
        const mode=m.mode==='botPractice'?'botPractice':action.preset==='minion'?'duel':'practice';
        const minionRounds=action.preset==='minion'?3:0;
        Object.assign(m, newMatch(mode,minionRounds), {pvpBattles:undefined,players, round: config.round, phase: "prepare", deadline: clock.now + PREP_MS, result: "디버깅 시작 상태를 불러왔습니다.",minionBattles:action.preset==='minion'?createMinionBattles(players,1):undefined});
        this.generation++;
        return null;
      }
      case "save":
        this.checkpoint = {match: structuredClone(m), now: clock.now};
        return null;
      case "load":
        if (!this.checkpoint) return "먼저 상태를 저장하세요.";
        Object.assign(m, structuredClone(this.checkpoint.match));
        clock.seek(this.checkpoint.now, realNow);
        clock.paused = true;
        this.generation++;
        return null;
      default: return "알 수 없는 디버깅 요청입니다.";
    }
  }
}
function arrange(p: Player) {
  // Use the same placement routine, without spending preset gold.
  const id = p.id;
  const bot=p.bot;p.bot=false;
  p.id = "preset-placement";
  botSetup(p);
  p.id = id;
  p.bot=bot;
}
