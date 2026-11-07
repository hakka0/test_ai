import type { SkillState, BuffState } from "./skill-types";
import type { BlueArchiveKind } from "./blue-archive";
export const BENCH_SIZE = 12;
export const COLS = 8,
  ROWS = 8,
  MAX_EQUIPMENT = 2;
export const PREP_MS = 30_000,
  MATCHING_MS = 5_000,
  COMBAT_MS = 20_000,
  OVERTIME_MS = 15_000,
  RESULT_MS = 6_000,
  MAX_ROUNDS = 40;
// Rarity sets the purchase price; rank describes instance upgrades through merging.
export type Rarity = 1 | 2 | 3 | 4 | 5;
export type UnitRank = 1 | 2 | 3;
export type Kind = BlueArchiveKind;
export type Roster = "blueArchive";
export type Trait = "bulwark" | "scout" | "arcane";
export type Phase = "waiting" | "prepare" | "matching" | "combat" | "result" | "finished";
export interface Stats {
  hp: number;
  attack: number;
  defense: number;
  weaponPower: number;
  critChance: number; // Percentage, 10 means 10%.
  critDamage: number; // Total percentage, 150 means 1.5x.
  interval: number;
  range: number;
  moveMs: number;
}
export interface Unit {
  minion?: { wave: number; variant: "sentry" | "drone" };
  id: string;
  owner: string;
  kind: Kind;
  rank: UnitRank;
  x: number;
  y: number;
  benchSlot?: number | null;
  equipment: string[];
}
export interface Item {
  id: string;
  definition: string;
  unitId: string | null;
}
export interface ShopOffer { id: string; kind: Kind; cost: number; sold: boolean; }
export interface Income { base: number; interest: number; streak: number; total: number; }
export interface MergeResult { unitId: string; kind: Kind; rank: UnitRank; consumedIds: string[]; returnedEquipment: number; }
export type RewardOption =
  | { id: string; type: "gold"; amount: number }
  | { id: string; type: "unit"; kind: Kind }
  | { id: string; type: "item"; definition: string };
export interface RoundReward { id: string; round: number; options: RewardOption[]; }
export interface RewardReceipt { round: number; option: RewardOption; automatic: boolean; }
export interface Player {
  bot?: boolean;
  roster?: Roster;
  nextItemId: number;
  nextRewardId: number;
  pendingReward: RoundReward | null;
  lastReward: RewardReceipt | null;
  mergeRevision: number;
  lastMerge: MergeResult | null;
  health: number;
  streak: "win" | "loss" | null;
  streakCount: number;
  roundInterest: number;
  lastIncome: Income;
  level: number;
  experience: number;
  experienceRevision: number;
  gold: number;
  shop: ShopOffer[];
  shopRevision: number;
  nextOfferId: number;
  nextUnitId: number;
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  score: number;
  units: Unit[];
  inventory: Item[];
}
// Battle-local counters: damage is actual HP lost; healing belongs to its source,
// shield absorption belongs to the protected fighter. Never inferred from events.
export interface CombatContribution {
  damageDealt: number;
  damageTaken: number;
  healing: number;
  shieldBlocked: number;
}
export interface UnitContribution extends CombatContribution {
  minion?: Unit["minion"];
  id: string;
  owner: string;
  kind: Kind;
  rank: UnitRank;
}
export interface Fighter extends Unit {
  overtimeAt?: number;
  arena?: string;
  inactive?: boolean;
  lootGranted?: boolean;
  contribution: CombatContribution;
  hp: number;
  maxHp: number;
  stats: Stats;
  nextAttack: number;
  nextMove: number;
  shield: number;
  skills: SkillState[];
  buffs: BuffState[];
  basicAttacks: number;
}
export interface CombatEvent {
  id: number;
  type:
    | "attack"
    | "death"
    | "skillStart"
    | "skillEnd"
    | "skillDamage"
    | "heal"
    | "shield"
    | "loot";
  loot?: RewardOption;
  skillId?: string;
  source: string;
  target: string;
  // amount remains actual HP lost for existing consumers. Damage events also
  // carry their per-hit shield/HP split, including HP overkill, for presentation.
  amount: number;
  shieldDamage?: number;
  healthDamage?: number;
  shieldBroken?: boolean;
  critical?: boolean;
}
export interface RoundPlayerResult {
  bye?: boolean;
  opponentId?: string;
  outcome?: "win" | "loss" | "draw";
  streakGold?: number;
  id: string;
  name: string;
  healthBefore: number;
  healthAfter: number;
  damage: number;
  survivors: number;
}
export interface RoundResult {
  encounter?: "minion";
  round: number;
  winner: string | null;
  reason: "victory" | "elimination" | "timeout";
  players: RoundPlayerResult[];
  units: UnitContribution[];
}
export type MatchEndReason = "elimination" | "roundLimit" | "disconnect";
export type MatchMode = "duel" | "practice" | "botPractice";
export interface PvpBattle {
  arena: string;
  players: [string, string];
  results?: RoundPlayerResult[];
  timeout?: boolean;
}
export interface Match {
  overtime?: boolean;
  pvpBattles?: PvpBattle[];
  minionRounds?: number;
  minionBattles?: MinionBattle[];
  mode: MatchMode;
  endReason: MatchEndReason | null;
  roundHistory: RoundResult[];
  phase: Phase;
  round: number;
  deadline: number;
  players: Player[];
  fighters: Fighter[];
  events: CombatEvent[];
  eventId: number;
  result: string;
  winner: string | null;
  lastTick: number;
  combatStartedAt: number;
  combatRandomState: number; // Checkpointed; never sent to clients.
}
export interface MinionBattle {
  owner: string;
  opponent: { id: string; name: string; units: Unit[] };
  outcome?: "win" | "loss" | "draw";
}
// Client data is separate from authoritative state. PvP rosters/worn equipment
// become public after matching; economy, shops, stored items and internals stay private.
export interface DebugState { speed: number; paused: boolean; hasCheckpoint: boolean; generation: number; }
export type DebugAction =
  | { type: "speed"; value: number }
  | { type: "pause"; paused: boolean }
  | { type: "step"; ms: number }
  | { type: "nextPhase" }
  | { type: "preset"; preset: "catalog" | "early" | "mid" | "late" | "level10" | "merge" | "synergy" | "synergyBulwark" | "synergyScout" | "synergyArcane" | "reward" | "minion" | "overtime" }
  | { type: "save" }
  | { type: "load" };
export interface PublicPlayerSnapshot {
  bot?: boolean;
  neutral?: boolean;
  rosterVisible?: boolean;
  health: number;
  visibility: "opponent";
  id: string;
  name: string;
  level: number;
  connected: boolean;
  ready: boolean;
  score: number;
  units: Unit[];
  bench: Unit[]; // Visible reserve units with slots; empty while rosterVisible is false.
  inventory: Item[]; // Only equipment worn by roster units or current fighters.
}
export interface SelfPlayerSnapshot extends Omit<Player, "nextOfferId" | "nextUnitId" | "nextItemId" | "nextRewardId" | "roundInterest" | "roster"> {
  visibility: "self";
}
export interface FighterSnapshot extends Unit {
  hp: number;
  maxHp: number;
  shield: number;
  skills: Pick<SkillState, "id" | "cost" | "active" | "cooldownUntil" | "activations">[];
}
export interface Snapshot {
  roster?: Roster;
  overtime?: boolean;
  encounter?: "minion" | "pvp";
  neutralOpponents?: PublicPlayerSnapshot[];
  opponentId?: string | null; // The viewer's paired opponent; independent of ranking order.
  battlePairs?: [string, string][]; // Ordered sides of each public battlefield, independent of the viewer.
  endReason: MatchEndReason | null;
  mode: MatchMode;
  roundHistory: RoundResult[];
  gameNow: number;
  timeScale: number;
  debug?: DebugState;
  phase: Phase;
  round: number;
  deadline: number;
  players: (SelfPlayerSnapshot | PublicPlayerSnapshot)[];
  fighters: FighterSnapshot[];
  events: CombatEvent[];
  eventId: number;
  result: string;
  winner: string | null;
  serverNow: number;
  roomId: string;
}
export type Action =
  | { type: "chooseReward"; rewardId: string; optionId: string }
  | { type: "craft"; itemIds: [string, string] }
  | { type: "buyExperience"; revision: number }
  | { type: "sell"; unitId: string }
  | { type: "buy"; offerId: string; revision: number }
  | { type: "reroll"; revision: number }
  | { type: "place"; unitId: string; x: number; y: number }
  | { type: "bench"; unitId: string; slot?: number }
  | { type: "ready" }
  | { type: "equip"; itemId: string; unitId: string }
  | { type: "unequip"; itemId: string };
