import test from "node:test";
import assert from "node:assert/strict";
import { LocalPracticeClient } from "../client/local-practice";
import { Connection } from "../client/net";
import type { PlayRoom } from "../client/room-client";
import type { Snapshot, SelfPlayerSnapshot } from "../shared/model";

function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); } };
}
async function observe(room: PlayRoom) {
  let snapshot!: Snapshot;
  const notices: string[] = [];
  room.onMessage("snapshot", s => { snapshot = s; });
  room.onMessage("notice", s => notices.push(s));
  await Promise.resolve();
  return { view: () => snapshot, own: () => snapshot.players.find(p => p.id === room.sessionId) as SelfPlayerSnapshot, notices };
}

test("local Blue Archive plays a real battle and preserves deployment through reload", async t => {
  let now = 1000;
  const store = storage(), client = new LocalPracticeClient(store, () => now);
  const room = await client.create("duel", {name: "모바일", practice: true, roster: "blueArchive"});
  t.after(() => room.leave());
  const state = await observe(room);
  room.send("debug", {type: "pause", paused: true});
  assert.equal(state.own().units.length, 20);
  assert.equal(state.own().gold, 30);
  const reserve = state.own().units.find(u => u.benchSlot === 0)!;
  room.send("action", {type: "place", unitId: reserve.id, x: 0, y: 1});
  assert.equal(state.own().units.find(u => u.id === reserve.id)!.x, 0);
  room.connection.close();
  now += 60 * 60 * 1000;
  const restored = await client.reconnect(room.reconnectionToken);
  t.after(() => restored.leave());
  const resumed = await observe(restored);
  assert.equal(resumed.view().gameNow, state.view().gameNow, "reload does not fast-forward a background match");
  assert.equal(resumed.own().units.find(u => u.id === reserve.id)!.y, 1);
  restored.send("debug", {type: "pause", paused: false});
  const beforeBackground = resumed.view().gameNow;
  now += 60 * 60 * 1000;
  restored.send("debug", {type: "pause", paused: true});
  assert.equal(resumed.view().gameNow, beforeBackground, "a suspended mobile timer does not skip rounds");
  restored.send("action", {type: "ready"});
  assert.equal(resumed.view().phase, "combat");
  restored.send("debug", {type: "nextPhase"});
  assert.equal(resumed.view().phase, "result");
  assert.equal(resumed.view().roundHistory.length, 1);
  assert.deepEqual([...state.notices, ...resumed.notices], []);
});

test("local ordinary practice buys, deploys, grants round rewards and returns to the lobby", async t => {
  const store = storage(), client = new LocalPracticeClient(store);
  const room = await client.create("duel", {name: "연습", practice: true});
  t.after(() => room.leave());
  const state = await observe(room);
  room.send("debug", {type: "pause", paused: true});
  const offer = state.own().shop[0], gold = state.own().gold;
  room.send("action", {type: "buy", offerId: offer.id, revision: state.own().shopRevision});
  assert.equal(state.own().gold, gold - offer.cost);
  const unit = state.own().units[0];
  room.send("action", {type: "place", unitId: unit.id, x: 0, y: 1});
  room.send("action", {type: "ready"});
  assert.equal(state.view().phase, "combat");
  room.send("debug", {type: "nextPhase"});
  assert.equal(state.view().phase, "result");
  room.send("debug", {type: "preset", preset: "reward"});
  const reward = state.own().pendingReward!;
  assert.ok(reward.options.length);
  room.send("action", {type: "chooseReward", rewardId: reward.id, optionId: reward.options[0].id});
  assert.equal(state.own().pendingReward, null);
  assert.deepEqual(state.notices, []);
  await room.leave();
  await assert.rejects(client.reconnect(room.reconnectionToken), /저장된 연습/);
});

test("local bot practice has six participants, minions and real multi-arena combat", async t => {
  const client = new LocalPracticeClient(storage());
  const room = await client.create("duel", {name: "봇 연습", practice: false, botPractice: true});
  t.after(() => room.leave());
  const state = await observe(room);
  assert.equal(state.view().players.length, 6);
  assert.equal(state.view().encounter, "minion");
  assert.equal(state.view().players.filter(p => p.ready).length, 5);
  room.send("debug", {type: "pause", paused: true});
  room.send("debug", {type: "preset", preset: "synergy"});
  room.send("action", {type: "ready"});
  room.send("debug", {type: "nextPhase"});
  assert.equal(state.view().phase, "combat");
  assert.equal(state.view().battlePairs!.length, 3);
  room.send("debug", {type: "nextPhase"});
  assert.equal(state.view().phase, "result");
  assert.deepEqual(state.notices, []);
});

test("Connection restores a local session and clears it on explicit leave", async t => {
  const store = storage(), client = new LocalPracticeClient(store);
  const net = new Connection({client, storage: store});
  t.after(() => net.leave());
  let first!: Snapshot;
  net.onSnapshot = s => { first = s; };
  await net.connect("blueArchive", "이어하기");
  await Promise.resolve();
  assert.equal(first.roster, "blueArchive");
  const token = store.getItem("duel-token");
  net.room!.connection.close();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(net.connected, true);
  assert.equal(store.getItem("duel-token"), token);
  await net.leave();
  assert.equal(store.getItem("duel-token"), null);
  assert.equal(await net.restore(), false);
});

test("local mode rejects online games and corrupted saves without starting a server", async () => {
  const store = storage(), client = new LocalPracticeClient(store);
  await assert.rejects(client.create("duel", {name: "A", practice: false}), /친구 대전/);
  await assert.rejects(client.joinById("ABCD", {name: "A"}), /참가할 수 없습니다/);
  store.setItem("autochess-local-v1", "invalid json");
  await assert.rejects(client.reconnect("local:missing"), error => (error as {code: number}).code === 4212);
});
