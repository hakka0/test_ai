import test from "node:test";
import assert from "node:assert/strict";
import { attackSpeedFor, attackSpeedGrade } from "../shared/attack-speed";
import { UNITS, CORE_UNIT_KINDS, statsFor, EQUIPMENT } from "../shared/catalog";
import { newMatch, startCombat, tick } from "../shared/engine";
import { combatStats } from "../shared/skills";
import { newTestPlayer } from "./fixtures";

test("attack speed: five grade boundaries are inclusive at the start of each band", () => {
  for (const [rate, grade] of [
    [0.5, "매우 느림"], [0.699, "매우 느림"], [0.7, "느림"], [0.899, "느림"],
    [0.9, "보통"], [1, "보통"], [1.099, "보통"], [1.1, "빠름"], [1.299, "빠름"],
    [1.3, "매우 빠름"], [1.5, "매우 빠름"], [2, "매우 빠름"],
  ] as const) assert.equal(attackSpeedGrade(rate), grade);
  assert.equal(attackSpeedFor(2500).text, "0.40");
  assert.equal(attackSpeedFor(500).text, "2.00");
  assert.equal(attackSpeedFor(50).text, "10.00");
});

test("all six catalog speeds use the real step-aligned interval, with two decimals", () => {
  const expected = { knight: ["1.00", "보통"], ranger: ["1.25", "빠름"],
    mage: ["0.71", "느림"], warden: ["0.83", "느림"],
    skirmisher: ["1.11", "빠름"], oracle: ["0.91", "보통"] };
  for (const kind of CORE_UNIT_KINDS) {
    const s = attackSpeedFor(UNITS[kind].stats.interval);
    assert.deepEqual([s.text, s.grade], expected[kind]);
  }
});

test("displayed rate agrees with observed basic attack cadence including fractional steps and the minimum interval", () => {
  for (const interval of [50, 350, 800, 850, 1000, 1150, 1400, 2000]) {
    const m = newMatch(); m.players = [newTestPlayer("a", "A"), newTestPlayer("b", "B")]; startCombat(m, 1);
    const [f, t] = m.fighters;
    for (const fighter of m.fighters) { fighter.skills = []; fighter.buffs = []; fighter.shield = 0; fighter.hp = fighter.maxHp = 1e9; }
    Object.assign(f, { x: 3, y: 4, nextAttack: 1 }); f.stats.interval = interval;
    Object.assign(t, { x: 3, y: 3, nextAttack: Infinity, nextMove: Infinity });
    const times: number[] = [];
    for (let now = 101; now <= 9001; now += 100) {
      const before = m.eventId; tick(m, now);
      if (m.events.some(e => e.id > before && e.type === "attack" && e.source === f.id)) times.push(now);
    }
    assert.ok(times.length >= 3);
    const gap = times[1] - times[0];
    assert.ok(times.slice(1).every((time, i) => time - times[i] === gap));
    assert.equal(attackSpeedFor(interval).text, (1000 / gap).toFixed(2));
  }
});

test("gear and temporary speed modifiers derive their rates without changing base stats", () => {
  EQUIPMENT.testSpeed = { tier: 2, category: "equipment", name: "Test", description: "Test", modifiers: { interval: -300 } };
  try {
    const m = newMatch(); m.players = [newTestPlayer("a", "A"), newTestPlayer("b", "B")];
    const u = m.players[0].units[0]; u.kind = "skirmisher"; u.equipment = ["speed"];
    m.players[0].inventory.push({ id: "speed", definition: "testSpeed", unitId: u.id });
    const gearStats = statsFor(u, m.players[0].inventory);
    assert.equal(attackSpeedFor(gearStats.interval).text, "1.67");
    startCombat(m, 1); const f = m.fighters[0];
    f.buffs = [{ key: "quickstep", source: f.id, skillId: "quickstep", expiresAt: 1000,
      modifiers: { stats: { interval: -150 } } }];
    assert.equal(attackSpeedFor(combatStats(f, 999).stats.interval).text, "2.50");
    assert.equal(attackSpeedFor(combatStats(f, 1000).stats.interval).text, "1.67");
    assert.equal(UNITS.skirmisher.stats.interval, 850);
  } finally { delete EQUIPMENT.testSpeed; }
});
