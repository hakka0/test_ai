import test from "node:test";
import assert from "node:assert/strict";
import { newMatch, prepare, startCombat, tick, applyAction } from "../shared/engine";
import { UNITS, CORE_UNIT_KINDS, statsFor, EQUIPMENT } from "../shared/catalog";
import { calculateDamage, combatRandom, combatSeed } from "../shared/damage";
import { SkillSystem, createSkillStates } from "../shared/skills";
import { snapshotFor } from "../shared/snapshot";
import { refreshShop } from "../shared/shop";
import { DebugSession } from "../server/debug";
import { GameClock } from "../shared/game-time";
import { newTestPlayer } from "./fixtures";
import type { SkillDefinition } from "../shared/skill-types";

function fixture() {
  const m = newMatch(); m.players = [newTestPlayer("a", "A"), newTestPlayer("b", "B")];
  prepare(m, 0); startCombat(m, 1); m.events = []; m.eventId = 0;
  for (const f of m.fighters) {
    Object.assign(f, { hp: 1000, maxHp: 1000, shield: 0, skills: [], buffs: [], equipment: [] });
    Object.assign(f.stats, { defense: 10, critChance: 0, weaponPower: 10 });
  }
  return { m, f: m.fighters[0], t: m.fighters[1], at: (now = 10) => new SkillSystem(m, now) };
}

test("six units: 10% chance, 150% total critical damage, positive armor and tougher tanks at all ranks", () => {
  const tanks = ["yuuka", "natsu"] as const;
  for (const kind of CORE_UNIT_KINDS) for (const rank of [1, 2, 3] as const) {
    const s = statsFor({ kind, rank, equipment: [] }, []);
    assert.equal(s.critChance, 10); assert.equal(s.critDamage, 150); assert.equal(s.weaponPower, 10);
    assert.ok(s.defense > 0); assert.equal(s.defense, UNITS[kind].stats.defense);
    assert.equal(s.hp, Math.round(UNITS[kind].stats.hp * 1.8 ** (rank - 1)));
    assert.equal(s.attack, Math.round(UNITS[kind].stats.attack * 1.8 ** (rank - 1)));
    if (!tanks.includes(kind as typeof tanks[number])) for (const tank of tanks) {
      assert.ok(UNITS[tank].stats.defense > s.defense);
      assert.ok(UNITS[tank].stats.hp * UNITS[tank].stats.defense > UNITS[kind].stats.hp * s.defense);
    }
  }
});

test("direct armor division: doubling defense halves damage; weapon power scales linearly", () => {
  const { f, t, m, at } = fixture();
  at().damage(f, t, 40, "basic"); t.stats.defense = 20;
  at().damage(f, t, 40, "basic"); f.stats.weaponPower = 20;
  at().damage(f, t, 40, "skill", "nova");
  assert.deepEqual(m.events.map(e => e.amount), [40, 20, 40]); assert.equal(t.hp, 900);
  assert.equal(f.contribution.damageDealt, 100); assert.equal(t.contribution.damageTaken, 100);
});

test("critical thresholds, 150% total multiplier and one final rounding after all mitigation", () => {
  const s = { ...UNITS.shiroko.stats };
  assert.deepEqual(calculateDamage(20, s, 10, 1, 0.099999), { incoming: 30, critical: true });
  assert.deepEqual(calculateDamage(20, s, 10, 1, 0.1), { incoming: 20, critical: false });
  s.critChance = 0; assert.equal(calculateDamage(20, s, 10, 1, 0).incoming, 20);
  s.critChance = 100; assert.equal(calculateDamage(20, s, 10, 1, 0.999999).incoming, 30);
  assert.equal(calculateDamage(19, s, 14, 0.55, 0).incoming, 11);
  for (const amount of [0, -20]) assert.deepEqual(calculateDamage(amount, s, 10, 1, 0), { incoming: 0, critical: false });
  assert.equal(calculateDamage(20, s, 0, 1, 0).incoming, 300);
  assert.equal(calculateDamage(20, s, -5, 0, 0).incoming, 0);
});

test("one armor/critical result splits into shield and HP, with actual HP contribution and overkill", () => {
  for (const kind of ["basic", "skill"] as const) {
    const { m, f, t, at } = fixture(); f.stats.critChance = 100; t.stats.defense = 20; t.shield = 20; t.hp = 5;
    at().damage(f, t, 40, kind, kind === "skill" ? "nova" : undefined);
    const e = m.events[0];
    assert.equal(e.critical, true); assert.equal(e.shieldDamage, 20); assert.equal(e.healthDamage, 10);
    assert.equal(e.amount, 5); assert.equal(e.shieldBroken, true); assert.equal(t.hp, 0);
    assert.equal(t.contribution.shieldBlocked, 20); assert.equal(f.contribution.damageDealt, 5);
    const a = snapshotFor(m, "a", 10, "room"), b = snapshotFor(m, "b", 10, "room");
    assert.deepEqual(a.events, b.events); assert.equal(a.events[0].critical, true);
    assert.ok(!("combatRandomState" in a));
  }
});

test("skill base plus attack coefficient uses armor and critical damage, support effects do not roll", () => {
  const { m, f, t } = fixture(); f.x = t.x = 0; f.y = 0; t.y = 1; f.stats.attack = 40; f.stats.critChance = 100; t.stats.defense = 20;
  const d: SkillDefinition = { id: "test", name: "Test", description: "Test", kind: "passive",
    triggers: [{ on: "battleStart" }], cooldownMs: 0, maxActivationsPerBattle: 1,
    target: { kind: "nearestEnemy", range: 3 }, effects: [{ type: "damage", amount: 35, attackScale: 0.6 }], activation: { mode: "instant" } };
  const definitions = { test: d }; f.skills = createSkillStates(f.kind, 1, definitions, [d.id]);
  new SkillSystem(m, 10, definitions).begin();
  assert.equal(m.events.find(e => e.type === "skillDamage")!.amount, 44);
  const state = m.combatRandomState;
  const support = { ...d, target: { kind: "self" as const }, effects: [{ type: "heal" as const, amount: 20 }, { type: "shield" as const, amount: 20 }] };
  f.hp = 100; f.skills = createSkillStates(f.kind, 1, { test: support }, [d.id]);
  new SkillSystem(m, 20, { test: support }).begin();
  assert.equal(m.combatRandomState, state); assert.equal(f.hp, 120); assert.equal(f.shield, 20);
  assert.ok(m.events.filter(e => e.type === "heal" || e.type === "shield").every(e => e.critical === undefined));
});

test("temporary armor, critical chance and critical damage buffs apply then expire", () => {
  const { m, f, t, at } = fixture();
  f.buffs = [{ key: "critical", source: f.id, skillId: "test", expiresAt: 100,
    modifiers: { stats: { critChance: 100, critDamage: 50 } } }];
  t.buffs = [{ key: "armor", source: t.id, skillId: "test", expiresAt: 100,
    modifiers: { stats: { defense: 10 }, damageTakenMultiplier: 0.5 } }];
  at(10).damage(f, t, 40, "basic"); at(100).damage(f, t, 40, "basic");
  assert.deepEqual(m.events.map(e => [e.amount, e.critical]), [[20, true], [40, false]]);
  assert.equal(f.stats.critDamage, 150); assert.equal(t.stats.defense, 10);
});

test("equipment can change new stats; combat keeps its loadout and numeric stats frozen", () => {
  EQUIPMENT.testCritical = { tier: 2, category: "equipment", name: "Test", description: "Test",
    modifiers: { defense: -100, critChance: 150, critDamage: -100, weaponPower: -100 } };
  try {
    const { m, f } = fixture(), p = m.players[0], u = p.units[0];
    p.inventory.push({ id: "new", definition: "testCritical", unitId: null });
    assert.equal(applyAction(m, p.id, { type: "equip", itemId: "new", unitId: u.id }, 10), null);
    const s = statsFor(u, p.inventory);
    assert.equal(s.defense, 1); assert.equal(s.critChance, 100); assert.equal(s.critDamage, 100); assert.equal(s.weaponPower, 0);
    assert.equal(f.stats.defense, 10); assert.equal(f.stats.critChance, 0); assert.deepEqual(f.equipment, []);
    startCombat(m, 100); const fresh = m.fighters.find(v => v.id === u.id)!;
    assert.equal(fresh.stats.defense, 1); assert.equal(fresh.stats.critChance, 100);
  } finally { delete EQUIPMENT.testCritical; }
});

test("combat rolls are reproducible, independent of economy RNG, and average close to 10%", () => {
  const m = newMatch(), copy = newMatch(); m.combatRandomState = copy.combatRandomState = combatSeed(3, ["a", "b"]);
  const shopper = newTestPlayer("economy", "Shop");
  let critical = 0;
  for (let i = 0; i < 100000; i++) {
    if (i % 1000 === 0) refreshShop(shopper);
    const roll = combatRandom(m); assert.equal(roll, combatRandom(copy)); assert.ok(roll >= 0 && roll < 1);
    if (roll < 0.1) critical++;
  }
  assert.ok(critical > 9500 && critical < 10500, String(critical));
  assert.notEqual(combatSeed(3, ["a", "b"]), combatSeed(4, ["a", "b"]));
});

test("checkpoint restore reproduces critical hits and the complete combat outcome", () => {
  const m = newMatch(); m.players = [newTestPlayer("a", "A"), newTestPlayer("b", "B")]; prepare(m, 0); startCombat(m, 1);
  const clock = new GameClock(4001), debug = new DebugSession();
  tick(m, 4001); debug.apply(m, clock, { type: "save" }, 4001);
  const outcome = () => structuredClone({ fighters: m.fighters, events: m.events,
    combatRandomState: m.combatRandomState, roundHistory: m.roundHistory, phase: m.phase, winner: m.winner });
  tick(m, 40001); const final = outcome();
  debug.apply(m, clock, { type: "load" }, 40001); tick(m, 40001);
  assert.deepEqual(outcome(), final);
});
