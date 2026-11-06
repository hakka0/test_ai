import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Client, type Room } from "colyseus.js";
import type { Snapshot, SelfPlayerSnapshot } from "../shared/model";
import { COLS } from "../shared/model";
function ownPlayer(s: Snapshot, id: string): SelfPlayerSnapshot {
  const p = s.players.find((p): p is SelfPlayerSnapshot => p.id === id && p.visibility === "self");
  assert.ok(p);
  return p;
}
function privateViews(own: Snapshot, other: Snapshot, id: string) {
  const privatePlayer = ownPlayer(own, id);
  const publicPlayer = other.players.find(p => p.id === id)!;
  assert.equal(publicPlayer.visibility, "opponent");
  assert.deepEqual(Object.keys(publicPlayer).sort(),
    ["visibility", "rosterVisible", "id", "name", "level", "health", "connected", "ready", "score", "units", "bench", "inventory"].sort());
  assert.equal(publicPlayer.level, privatePlayer.level);
  assert.deepEqual(publicPlayer.units.map(u => u.id), publicPlayer.rosterVisible?privatePlayer.units.filter(u => u.x >= 0).map(u => u.id):[]);
  assert.ok(publicPlayer.visibility==='opponent');
  assert.deepEqual(publicPlayer.bench,publicPlayer.rosterVisible?privatePlayer.units.filter(u=>u.x<0):[]);
  if(!publicPlayer.rosterVisible)assert.deepEqual(publicPlayer.inventory,[]);
  assert.ok(publicPlayer.units.every(u => !("benchSlot" in u)));
  assert.ok(other.fighters.every(f => !("nextAttack" in f) && !("nextMove" in f)));
  assert.ok(!("lastTick" in other) && !("combatStartedAt" in other));
}
const port = 2577,
  url = `http://127.0.0.1:${port}`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function state(
  room: Room,
  predicate: (s: Snapshot) => boolean,
): Promise<Snapshot> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      off();
      reject(new Error("snapshot timeout"));
    }, 6000);
    const off = room.onMessage("snapshot", (s: Snapshot) => {
      if (predicate(s)) {
        clearTimeout(timeout);
        off();
        resolve(s);
      }
    });
  });
}
test(
  "실제 서버: 플레이어별 정보 공개·타인 조작 거부·전투 동기화·재접속·봇",
  { timeout: 25000 },
  async () => {
    const proc = spawn(
      process.execPath,
      ["--import", "tsx", "server/index.ts"],
      { env: { ...process.env, PORT: String(port) }, stdio: "pipe" },
    );
    let output = "";
    proc.stderr.on("data", (d) => (output += d));
    let a: Room | undefined, b: Room | undefined;
    try {
      let ok = false;
      for (let i = 0; i < 70; i++) {
        try {
          if ((await fetch(url + "/health")).ok) {
            ok = true;
            break;
          }
        } catch {}
        await wait(100);
      }
      assert.ok(ok, output);
      const c1 = new Client(url),
        c2 = new Client(url);
      a = await c1.create("duel", { name: "테스트 A" });
      a.onMessage("pong", () => {});
      const waiting = await state(a, s => s.phase === "waiting");
      assert.equal(ownPlayer(waiting, a.sessionId).units.length, 0);
      b = await c2.joinById(a.roomId, { name: "테스트 B" });
      const [s, t] = await Promise.all([state(a, s => s.phase === "prepare"), state(b, s => s.phase === "prepare")]);
      assert.equal(s.players.length, 2);
      privateViews(s, t, a.sessionId);
      privateViews(t, s, b.sessionId);
      const denied = new Promise<string>((resolve) =>
        a!.onMessage("notice", resolve),
      );
      a.send("action", { type: "bench", unitId: "not-owned-unit" });
      assert.match(await denied, /내 캐릭터/);
      const invalidCast = new Promise<string>((resolve) =>
        a!.onMessage("notice", resolve),
      );
      a.send("action", {
        type: "castSkill",
        skillId: "guardian",
        cost: 100000,
      });
      assert.match(await invalidCast, /알 수 없는/);
      const own = ownPlayer(s, a.sessionId);
      const progressionA = state(a, s => s.players.some(p => p.id === a!.sessionId && p.level === 3));
      const progressionB = state(b, s => s.players.some(p => p.id === a!.sessionId && p.level === 3));
      a.send("action", {type: "buyExperience", revision: own.experienceRevision});
      const [levelA, levelB] = await Promise.all([progressionA, progressionB]);
      const upgraded = ownPlayer(levelA, a.sessionId);
      assert.equal(upgraded.experience, 0);
      assert.equal(upgraded.gold, 6);
      privateViews(levelA, levelB, a.sessionId);
      // A newly purchased reserve must never appear in the opponent's payload.
      const boughtState = state(a, s => ownPlayer(s, a!.sessionId).units.length === 1);
      a.send("action", {type: "buy", offerId: upgraded.shop[0].id, revision: upgraded.shopRevision});
      const bought = await boughtState;
      const opponentAfterBuy = await state(b, s => s.phase === "prepare");
      privateViews(bought, opponentAfterBuy, a.sessionId);
      const deployedA = state(a, s => ownPlayer(s, a!.sessionId).units[0].x === 2);
      a.send("action", {type: "place", unitId: ownPlayer(bought, a.sessionId).units[0].id, x: 2, y: 1});
      await deployedA;
      const bp = ownPlayer(await state(b, s => s.phase === "prepare"), b.sessionId);
      const cheapest = [...bp.shop].sort((a,b) => a.cost-b.cost)[0];
      const purchasedB = state(b, s => ownPlayer(s, b!.sessionId).units.length === 1);
      b.send("action", {type: "buy", offerId: cheapest.id, revision: bp.shopRevision});
      const rosterB = ownPlayer(await purchasedB, b.sessionId);
      const deployedB = state(b, s => ownPlayer(s, b!.sessionId).units[0].x === 2);
      b.send("action", {type: "place", unitId: rosterB.units[0].id, x: 2, y: 1});
      await deployedB;
      // Both owners can use the new columns. PvP preparation keeps these
      // placements public while keeping economic information private.
      for (const [room, other] of [[a, b], [b, a]]) {
        for (const column of [COLS - 2, COLS - 1, 2]) {
          const current = ownPlayer(await state(room, s => s.phase === "prepare"), room.sessionId);
          const moved = state(room, s => ownPlayer(s, room.sessionId).units[0].x === column);
          const publicMoved = state(other, s => s.phase==='prepare'&&s.players.some(p=>p.id===room.sessionId&&p.visibility==='opponent'&&p.rosterVisible===true&&p.units.some(u=>u.x===column)));
          room.send("action", {type: "place", unitId: current.units[0].id, x: column, y: 1});
          const [ownView, otherView] = await Promise.all([moved, publicMoved]);
          privateViews(ownView, otherView, room.sessionId);
        }
      }
      const sa = state(a, (s) => s.phase === "combat"),
        sb = state(b, (s) => s.phase === "combat");
      a.send("action", { type: "ready" });
      b.send("action", { type: "ready" });
      const [x, y] = await Promise.all([sa, sb]);
      assert.equal(x.deadline, y.deadline);
      assert.deepEqual(x.fighters, y.fighters);
      assert.ok(x.fighters.every((f) => f.skills.length === (f.minion?0:2)));
      privateViews(x, y, a.sessionId);
      privateViews(y, x, b.sessionId);
      // Real two-player rooms allow trading after both players are ready.
      const beforeReroll = ownPlayer(y, b.sessionId);
      const rolledState = state(b, s => ownPlayer(s, b!.sessionId).shopRevision > beforeReroll.shopRevision);
      b.send("action", {type: "reroll", revision: beforeReroll.shopRevision});
      const rolled = await rolledState, shopPlayer = ownPlayer(rolled, b.sessionId);
      assert.equal(rolled.phase, "combat");assert.equal(shopPlayer.gold, beforeReroll.gold - 5);
      const affordable = shopPlayer.shop.find(o => o.cost <= shopPlayer.gold);
      if (affordable) {
        const combatBuy = state(b, s => ownPlayer(s, b!.sessionId).shop.some(o => o.id === affordable.id && o.sold));
        b.send("action", {type: "buy", offerId: affordable.id, revision: shopPlayer.shopRevision});
        const combatBought = await combatBuy;assert.equal(combatBought.phase, "combat");
        assert.equal(ownPlayer(combatBought, b.sessionId).gold, shopPlayer.gold - affordable.cost);
        assert.deepEqual(combatBought.fighters.map(f => [f.id,f.rank,f.maxHp,f.equipment]),y.fighters.map(f => [f.id,f.rank,f.maxHp,f.equipment]));
        privateViews(combatBought, await state(a, s => s.phase === "combat"), b.sessionId);
      }
      const charged = await state(
        a,
        (s) => s.phase === "combat" && s.fighters[0].skills[0].cost > 0,
      );
      const beforeCost = charged.fighters.find((f) => f.owner === a!.sessionId)!
        .skills[0].cost;
      const token = a.reconnectionToken,
        session = a.sessionId;
      a.connection.close();
      await wait(400);
      a = await c1.reconnect(token);
      const recovered = await state(a, (s) =>
        s.players.some((p) => p.id === session && p.connected),
      );
      assert.equal(a.sessionId, session);
      assert.equal(recovered.round, 1);
      assert.equal(recovered.players.find(p => p.id === session)!.level, 3);
      assert.equal(ownPlayer(recovered, session).experience, 0);
      assert.deepEqual(ownPlayer(recovered, session).shop, ownPlayer(bought, session).shop);
      const opponentAfterReconnect = await state(b, s => s.players.some(p => p.id === session && p.connected));
      privateViews(recovered, opponentAfterReconnect, session);
      assert.ok(
        recovered.fighters.find((f) => f.owner === session)!.skills[0].cost >=
          beforeCost,
      );
      await a.leave();
      a = undefined;
      const final = await state(b, (s) => s.phase === "finished");
      assert.match(final.result, /연결 종료/);
      assert.ok(
        final.fighters.every(
          (f) => f.skills.every((s) => !s.active),
        ),
      );
      privateViews(recovered, final, session);
      await b.leave();
      b = undefined;
      a = await c1.create("duel", {name: "봇 검증", practice: true});
      const practice = await state(a, s => s.phase === "prepare");
      assert.equal(ownPlayer(practice, a.sessionId).visibility, "self");
      const bot = practice.players.find(p => p.id === "practice-bot")!;
      assert.equal(bot.visibility, "opponent");
      assert.equal(bot.units.length, 1);
      assert.ok(!("shop" in bot) && !("gold" in bot));
    } finally {
      await a?.leave();
      await b?.leave();
      proc.kill("SIGTERM");
    }
  },
);
