import {newTestPlayer as newPlayer, neutralDamage} from "./fixtures";
import test from "node:test";
import assert from "node:assert/strict";
import {newMatch, startCombat, tick, prepare} from "../shared/engine";
import {
  SkillSystem,
  createSkillStates,
  combatStats,
  validateSkill,
} from "../shared/skills";
import type { SkillDefinition } from "../shared/skill-types";
function definition(patch: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: "test",
    name: "Test",
    description: "Test",
    kind: "active",
    triggers: [{ on: "costFull" }],
    resource: { max: 100, regenPerSecond: 25 },
    cooldownMs: 0,
    target: { kind: "nearestEnemy", range: 3 },
    effects: [{ type: "damage", amount: 20 }],
    activation: { mode: "instant", spend: "all" },
    ...patch,
  };
}
function fixture(d: SkillDefinition) {
  const defs = { [d.id]: d },
    m = newMatch();
  m.players = [newPlayer("a", "A"), newPlayer("b", "B")];
  startCombat(m, 0);
  const [f, t] = m.fighters;
  neutralDamage(f, t);
  f.x = 0;
  f.y = 0;
  t.x = 1;
  t.y = 0;
  f.stats.attack = 10;
  t.hp = t.maxHp = 2000;
  f.skills = createSkillStates(f.kind, 0, defs, [d.id]);
  t.skills = [];
  return { m, f, t, defs, at: (now: number) => new SkillSystem(m, now, defs) };
}

test('모든 코스트 스킬의 기본 공격 5·피격 3 회복, 배리어 피격과 상한 적용',()=>{
  const {f,t,at}=fixture(definition({resource:{max:100},effects:[]}));
  at(100).basicAttack(f,t);assert.equal(f.skills[0].cost,5);
  f.shield=100;at(200).basicAttack(t,f);assert.equal(f.skills[0].cost,8);
  f.skills[0].cost=98;t.x=7;t.y=7;at(300).basicAttack(t,f);assert.equal(f.skills[0].cost,100);
});

test('피해 0에는 피격 코스트 없음, 자원 없는 패시브와 유지 중 회복 금지 규칙 유지',()=>{
  const {f,t,at}=fixture(definition({resource:{max:100},effects:[],activation:{mode:'sustain',drainPerSecond:10,modifiers:{}}}));
  t.stats.attack=0;at(100).basicAttack(t,f);assert.equal(f.skills[0].cost,0);
  f.skills[0].active=true;f.skills[0].cost=50;t.stats.attack=10;
  at(200).basicAttack(f,t);at(300).basicAttack(t,f);assert.equal(f.skills[0].cost,50);
});
test("자동 회복 → 최대 코스트 자동 발동·소모·동일 시각 중복 방지", () => {
  const { f, t, at } = fixture(definition());
  at(3000).advance();
  assert.equal(f.skills[0].cost, 75);
  assert.equal(f.skills[0].activations, 0);
  at(4000).advance();
  assert.equal(f.skills[0].cost, 0);
  assert.equal(f.skills[0].activations, 1);
  assert.equal(t.hp, 1980);
  at(4000).advance();
  assert.equal(t.hp, 1980);
});
test("기본 공격 회복: 3회 공격 발동, 스킬 피해는 공격 횟수·코스트를 재생성하지 않음", () => {
  const { f, t, m, at } = fixture(
    definition({ resource: { max: 60, perBasicAttack: 20 } }),
  );
  for (const now of [100, 200, 300]) at(now).basicAttack(f, t);
  assert.equal(f.basicAttacks, 3);
  assert.equal(f.skills[0].activations, 1);
  assert.equal(f.skills[0].cost, 0);
  assert.equal(t.hp, 1950);
  assert.equal(m.events.filter((e) => e.type === "skillDamage").length, 1);
});
test("AND/OR/NOT 복합 조건과 대상 없음: 코스트 보존 후 재평가", () => {
  const d = definition({
    triggers: [
      {
        on: "costFull",
        when: {
          all: [
            { type: "hpBelow", ratio: 0.5 },
            {
              any: [
                { type: "enemyInRange", range: 2 },
                { not: { type: "elapsedAtLeast", ms: 1000 } },
              ],
            },
          ],
        },
      },
    ],
  });
  const { f, t, at } = fixture(d);
  at(4000).advance();
  assert.equal(f.skills[0].cost, 100);
  assert.equal(f.skills[0].activations, 0);
  f.hp = 50;
  t.x = 5;
  t.y = 5;
  at(4100).advance();
  assert.equal(f.skills[0].cost, 100);
  t.x = 1;
  t.y = 0;
  at(4200).advance();
  assert.equal(f.skills[0].activations, 1);
});
test("최대 코스트여도 사거리 내 대상 없으면 소비하지 않음", () => {
  const { f, t, at } = fixture(definition());
  t.x = 5;
  t.y = 5;
  at(8000).advance();
  assert.equal(f.skills[0].cost, 100);
  assert.equal(f.skills[0].activations, 0);
  t.x = 1;
  t.y = 0;
  at(8100).advance();
  assert.equal(f.skills[0].cost, 0);
});
test("지속형: 점진 소모·보정 적용·공격 회복 차단·고갈 시 해제·종료 후 쿨다운", () => {
  const d = definition({
    triggers: [{ on: "battleStart" }, { on: "costFull" }],
    resource: {
      max: 100,
      initial: 100,
      regenPerSecond: 100,
      perBasicAttack: 50,
    },
    target: { kind: "self" },
    effects: [],
    cooldownMs: 2000,
    activation: {
      mode: "sustain",
      drainPerSecond: 25,
      modifiers: { stats: { attack: 20 }, damageTakenMultiplier: 0.5 },
    },
  });
  const { f, t, at, defs } = fixture(d);
  at(0).begin();
  assert.equal(combatStats(f, 0, defs).stats.attack, 30);
  at(100).basicAttack(f, t);
  assert.equal(f.skills[0].cost, 100);
  at(1000).advance();
  assert.equal(f.skills[0].cost, 75);
  assert.equal(combatStats(f, 1000, defs).damageTakenMultiplier, 0.5);
  at(4000).advance();
  assert.equal(f.skills[0].cost, 0);
  assert.equal(f.skills[0].active, false);
  assert.equal(f.skills[0].cooldownUntil, 6000);
  assert.equal(combatStats(f, 4000, defs).stats.attack, 10);
  at(5000).advance();
  assert.equal(f.skills[0].cost, 100);
  assert.equal(f.skills[0].active, false);
  at(6000).advance();
  assert.equal(f.skills[0].active, true);
  assert.equal(f.skills[0].activations, 2);
});
test("지속형 주기 효과: 고갈 경계에서는 추가 펄스 없음", () => {
  const d = definition({
    triggers: [{ on: "battleStart" }],
    resource: { max: 100, initial: 100 },
    target: { kind: "self" },
    effects: [],
    activation: {
      mode: "sustain",
      drainPerSecond: 25,
      modifiers: {},
      pulse: { everyMs: 1000, effects: [{ type: "heal", amount: 5 }] },
    },
  });
  const { f, at } = fixture(d);
  f.hp = 100;
  at(0).begin();
  for (const n of [1000, 2000, 3000, 4000]) at(n).advance();
  assert.equal(f.hp, 115);
  assert.equal(f.skills[0].active, false);
});
test("공격 횟수 패시브: 매 3회, 회복량 최대 체력 제한", () => {
  const d = definition({
    kind: "passive",
    resource: undefined,
    triggers: [
      { on: "afterBasicAttack", when: { type: "attacksEvery", count: 3 } },
    ],
    target: { kind: "self" },
    effects: [{ type: "heal", amount: 12 }],
    activation: { mode: "instant" },
  });
  const { f, t, at } = fixture(d);
  f.hp = f.maxHp - 5;
  for (const n of [100, 200, 300]) at(n).basicAttack(f, t);
  assert.equal(f.hp, f.maxHp);
  assert.equal(f.skills[0].activations, 1);
  for (const n of [400, 500, 600]) at(n).basicAttack(f, t);
  assert.equal(f.skills[0].activations, 2);
});
test("피격 패시브: 체력 조건·전투당 1회·사망 후 미발동", () => {
  const d = definition({
    kind: "passive",
    resource: undefined,
    triggers: [
      {
        on: "onDamaged",
        when: {
          all: [
            { type: "hpBelow", ratio: 0.5 },
            { type: "damageSource", source: "basic" },
          ],
        },
      },
    ],
    maxActivationsPerBattle: 1,
    target: { kind: "self" },
    effects: [{ type: "shield", amount: 55 }],
    activation: { mode: "instant" },
  });
  const { f, t, at } = fixture(d);
  f.hp = 100;
  at(100).basicAttack(t, f);
  assert.equal(f.skills[0].activations, 1);
  assert.equal(f.shield, 55);
  at(200).basicAttack(t, f);
  assert.equal(f.skills[0].activations, 1);
  const fresh = fixture(d);
  fresh.f.hp = 1;
  fresh.at(100).basicAttack(fresh.t, fresh.f);
  assert.equal(fresh.f.hp, 0);
  assert.equal(fresh.f.skills[0].activations, 0);
});
test("피격·처치 코스트 회복과 패시브 트리거", () => {
  const d = definition({
    resource: { max: 100, perDamaged: 10, perKill: 20 },
    effects: [],
  });
  const { f, t, at } = fixture(d);
  at(100).basicAttack(t, f);
  assert.equal(f.skills[0].cost, 13);
  t.hp = 1;
  at(200).basicAttack(f, t);
  assert.equal(f.skills[0].cost, 38);
});
test("일시 버프는 기본·장비 능력치를 변경하지 않고 만료", () => {
  const d = definition({
    kind: "passive",
    resource: undefined,
    triggers: [{ on: "battleStart" }],
    target: { kind: "self" },
    effects: [
      { type: "buff", durationMs: 1000, modifiers: { stats: { attack: 20 } } },
    ],
    activation: { mode: "instant" },
  });
  const { f, at, defs } = fixture(d);
  f.stats.attack = 33;
  at(0).begin();
  assert.equal(combatStats(f, 999, defs).stats.attack, 53);
  at(1000).advance();
  assert.equal(f.stats.attack, 33);
  assert.equal(combatStats(f, 1000, defs).stats.attack, 33);
  assert.equal(f.buffs.length, 0);
});
test("사망·전투 종료 시 지속 효과와 버프 정리", () => {
  const d = definition({
    triggers: [{ on: "battleStart" }],
    resource: { max: 100, initial: 100 },
    target: { kind: "self" },
    effects: [],
    activation: {
      mode: "sustain",
      drainPerSecond: 10,
      modifiers: { stats: { attack: 30 } },
    },
  });
  const a = fixture(d);
  a.at(0).begin();
  a.f.hp = 1;
  a.at(100).basicAttack(a.t, a.f);
  assert.equal(a.f.skills[0].active, false);
  const b = fixture(d);
  b.at(0).begin();
  b.at(500).endBattle();
  assert.equal(b.f.skills[0].active, false);
  assert.equal(combatStats(b.f, 500, b.defs).stats.attack, 10);
});
test("스킬 재사용 대기 중 풀 코스트 보존, 쿨다운 종료 시 발동", () => {
  const { f, at } = fixture(
    definition({ resource: { max: 10, regenPerSecond: 10 }, cooldownMs: 3000 }),
  );
  at(1000).advance();
  at(2000).advance();
  assert.equal(f.skills[0].cost, 10);
  assert.equal(f.skills[0].activations, 1);
  at(4000).advance();
  assert.equal(f.skills[0].activations, 2);
});
test("잘못된 스킬 데이터 조기 거부", () => {
  assert.throws(() =>
    validateSkill(
      definition({
        activation: { mode: "sustain", drainPerSecond: 0, modifiers: {} },
      }),
    ),
  );
  assert.throws(() => validateSkill(definition({ resource: { max: NaN } })));
  assert.throws(() =>
    validateSkill(
      definition({
        triggers: [{ on: "tick", when: { type: "attacksEvery", count: 0 } }],
      }),
    ),
  );
});
test("불규칙 서버 호출과 100ms 호출의 전투/코스트 결과 일치", () => {
  const m = newMatch();
  m.players = [newPlayer("a", "A"), newPlayer("b", "B")];
  startCombat(m, 0);
  for (const f of m.fighters) {
    f.hp = f.maxHp = 50000;
  }
  const other = structuredClone(m);
  for (let n = 100; n <= 12000; n += 100) tick(m, n);
  for (const n of [350, 1230, 2810, 5000, 8650, 12000]) tick(other, n);
  assert.deepEqual(other, m);
});
test("새 라운드에서 코스트·시전 횟수·버프를 새로 생성", () => {
  const m = newMatch();
  m.players = [newPlayer("a", "A"), newPlayer("b", "B")];
  startCombat(m, 0);
  m.fighters[0].skills[0].cost = 87;
  m.fighters[0].skills[0].activations = 3;
  m.fighters[0].basicAttacks = 9;
  prepare(m, 5000);
  startCombat(m, 6000);
  assert.equal(m.fighters[0].skills[0].cost, 0);
  assert.equal(m.fighters[0].skills[0].activations, 0);
  assert.equal(m.fighters[0].basicAttacks, 0);
  assert.equal(m.fighters[0].buffs.length, 0);
});
