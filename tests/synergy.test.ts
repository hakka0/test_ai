import {newTestPlayer as newPlayer, neutralDamage} from "./fixtures";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {newMatch, prepare, startCombat, applyAction, botSetup, tick} from "../shared/engine";
import { UNITS, UNIT_KINDS, CORE_UNIT_KINDS, statsFor } from "../shared/catalog";
import { SKILLS } from "../shared/skill-catalog";
import { evaluateSynergies, bonusFor, synergiesForPlayer } from "../shared/synergy";
import { createOffer, unitPrice } from "../shared/shop";
import { acquireUnit } from "../shared/bench";
import { snapshotFor } from "../shared/snapshot";
import { SkillSystem, createSkillStates, combatStats, validateSkill } from "../shared/skills";
import { GameClock } from "../shared/game-time";
import { DebugSession } from "../server/debug";
import type { Kind, Player } from "../shared/model";

function roster(p: Player, kinds: readonly Kind[]) {
  p.units = kinds.map((kind, i) => ({ id: `${p.id}-${p.nextUnitId++}`, owner: p.id, kind,
    rank: 1, x: i % 6, y: Math.floor(i / 6), benchSlot: null, equipment: [] }));
}
function fixture(kinds: readonly Kind[] = CORE_UNIT_KINDS) {
  const m = newMatch(); m.players = [newPlayer("a", "A"), newPlayer("b", "B")];
  m.players.forEach(p => p.level = 6); prepare(m, 0);
  const [p, enemy] = m.players; roster(p, kinds); roster(enemy, ["yuuka"]);
  return { m, p, enemy };
}

test("20종 카탈로그: 균등 추첨·레어도 가격·그림·자동 스킬 연결", () => {
  const { p } = fixture([]); assert.equal(UNIT_KINDS.length, 20);
  const drawn = UNIT_KINDS.map((_, i) => createOffer(p, () => (i + 0.5) / UNIT_KINDS.length)!);
  assert.deepEqual(drawn.map(o => o.kind), UNIT_KINDS);
  assert.equal(new Set(drawn.map(o => o.id)).size, UNIT_KINDS.length);
  for (const offer of drawn) {
    const def = UNITS[offer.kind]; assert.equal(offer.cost, def.rarity);
    assert.ok(existsSync(`public${def.image}`));
    assert.deepEqual(def.skills.map(id => SKILLS[id].kind), ["active"]);
    def.skills.forEach(id => validateSkill(SKILLS[id]));
  }
});
test("같은 종류와 강화 등급은 한 종류로 계산, 대기석은 제외", () => {
  const { p } = fixture(["yuuka", "yuuka", "natsu"]);
  p.units[1].rank = 3; p.units[2].x = p.units[2].y = -1;
  assert.deepEqual(evaluateSynergies(p.units)[0], { trait: "bulwark", count: 1, active: false });
  p.units[2].x = 2;
  assert.deepEqual(evaluateSynergies(p.units)[0], { trait: "bulwark", count: 2, active: true });
});
test("출전 정원 뒤의 유닛과 상대 유닛은 활성화에 기여하지 않음", () => {
  const { m, p, enemy } = fixture(["yuuka", "natsu"]); p.level = 1;
  roster(enemy, ["natsu"]); startCombat(m, 0);
  const f = m.fighters.find(f => f.owner === p.id)!;
  assert.equal(f.maxHp, 325); assert.equal(m.fighters.filter(f => f.owner === p.id).length, 1);
  const s = snapshotFor(m, p.id, 0, "test");
  assert.equal(synergiesForPlayer(s, s.players[0])[0].active, false);
});
test("6종 배치: 세 계열 활성, 효과는 해당 계열에만 적용", () => {
  const { m, p } = fixture(); const base = structuredClone(p.units); startCombat(m, 0);
  assert.ok(evaluateSynergies(p.units).every(s => s.active));
  const own = m.fighters.filter(f => f.owner === p.id);
  assert.equal(own.find(f => f.kind === "yuuka")!.maxHp, 374);
  assert.equal(own.find(f => f.kind === "natsu")!.maxHp, 357);
  assert.equal(own.find(f => f.kind === "shiroko")!.stats.attack, 31);
  assert.equal(own.find(f => f.kind === "neru")!.stats.attack, 26);
  assert.equal(own.find(f => f.kind === "shiroko")!.maxHp, 190);
  assert.equal(own.find(f => f.kind === "hifumi")!.stats.attack, 22);
  assert.equal(own.find(f => f.kind === "hifumi")!.shield, 30);
  assert.equal(own.find(f => f.kind === "koharu")!.shield, 30);
  assert.equal(own.find(f => f.kind === "yuuka")!.shield, 0);
  assert.deepEqual(p.units, base);
});
test("강화 → 시너지 반올림 → 장비 가산, 장비 보너스는 배수 제외", () => {
  const { m, p } = fixture(); const yuuka = p.units[0], shiroko = p.units[1], hifumi = p.units[2];
  yuuka.rank = shiroko.rank = 2;
  const [blade, armor, charm] = p.inventory;
  yuuka.equipment = [armor.id]; armor.unitId = yuuka.id;
  shiroko.equipment = [blade.id]; blade.unitId = shiroko.id;
  hifumi.equipment = [charm.id]; charm.unitId = hifumi.id;
  startCombat(m, 0);
  assert.equal(m.fighters.find(f => f.id === yuuka.id)!.maxHp, 733);
  assert.equal(m.fighters.find(f => f.id === shiroko.id)!.stats.attack, 64);
  assert.equal(m.fighters.find(f => f.id === hifumi.id)!.shield, 65);
  assert.equal(statsFor(yuuka, p.inventory).hp, 645);
});
test("시너지·장비·시작 패시브는 전투마다 새로 지급하고 중복 초기화하지 않음", () => {
  const { m, p } = fixture(); startCombat(m, 0);
  const hifumi = () => m.fighters.find(f => f.kind === "hifumi")!;
  new SkillSystem(m, 0).begin(); assert.equal(hifumi().shield, 30);
  hifumi().shield = 0; prepare(m, 100); startCombat(m, 200);
  assert.equal(hifumi().shield, 30); assert.equal(p.units[2].equipment.length, 0);
});
test("계열 파트너 사망 시 해당 전투의 효과·GUI 조합 유지, 다음 준비 회수 시 해제", () => {
  const { m, p } = fixture(["yuuka", "natsu"]); startCombat(m, 0);
  const yuuka = m.fighters.find(f => f.kind === "yuuka" && f.owner === p.id)!;
  const natsu = m.fighters.find(f => f.kind === "natsu")!; natsu.hp = 0;
  const s = snapshotFor(m, p.id, 0, "test");
  assert.equal(synergiesForPlayer(s, s.players[0])[0].active, true); assert.equal(yuuka.maxHp, 374);
  prepare(m, 100);
  assert.equal(applyAction(m, p.id, {type: "bench", unitId: p.units[1].id, slot: 0}, 101), null);
  const prep = snapshotFor(m, p.id, 101, "test");
  assert.equal(synergiesForPlayer(prep, prep.players[0])[0].active, false);
  startCombat(m, 102); assert.equal(m.fighters.find(f => f.owner === p.id)!.maxHp, 325);
});
test("상대 조합은 출전에서만 계산, 관전 대기석은 공개하되 조합에 미포함·상점은 비공개", () => {
  const { m, p } = fixture(["yuuka", "natsu"]);m.mode='practice'; p.units[1].x = p.units[1].y = -1; p.units[1].benchSlot = 0;
  const hiddenId = p.units[1].id; const s = snapshotFor(m, "b", 0, "test");
  assert.equal(synergiesForPlayer(s, s.players[0])[0].active, false);
  assert.ok(!("shop" in s.players[0]) && !("gold" in s.players[0]));
  assert.ok(s.players[0].visibility==='opponent'&&s.players[0].bench.some(u=>u.id===hiddenId));
  p.units[1].x = 1; p.units[1].y = 0; p.units[1].benchSlot = null;
  const visible = snapshotFor(m, "b", 0, "test");
  assert.equal(synergiesForPlayer(visible, visible.players[0])[0].active, true);
});
test("신규 3종도 실제 상점 구매·자동 합성·판매에 같은 원본 수 가격 적용", () => {
  for (const kind of ["natsu", "neru", "koharu"] as const) {
    const { m, p } = fixture([]); const gold = p.gold;
    for (let i = 0; i < 3; i++) {
      const offer = p.shop[i]; Object.assign(offer, {kind, cost: unitPrice(kind)});
      assert.equal(applyAction(m, p.id, {type: "buy", offerId: offer.id, revision: p.shopRevision}, i + 1), null);
    }
    assert.equal(p.units.length, 1); assert.equal(p.units[0].rank, 2);
    assert.equal(applyAction(m, p.id, {type: "sell", unitId: p.units[0].id}, 4), null);
    assert.equal(p.gold, gold); assert.ok(p.shop.slice(0, 3).every(o => o.sold));
  }
});
test("전장+대기석 합성은 종류 수를 늘리지 않고, 판매한 파트너의 계열 해제", () => {
  const { m, p } = fixture(["yuuka", "natsu"]); acquireUnit(p, "yuuka"); acquireUnit(p, "yuuka");
  assert.equal(p.units[0].rank, 2); assert.equal(evaluateSynergies(p.units)[0].count, 2);
  assert.equal(applyAction(m, p.id, {type: "sell", unitId: p.units[1].id}, 1), null);
  assert.equal(evaluateSynergies(p.units)[0].active, false);
});
test("치유사는 살아 있는 사거리 내 가장 낮은 체력 비율의 아군 회복·상한 준수", () => {
  const { m } = fixture(); startCombat(m, 0);
  const own = m.fighters.filter(f => f.owner === "a"); own.forEach(f => { f.x = 0; f.y = 0; f.skills = []; });
  const healer = own.find(f => f.kind === "koharu")!; healer.skills = createSkillStates(healer.kind, 0, SKILLS, ["starlightHeal"]);
  const yuuka = own.find(f => f.kind === "yuuka")!, natsu = own.find(f => f.kind === "natsu")!;
  yuuka.hp -= 30; natsu.hp -= 150; const before = natsu.hp;
  new SkillSystem(m, 5000).advance();
  assert.ok(Math.abs(natsu.hp - before - (35 + natsu.maxHp * 0.1)) < 1e-6); assert.equal(yuuka.hp, yuuka.maxHp - 30);
  natsu.hp = 0; yuuka.hp = yuuka.maxHp - 1;
  new SkillSystem(m, 10000).advance(); assert.equal(natsu.hp, 0); assert.equal(yuuka.hp, yuuka.maxHp);
});
test("쌍검 공격 코스트·피해와 한시적 공격/이동 주기 버프 만료", () => {
  const { m } = fixture(["neru"]); startCombat(m, 0);
  const [f, enemy] = m.fighters; f.skills = createSkillStates(f.kind, 0, SKILLS, ["doubleStrike", "quickstep"]); f.stats.attack = 25; f.stats.interval = 850; f.stats.moveMs = 400; f.x = f.y = 0; enemy.x = 1; enemy.y = 0;
  neutralDamage(f, enemy);
  enemy.hp = enemy.maxHp = 10000; enemy.skills = []; enemy.shield = 0;
  for (let n = 1; n <= 4; n++) new SkillSystem(m, n * 100).basicAttack(f, enemy);
  assert.equal(f.skills.find(s => s.id === "doubleStrike")!.activations, 1);
  assert.ok(Math.abs(enemy.hp - (10000 - 25 * 4 - 40)) < 1e-6);
  assert.equal(combatStats(f, 400).stats.interval, 700); assert.equal(combatStats(f, 400).stats.moveMs, 300);
  assert.equal(combatStats(f, 3400).stats.interval, 850); assert.equal(f.stats.interval, 850);
});
test("파수꾼의 피격 충전 방패와 체력 비례 회복은 사망 후 발동하지 않음", () => {
  const { m } = fixture(["natsu"]); startCombat(m, 0); const [f, enemy] = m.fighters; f.skills = createSkillStates(f.kind, 0, SKILLS, ["ironWard", "steadfast"]); f.hp = f.maxHp = 250;
  neutralDamage(f, enemy);
  enemy.stats.attack = 10; enemy.skills = [];
  for (let n = 1; n <= 8; n++) new SkillSystem(m, n * 100).basicAttack(enemy, f);
  assert.equal(f.shield, 60); assert.equal(f.skills[0].activations, 1); // Base hit gain casts on hit 7; hit 8 absorbs 10.
  f.shield = 0; f.hp = 100; new SkillSystem(m, 900).basicAttack(enemy, f);
  assert.equal(f.hp, 127.5); assert.equal(f.skills[1].activations, 1);
  enemy.stats.attack = 10000; new SkillSystem(m, 1000).basicAttack(enemy, f); assert.equal(f.hp, 0);
  assert.equal(f.skills[1].activations, 1);
});
test("6종 조합 프리셋·봇 전후열·전투 체크포인트와 단계별 진행 일치", () => {
  const { m } = fixture(); const d = new DebugSession(), clock = new GameClock(1000);
  assert.equal(d.apply(m, clock, {type: "preset", preset: "synergy"}, 1000), null);
  for (const p of m.players) {
    assert.equal(p.level, 6); assert.deepEqual(p.units.map(u => u.kind), CORE_UNIT_KINDS);
    assert.ok(p.units.every(u => u.rank === 1)); assert.ok(evaluateSynergies(p.units).every(s => s.active));
    assert.equal(new Set(p.units.map(u => `${u.x},${u.y}`)).size, 6);
    botSetup(p); assert.ok(p.units.every(u => u.y === (UNITS[u.kind].stats.range === 1 ? 3 : 0)));
  }
  startCombat(m, 1000); d.apply(m, clock, {type: "save"}, 1000); const saved = structuredClone(m);
  const granular = structuredClone(m); for (let now = 1100; now <= 5000; now += 100) tick(granular, now);
  tick(m, 5000); assert.deepEqual(m, granular);
  d.apply(m, clock, {type: "load"}, 1000); assert.deepEqual(m, saved); assert.equal(clock.paused, true);
  for (const p of snapshotFor(m, "a", 1000, "test").players) assert.ok(synergiesForPlayer(snapshotFor(m, "a", 1000, "test"), p).every(s => s.active));
  const bonus = bonusFor("yuuka", evaluateSynergies(m.players[0].units)); assert.equal(bonus.hpMultiplier, 1.15);
});
