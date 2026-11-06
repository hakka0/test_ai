import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { directionFrame } from "../client/unit-appearance";
import { BLUE_ARCHIVE_KINDS, SPRITE_FRAME_SIZE } from "../shared/blue-archive";
import { UNITS, unitKindsFor } from "../shared/catalog";
import { newMatch, newPlayer, prepare, startCombat } from "../shared/engine";
import { offerRoundReward } from "../shared/rewards";
import { SKILLS } from "../shared/skill-catalog";
import { SkillSystem } from "../shared/skills";
import { pickPoolKind } from "../shared/unit-pool";

test("all 20 characters have a six-direction sheet, portrait, stats and a working skill", () => {
  assert.equal(BLUE_ARCHIVE_KINDS.length, 20);
  for (const kind of BLUE_ARCHIVE_KINDS) {
    const def = UNITS[kind];
    assert.ok(def.spriteSheet);
    const sheet = readFileSync("public" + def.spriteSheet);
    const icon = readFileSync("public" + def.image);
    for (const png of [sheet, icon]) assert.equal(png.subarray(12, 16).toString(), "IHDR");
    assert.deepEqual([sheet.readUInt32BE(16), sheet.readUInt32BE(20)], [SPRITE_FRAME_SIZE * 3, SPRITE_FRAME_SIZE * 2]);
    assert.deepEqual([icon.readUInt32BE(16), icon.readUInt32BE(20)], [SPRITE_FRAME_SIZE, SPRITE_FRAME_SIZE]);
    assert.ok(Object.values(def.stats).every(n => Number.isFinite(n) && n > 0));

    const match = newMatch("practice");
    const own = newPlayer("p", "Player", "blueArchive"), bot = newPlayer("b", "Bot", "blueArchive");
    own.units.push({ id: "own", owner: own.id, kind, rank: 1, x: 3, y: 3, equipment: [] });
    bot.units.push({ id: "bot", owner: bot.id, kind: "yuuka", rank: 1, x: 4, y: 3, equipment: [] });
    match.players = [own, bot];
    startCombat(match, 100);
    const fighter = match.fighters[0];
    assert.equal(fighter.skills.length, 1);
    const state = fighter.skills[0], skill = SKILLS[state.id];
    assert.equal(skill.kind, "active");
    assert.ok(skill.resource);
    fighter.hp -= 50;
    state.cost = skill.resource.max;
    new SkillSystem(match, 200).advance();
    assert.equal(state.activations, 1, kind);
    assert.ok(match.events.some(e => e.type === "skillStart" && e.skillId === state.id && e.source === fighter.id), kind);
  }
});

test("Blue Archive draws from its own roster in the shop and rewards", () => {
  const player = newPlayer("p", "Player", "blueArchive");
  const match = newMatch("practice");
  match.players = [player];
  prepare(match, 100);
  assert.equal(player.shop.length, 5);
  assert.ok(player.shop.every(o => unitKindsFor(player.roster).includes(o.kind)));
  player.shop = [];
  for (const [i, kind] of BLUE_ARCHIVE_KINDS.entries()) {
    assert.equal(pickPoolKind(player, [player], () => (i + 0.5) / BLUE_ARCHIVE_KINDS.length), kind);
  }
  offerRoundReward(player, 5, () => 0);
  const reward = player.pendingReward?.options.find(o => o.type === "unit");
  assert.ok(reward && unitKindsFor(player.roster).includes(reward.kind));
  assert.equal(unitKindsFor().length, 18);
  assert.ok(BLUE_ARCHIVE_KINDS.every(kind => !unitKindsFor().includes(kind)));
});

test("direction selection maps the six frames and defaults to front or back in preparation", () => {
  assert.deepEqual([-1, 0, 1].map(dx => directionFrame(dx, 1, true)), [0, 1, 2]);
  assert.deepEqual([-1, 0, 1].map(dx => directionFrame(dx, -1, false)), [3, 4, 5]);
  assert.equal(directionFrame(0, 0, true), 4);
  assert.equal(directionFrame(0, 0, false), 1);
});
