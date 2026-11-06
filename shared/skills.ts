import type { Fighter, Match, CombatEvent, Stats } from "./model";
import { UNITS, EQUIPMENT, type Hook, type EffectContext } from "./catalog";
import { SKILLS } from "./skill-catalog";
import { calculateDamage, clampDamageStats, combatRandom } from "./damage";
import { COMBAT_STEP_MS } from "./attack-speed";
import {sameArena} from './minions';
import {overtimeModifiers} from './overtime';
import type {
  SkillDefinition,
  SkillState,
  Condition,
  SkillEvent,
  CombatModifiers,
  SkillEffect,
} from "./skill-types";
export const STEP_MS = COMBAT_STEP_MS;
export const BASIC_ATTACK_COST = 5;
export const DAMAGED_COST = 3;
const EPS = 1e-7;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
type Context = { source?: Fighter; damageSource?: "basic" | "skill" };
type Definitions = Record<string, SkillDefinition>;
function nonnegative(value: number | undefined, label: string) {
  if (value !== undefined && (!Number.isFinite(value) || value < 0))
    throw new Error(`Invalid skill ${label}`);
}
export function validateSkill(d: SkillDefinition) {
  if (!d.id || !d.triggers.length)
    throw new Error("A skill needs an id and triggers");
  nonnegative(d.cooldownMs, "cooldown");
  if (
    d.maxActivationsPerBattle !== undefined &&
    (!Number.isInteger(d.maxActivationsPerBattle) ||
      d.maxActivationsPerBattle < 1)
  )
    throw new Error("Invalid activation limit");
  if (d.resource) {
    for (const [key, value] of Object.entries(d.resource))
      if (typeof value === "number") nonnegative(value, key);
    if (
      !(d.resource.max > 0) ||
      !Number.isFinite(d.resource.max) ||
      (d.resource.initial ?? 0) > d.resource.max
    )
      throw new Error("Invalid resource capacity");
  }
  if (d.activation.mode === "sustain") {
    if (
      !d.resource ||
      !Number.isFinite(d.activation.drainPerSecond) ||
      d.activation.drainPerSecond <= 0
    )
      throw new Error(
        "A sustain skill needs positive cost drain and a resource",
      );
    if (
      d.activation.pulse &&
      (!Number.isFinite(d.activation.pulse.everyMs) ||
        d.activation.pulse.everyMs < STEP_MS)
    )
      throw new Error("Pulse interval must be at least one simulation step");
  } else if (typeof d.activation.spend === "number") {
    nonnegative(d.activation.spend, "spend");
    if (
      d.activation.spend > 0 &&
      (!d.resource || d.activation.spend > d.resource.max)
    )
      throw new Error("Spend exceeds resource capacity");
  }
  if (d.triggers.some((t) => t.on === "costFull") && !d.resource)
    throw new Error("costFull needs a resource");
  nonnegative(d.target.range, "target range");
  nonnegative(d.target.radius, "target radius");
  function modifiers(mod: CombatModifiers) {
    nonnegative(mod.damageTakenMultiplier, "damage multiplier");
    for (const n of Object.values(mod.stats ?? {}))
      if (!Number.isFinite(n)) throw new Error("Invalid stat modifier");
  }
  function effect(e: SkillEffect) {
    if (e.type === "buff") {
      if (!Number.isFinite(e.durationMs) || e.durationMs <= 0)
        throw new Error("Invalid buff duration");
      modifiers(e.modifiers);
    } else {
      nonnegative(e.amount, "effect amount");
      if (e.type === "damage") nonnegative(e.attackScale, "attackScale");
      if (e.type === "heal") nonnegative(e.maxHpRatio, "maxHpRatio");
    }
  }
  for (const e of d.effects) effect(e);
  if (d.activation.mode === "sustain") {
    modifiers(d.activation.modifiers);
    for (const e of d.activation.pulse?.effects ?? []) effect(e);
  }
  function condition(c: Condition, depth = 0) {
    if (depth > 12) throw new Error("Condition nesting too deep");
    if ("all" in c || "any" in c) {
      for (const child of "all" in c ? c.all : c.any)
        condition(child, depth + 1);
    } else if ("not" in c) condition(c.not, depth + 1);
    else
      switch (c.type) {
        case "hpBelow":
          if (!Number.isFinite(c.ratio) || c.ratio < 0 || c.ratio > 1)
            throw new Error("Invalid HP ratio");
          break;
        case "attacksEvery":
          if (!Number.isInteger(c.count) || c.count < 1)
            throw new Error("Invalid attack count");
          break;
        case "costAtLeast":
          nonnegative(c.amount, "cost condition");
          break;
        case "elapsedAtLeast":
          nonnegative(c.ms, "elapsed condition");
          break;
        case "enemyInRange":
          nonnegative(c.range, "enemy range");
      }
  }
  for (const trigger of d.triggers) if (trigger.when) condition(trigger.when);
}
export function createSkillStates(
  kind: Fighter["kind"],
  now: number,
  definitions: Definitions = SKILLS,
  ids = UNITS[kind].skills,
): SkillState[] {
  if (new Set(ids).size !== ids.length)
    throw new Error("Duplicate skill IDs on a unit");
  return ids.map((id) => {
    const d = definitions[id];
    if (!d || d.id !== id) throw new Error(`Unknown skill: ${id}`);
    validateSkill(d);
    return {
      id,
      cost: d.resource?.initial ?? 0,
      active: false,
      cooldownUntil: 0,
      activations: 0,
      lastTriggeredAt: -1,
      startedAt: 0,
      lastUpdatedAt: now,
      nextPulseAt: 0,
    };
  });
}
export function combatStats(
  f: Fighter,
  now: number,
  definitions: Definitions = SKILLS,
): { stats: Stats; damageTakenMultiplier: number } {
  const stats = { ...f.stats };
  let damageTakenMultiplier = 1;
  const apply = (mod: CombatModifiers) => {
    for (const [key, value] of Object.entries(mod.stats ?? {}))
      stats[key as keyof Stats] += value;
    damageTakenMultiplier *= mod.damageTakenMultiplier ?? 1;
  };
  for (const b of f.buffs) if (b.expiresAt > now) apply(b.modifiers);
  for (const s of f.skills) {
    const d = definitions[s.id];
    if (s.active && d?.activation.mode === "sustain")
      apply(d.activation.modifiers);
  }
  stats.attack = Math.max(0, stats.attack);
  clampDamageStats(stats);
  const fever=overtimeModifiers(f.overtimeAt,now);
  stats.interval = Math.max(STEP_MS, stats.interval/fever.power);
  stats.moveMs = Math.max(STEP_MS, stats.moveMs/fever.movement);
  stats.range = Math.max(1, stats.range);
  return { stats, damageTakenMultiplier: Math.max(0, damageTakenMultiplier) };
}
// One instance per authoritative simulation step. All effects share the same damage path.
export class SkillSystem {
  private queue: { fighter: Fighter; event: SkillEvent; context: Context }[] =
    [];
  constructor(
    readonly match: Match,
    readonly now: number,
    readonly definitions: Definitions = SKILLS,
  ) {}
  private emit(
    type: CombatEvent["type"],
    source: Fighter,
    target: Fighter,
    amount = 0,
    skillId?: string,
    damage?: { shieldDamage: number; healthDamage: number; shieldBroken: boolean; critical: boolean },
  ) {
    this.match.events.push({
      id: ++this.match.eventId,
      type,
      source: source.id,
      target: target.id,
      amount,
      ...(skillId ? { skillId } : {}),
      ...damage,
    });
    this.match.events = this.match.events.slice(-80);
  }
  private hooks(f: Fighter, hook: Hook, ctx: EffectContext) {
    const p = this.match.players.find((p) => p.id === f.owner);
    if (!p) return;
    for (const id of f.equipment) {
      const i = p.inventory.find((i) => i.id === id);
      if (i) EQUIPMENT[i.definition]?.hooks?.[hook]?.(ctx);
    }
  }
  private enqueue(fighter: Fighter, event: SkillEvent, context: Context = {}) {
    this.queue.push({ fighter, event, context });
  }
  private full(f: Fighter) {
    this.enqueue(f, "costFull");
  }
  private gain(f: Fighter, key: "perBasicAttack" | "perDamaged" | "perKill") {
    for (const s of f.skills) {
      const r = this.definitions[s.id]?.resource;
      if (!r || (s.active && !r.recoverWhileActive)) continue;
      const base = key === 'perBasicAttack' ? BASIC_ATTACK_COST : key === 'perDamaged' ? DAMAGED_COST : 0;
      s.cost = Math.min(r.max, s.cost + base + (r[key] ?? 0));
    }
    this.full(f);
  }
  private check(
    c: Condition,
    f: Fighter,
    s: SkillState,
    context: Context,
  ): boolean {
    if ("all" in c) return c.all.every((v) => this.check(v, f, s, context));
    if ("any" in c) return c.any.some((v) => this.check(v, f, s, context));
    if ("not" in c) return !this.check(c.not, f, s, context);
    switch (c.type) {
      case "hpBelow":
        return f.hp / f.maxHp <= c.ratio;
      case "costAtLeast":
        return s.cost + EPS >= c.amount;
      case "attacksEvery":
        return f.basicAttacks > 0 && f.basicAttacks % c.count === 0;
      case "elapsedAtLeast":
        return this.now - this.match.combatStartedAt >= c.ms;
      case "enemyInRange":
        return this.match.fighters.some(
          (t) => !t.inactive && sameArena(f,t) && t.hp > 0 && t.owner !== f.owner && distance(f, t) <= c.range,
        );
      case "damageSource":
        return context.damageSource === c.source;
    }
  }
  private targets(f: Fighter, d: SkillDefinition): Fighter[] {
    if (d.target.kind === "self") return f.hp > 0 ? [f] : [];
    const allies = d.target.kind === "lowestHealthAlly";
    const candidates = this.match.fighters.filter(
      (t) =>
        t.hp > 0 && !t.inactive && sameArena(f,t) &&
        (allies ? t.owner === f.owner : t.owner !== f.owner) &&
        (d.target.range === undefined || distance(f, t) <= d.target.range),
    );
    candidates.sort(
      (a, b) =>
        (allies
          ? a.hp / a.maxHp - b.hp / b.maxHp
          : distance(f, a) - distance(f, b)) || a.id.localeCompare(b.id),
    );
    if (d.target.kind === "allEnemies") return candidates;
    const first = candidates[0];
    if (!first) return [];
    if (d.target.radius !== undefined)
      return this.match.fighters.filter(
        (t) =>
          t.hp > 0 && !t.inactive && sameArena(f,t) &&
          t.owner === first.owner &&
          distance(first, t) <= d.target.radius!,
      );
    return [first];
  }
  private flush() {
    // lastTriggeredAt guarantees each skill fires at most once at the same simulation timestamp.
    // Skill damage never increments basic-attack counters, preventing self-feeding attack chains.
    while (this.queue.length) {
      const { fighter: f, event, context } = this.queue.shift()!;
      if (f.hp <= 0) continue;
      for (const s of f.skills) {
        if (f.hp <= 0) break;
        const d = this.definitions[s.id];
        if (
          !d ||
          s.active ||
          s.cooldownUntil > this.now ||
          s.lastTriggeredAt === this.now ||
          s.activations >= (d.maxActivationsPerBattle ?? Infinity)
        )
          continue;
        if (
          event === "costFull" &&
          (!d.resource || s.cost + EPS < d.resource.max)
        )
          continue;
        if (
          !d.triggers.some(
            (t) =>
              t.on === event && (!t.when || this.check(t.when, f, s, context)),
          )
        )
          continue;
        const targets = this.targets(f, d);
        if (!targets.length) continue; // No target: retain cost and retry when eligible.
        const spend =
          d.activation.mode === "instant"
            ? d.activation.spend === "all"
              ? s.cost
              : (d.activation.spend ?? 0)
            : 0;
        if (
          s.cost + EPS < spend ||
          (d.activation.mode === "sustain" && s.cost <= EPS)
        )
          continue;
        s.lastTriggeredAt = this.now;
        s.activations++;
        s.startedAt = this.now;
        s.lastUpdatedAt = this.now;
        s.cost = Math.max(0, s.cost - spend);
        if (d.activation.mode === "sustain") {
          s.active = true;
          s.nextPulseAt = this.now + (d.activation.pulse?.everyMs ?? 0);
        } else s.cooldownUntil = this.now + d.cooldownMs;
        this.emit("skillStart", f, targets[0], 0, d.id);
        this.effects(f, d, targets, d.effects);
      }
    }
  }
  private effects(
    source: Fighter,
    d: SkillDefinition,
    targets: Fighter[],
    effects: SkillEffect[],
  ) {
    for (const effect of effects) {
      if (source.hp <= 0) break;
      for (const target of targets) {
        if (target.hp <= 0) continue;
        if (effect.type === "damage")
          this.damage(
            source,
            target,
            effect.amount +
              (effect.attackScale ?? 0) *
                combatStats(source, this.now, this.definitions).stats.attack,
            "skill",
            d.id,
          );
        else if (effect.type === "heal") {
          const healed = Math.min(
            target.maxHp - target.hp,
            (effect.amount + (effect.maxHpRatio ?? 0) * target.maxHp)*overtimeModifiers(target.overtimeAt,this.now).recovery,
          );
          target.hp += healed;
          source.contribution.healing += healed;
          if (healed > 0) this.emit("heal", source, target, healed, d.id);
        } else if (effect.type === "shield") {
          const amount=effect.amount*overtimeModifiers(target.overtimeAt,this.now).recovery;
          target.shield += amount;
          this.emit("shield", source, target, amount, d.id);
        } else {
          const key = `${source.id}:${d.id}`;
          target.buffs = target.buffs.filter((b) => b.key !== key);
          target.buffs.push({
            key,
            source: source.id,
            skillId: d.id,
            expiresAt: this.now + effect.durationMs,
            modifiers: structuredClone(effect.modifiers),
          });
        }
      }
    }
  }
  private stop(f: Fighter, s: SkillState, at: number) {
    if (!s.active) return;
    s.active = false;
    s.nextPulseAt = 0;
    s.cooldownUntil = at + this.definitions[s.id].cooldownMs;
    this.emit("skillEnd", f, f, 0, s.id);
  }
  end(f: Fighter) {
    for (const s of f.skills) this.stop(f, s, this.now);
    f.buffs = [];
  }
  endBattle(arena?:string) {
    for (const f of this.match.fighters) if(arena===undefined||f.arena===arena)this.end(f);
  }
  begin() {
    for (const f of this.match.fighters) {
      this.enqueue(f, "battleStart");
      this.full(f);
    }
    this.flush();
  }
  advance() {
    for (const f of this.match.fighters) {
      if(f.inactive)continue;
      if (f.hp <= 0) {
        this.end(f);
        continue;
      }
      f.buffs = f.buffs.filter((b) => b.expiresAt > this.now);
      for (const s of f.skills) {
        const d = this.definitions[s.id];
        if (!d) continue;
        const elapsed = Math.max(0, this.now - s.lastUpdatedAt);
        const previous = s.lastUpdatedAt;
        s.lastUpdatedAt = this.now;
        if (s.active && d.activation.mode === "sustain") {
          const a = d.activation,
            r = d.resource!;
          const netDrain =
            a.drainPerSecond -
            (r.recoverWhileActive ? (r.regenPerSecond ?? 0) : 0);
          const emptyAt =
            netDrain > 0 ? previous + (s.cost / netDrain) * 1000 : Infinity;
          const end = Math.min(this.now, emptyAt);
          if (a.pulse)
            while (
              s.nextPulseAt <= end &&
              s.nextPulseAt < emptyAt - EPS &&
              f.hp > 0
            ) {
              this.effects(f, d, this.targets(f, d), a.pulse.effects);
              s.nextPulseAt += a.pulse.everyMs;
            }
          s.cost = Math.max(
            0,
            Math.min(r.max, s.cost - (netDrain * elapsed) / 1000),
          );
          if (s.cost <= EPS || f.hp <= 0) {
            s.cost = 0;
            this.stop(f, s, Math.min(this.now, emptyAt));
          }
        } else if (d.resource) {
          s.cost = Math.min(
            d.resource.max,
            s.cost + ((d.resource.regenPerSecond ?? 0) * elapsed) / 1000,
          );
        }
      }
      this.enqueue(f, "tick");
      this.full(f);
    }
    this.flush();
  }
  damage(
    source: Fighter,
    target: Fighter,
    amount: number,
    kind: "basic" | "skill",
    skillId?: string,
  ): number {
    if (source.hp <= 0 || target.hp <= 0) return 0;
    const ctx = { self: target, other: source, damage: amount };
    this.hooks(target, "onHit", ctx);
    const outgoing = combatStats(source, this.now, this.definitions).stats;
    const receiving = combatStats(target, this.now, this.definitions);
    const { incoming, critical } = calculateDamage(ctx.damage*overtimeModifiers(source.overtimeAt,this.now).power, outgoing,
      receiving.stats.defense, receiving.damageTakenMultiplier, combatRandom(this.match));
    const absorbed = Math.min(target.shield, incoming);
    target.shield -= absorbed;
    const lost = Math.min(target.hp, incoming - absorbed);
    target.hp -= lost;
    source.contribution.damageDealt += lost;
    target.contribution.damageTaken += lost;
    target.contribution.shieldBlocked += absorbed;
    this.emit(
      kind === "basic" ? "attack" : "skillDamage",
      source,
      target,
      lost,
      skillId,
      { shieldDamage: absorbed, healthDamage: incoming - absorbed, shieldBroken: absorbed > 0 && target.shield <= 0, critical },
    );
    if (target.hp <= 0) {
      this.end(target);
      this.emit("death", source, target, 0, skillId);
      this.gain(source, "perKill");
      this.enqueue(source, "onKill", { source: target, damageSource: kind });
    } else if (incoming > 0) {
      this.gain(target, "perDamaged");
      this.enqueue(target, "onDamaged", { source, damageSource: kind });
    }
    return lost;
  }
  basicAttack(f: Fighter, target: Fighter) {
    if (f.hp <= 0 || target.hp <= 0) return;
    const ctx = {
      self: f,
      other: target,
      damage: combatStats(f, this.now, this.definitions).stats.attack,
    };
    this.hooks(f, "beforeAttack", ctx);
    const lost = this.damage(f, target, ctx.damage, "basic");
    f.basicAttacks++;
    this.hooks(f, "afterAttack", { ...ctx, damage: lost });
    this.gain(f, "perBasicAttack");
    this.enqueue(f, "afterBasicAttack", {
      source: target,
      damageSource: "basic",
    });
    this.flush();
  }
}
