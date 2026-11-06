import test from "node:test";
import assert from "node:assert/strict";
import { newMatch, prepare, startCombat } from "../shared/engine";
import { SkillSystem, createSkillStates } from "../shared/skills";
import type { SkillDefinition } from "../shared/skill-types";
import { snapshotFor } from "../shared/snapshot";
import { newTestPlayer, neutralDamage } from "./fixtures";

function fixture() {
  const m = newMatch(); m.players = [newTestPlayer("a", "A"), newTestPlayer("b", "B")];
  prepare(m, 0); startCombat(m, 1); m.events = []; m.eventId = 0;
  for (const f of m.fighters) Object.assign(f, { skills: [], buffs: [], equipment: [], hp: 100, maxHp: 100, shield: 0 });
  neutralDamage(...m.fighters);
  return { m, source: m.fighters[0], target: m.fighters[1] };
}

for (const kind of ["basic", "skill"] as const) {
  test(`${kind}: no shield, absorption, exact break, overflow and lethal overkill remain separate`, () => {
    for (const c of [
      { incoming: 40, shield: 0, hp: 100, shieldDamage: 0, healthDamage: 40, lost: 40 },
      { incoming: 40, shield: 70, hp: 100, shieldDamage: 40, healthDamage: 0, lost: 0 },
      { incoming: 40, shield: 40, hp: 100, shieldDamage: 40, healthDamage: 0, lost: 0 },
      { incoming: 100, shield: 30, hp: 100, shieldDamage: 30, healthDamage: 70, lost: 70 },
      { incoming: 100, shield: 30, hp: 10, shieldDamage: 30, healthDamage: 70, lost: 10 },
      { incoming: 20, shield: 12.5, hp: 100, shieldDamage: 12.5, healthDamage: 7.5, lost: 7.5 },
    ]) {
      const { m, source, target } = fixture(); target.shield = c.shield; target.hp = c.hp;
      const lost = new SkillSystem(m, 10).damage(source, target, c.incoming, kind, kind === "skill" ? "nova" : undefined);
      const hit = m.events.find(e => e.type === (kind === "basic" ? "attack" : "skillDamage"))!;
      assert.equal(hit.shieldDamage, c.shieldDamage); assert.equal(hit.healthDamage, c.healthDamage);
      assert.equal(hit.shieldBroken, c.shield > 0 && c.shieldDamage === c.shield);
      assert.equal(hit.amount, c.lost); assert.equal(lost, c.lost);
      assert.equal(target.shield, c.shield - c.shieldDamage); assert.equal(target.hp, c.hp - c.lost);
      assert.equal(source.contribution.damageDealt, c.lost);
      assert.equal(target.contribution.damageTaken, c.lost); assert.equal(target.contribution.shieldBlocked, c.shieldDamage);
    }
  });
}

test("damage split uses mitigated damage and remains accurate after later hits or shield replenishment", () => {
  const { m, source, target } = fixture(); target.shield = 30;
  target.buffs = [{ key: "reduce", source: target.id, skillId: "buff", expiresAt: 1000, modifiers: { damageTakenMultiplier: 0.5 } }];
  const system = new SkillSystem(m, 10);
  system.damage(source, target, 100, "basic"); system.damage(source, target, 20, "skill", "nova");
  target.shield = 200;
  assert.deepEqual(m.events.filter(e => e.type === "attack" || e.type === "skillDamage").map(e => [e.shieldDamage, e.healthDamage, e.amount]), [[30, 20, 20], [0, 10, 10]]);
  assert.equal(target.hp, 70);
});

test("both viewers receive independent per-hit damage fields through the public snapshot allowlist", () => {
  const { m, source, target } = fixture(); target.shield = 30;
  new SkillSystem(m, 10).damage(source, target, 100, "skill", "nova");
  Object.assign(m.events[0], { futurePrivateField: "SECRET" });
  const a = snapshotFor(m, "a", 10, "room"), b = snapshotFor(m, "b", 10, "room");
  assert.deepEqual(a.events, b.events);
  assert.equal(a.events[0].shieldDamage, 30); assert.equal(a.events[0].healthDamage, 70);
  assert.equal(a.events[0].shieldBroken, true);
  assert.ok(!JSON.stringify(a.events).includes("SECRET"));
  a.events[0].shieldDamage = 900;
  assert.equal(m.events[0].shieldDamage, 30); assert.equal(b.events[0].shieldDamage, 30);
});

test("barrier breaking is recorded per hit even when another barrier is granted later", () => {
  const { m, source, target } = fixture(); target.shield = 30;
  const system = new SkillSystem(m, 10);
  system.damage(source, target, 10, "basic"); system.damage(source, target, 20, "basic");
  target.shield = 200; system.damage(source, target, 10, "basic");
  assert.deepEqual(m.events.filter(e => e.type === "attack").map(e => e.shieldBroken), [false, true, false]);
  assert.equal(target.shield, 190);
});

test("healing and shield grant events do not acquire damage display fields", () => {
  const { m, source } = fixture(); source.hp = 50;
  const skill: SkillDefinition = { id: "support", name: "Support", description: "Test", kind: "passive",
    triggers: [{ on: "battleStart" }], cooldownMs: 0, target: { kind: "self" },
    effects: [{ type: "heal", amount: 20 }, { type: "shield", amount: 25 }], activation: { mode: "instant" } };
  const definitions = { support: skill };
  source.skills = createSkillStates(source.kind, 1, definitions, [skill.id]);
  new SkillSystem(m, 10, definitions).begin();
  const events = snapshotFor(m, "a", 10, "room").events.filter(e => e.type === "heal" || e.type === "shield");
  assert.deepEqual(events.map(e => [e.type, e.amount]), [["heal", 20], ["shield", 25]]);
  for (const event of events) { assert.ok(!("shieldDamage" in event)); assert.ok(!("healthDamage" in event)); }
});
