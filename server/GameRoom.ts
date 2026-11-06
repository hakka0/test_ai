import { SkillSystem } from "../shared/skills";
import { Room, type Client } from "@colyseus/core";
import {reserveRoomCode,releaseRoomCode} from './room-code';
import { snapshotFor } from "../shared/snapshot";
import { GameClock, advanceMatch } from "../shared/game-time";
import { DebugSession, debugAllowed } from "./debug";
import { RECONNECT_GRACE_SECONDS } from "../shared/connection-policy";
import {INTRO_MINION_ROUNDS} from '../shared/minions';
import {isBot} from '../shared/bot-practice';
import { BLUE_ARCHIVE_KINDS, BLUE_ARCHIVE_UNITS, type BlueArchiveKind } from "../shared/blue-archive";
import { COLS, ROWS, type Player, type Roster } from "../shared/model";
import { MAX_LEVEL } from "../shared/progression";
import {
  newMatch,
  newPlayer,
  prepare,
  applyAction,
  botSetup,
} from "../shared/engine";
const epoch = Date.now(),
  mono = performance.now();
export const serverNow = () => Math.floor(epoch + performance.now() - mono);
export class GameRoom extends Room {
  maxClients = 2;
  game = newMatch('duel',INTRO_MINION_ROUNDS);
  practice = false;
  botPractice = false;
  roster?: Roster;
  gameClock = new GameClock(serverNow());
  debugger = new DebugSession();
  debugEnabled = process.env.DEBUG_GAME === "1" && process.env.NODE_ENV !== "production";
  rates = new Map<string, { at: number; count: number }>();
  onCreate(options: { practice?: boolean; botPractice?: boolean; roster?: unknown }) {
    this.roomId = reserveRoomCode();
    this.practice = options?.practice === true;
    this.botPractice=options?.botPractice===true;
    if(this.botPractice)this.maxClients=1;
    this.game.mode=this.botPractice?'botPractice':this.practice?'practice':'duel';
    if (this.game.mode === "practice" && options?.roster === "blueArchive") {
      this.roster = "blueArchive";
      this.game.minionRounds = 0;
    }
    this.onMessage("ping", (client, data) => {
      if (typeof data === "number" && Number.isFinite(data))
        client.send("pong", { sent: data, serverNow: serverNow() });
    });
    this.onMessage("action", (client, data) => {
      const realNow = serverNow(),
        now = this.advance(realNow),
        rate = this.rates.get(client.sessionId);
      if (!rate || realNow - rate.at >= 1000)
        this.rates.set(client.sessionId, { at: realNow, count: 1 });
      else if (++rate.count > 25) return;
      const error = applyAction(this.game, client.sessionId, data, now);
      if (error) client.send("notice", error);
      this.publish();
    });
    this.onMessage("debug", (client, data) => {
      if (!this.canDebug(client.sessionId)) {
        client.send("notice", "디버깅은 개발 서버의 혼자 연습 방에서만 사용할 수 있습니다.");
        return;
      }
      const realNow = serverNow();
      this.advance(realNow);
      const error = this.debugger.apply(this.game, this.gameClock, data, realNow);
      if (error) client.send("notice", error);
      this.publish();
    });
    this.setSimulationInterval(() => {
      this.advance(serverNow());
      this.publish();
    }, 100);
    // Colyseus disposes empty rooms after their reconnection seats expire.
    // Never destroy a connected room solely because it has been open a while.
  }
  advance(realNow: number) {
    const now = this.gameClock.advance(realNow);
    advanceMatch(this.game, now);
    return now;
  }
  onJoin(client: Client, options: { name?: unknown }) {
    if (this.game.phase !== "waiting") throw new Error("이미 시작한 방입니다.");
    const name =
      typeof options?.name === "string" ? options.name.trim().slice(0, 16) : "";
    const player = newPlayer(client.sessionId, name || `플레이어 ${this.game.players.length + 1}`, this.roster);
    this.game.players.push(player);
    if (this.practice&&!this.botPractice) {
      const bot = newPlayer("practice-bot", "연습 상대", this.roster);
      this.game.players.push(bot);
      if (this.roster === "blueArchive") {
        seedBlueArchive(player);
        seedBlueArchive(bot, true);
      } else botSetup(bot,this.game.players);
    }
    if(this.botPractice){
      for(let i=1;i<=5;i++){
        const bot=newPlayer(`pvp-bot-${i}`,`연습 봇 ${i}`);bot.bot=true;this.game.players.push(bot);
      }
      // Reserve initial offers against all six participants, then prepare lets bots buy.
      for(const p of this.game.players)p.shop=[];
    }
    if (this.game.players.length === 2 || this.botPractice) {
      void this.lock();
      prepare(this.game, this.advance(serverNow()));
    }
    this.publish();
  }
  publish() {
    if (this.practice && this.game.phase === "prepare") {
      const bot = this.game.players.find((p) => p.id === "practice-bot");
      if (bot) bot.ready = true;
    }
    if(this.botPractice&&this.game.phase==='prepare')for(const p of this.game.players)if(isBot(p))p.ready=true;
    const now = serverNow();
    for (const client of this.clients)
      client.send("snapshot", snapshotFor(this.game, client.sessionId, now, this.roomId,
        this.gameClock.now, this.gameClock.scale,
        this.canDebug(client.sessionId) ? this.debugger.state(this.gameClock) : undefined,this.botPractice?'botPractice':this.practice?'practice':'duel'));
  }
  canDebug(viewerId:string){
    return debugAllowed(this.debugEnabled||this.botPractice,this.practice||this.botPractice,viewerId,this.game);
  }
  async onLeave(client: Client, consented: boolean) {
    const p = this.game.players.find((p) => p.id === client.sessionId);
    if (!p) return;
    p.connected = false;
    this.publish();
    if (!consented) {
      try {
        await this.allowReconnection(client, RECONNECT_GRACE_SECONDS);
        p.connected = true;
        this.publish();
        return;
      } catch {
        /* 유예시간 만료 */
      }
    }
    this.rates.delete(client.sessionId);
    if (this.game.phase === "waiting") {
      this.game.players = this.game.players.filter((v) => v !== p);
      return;
    }
    if (this.game.phase !== "finished") {
      new SkillSystem(this.game, this.gameClock.now).endBattle();
      this.game.endReason = "disconnect";
      this.game.phase = "finished";
      this.game.deadline = 0;
      const opponent = this.game.players.find((v) => v.id !== p.id);
      this.game.winner = opponent?.id ?? null;
      this.game.result = `${p.name} 연결 종료 · ${opponent?.name ?? "상대"} 승리`;
      this.publish();
    }
  }
  onDispose(){releaseRoomCode(this.roomId);}
}

const BLUE_ARCHIVE_BOT: readonly BlueArchiveKind[] = ["hoshino", "natsu", "neru", "mika", "aru", "hina", "aris", "noa"];

function seedBlueArchive(player: Player, bot = false) {
  const deployedCount = BLUE_ARCHIVE_BOT.length;
  const kinds = bot ? BLUE_ARCHIVE_BOT : BLUE_ARCHIVE_KINDS;
  player.level = MAX_LEVEL;
  player.gold = bot ? 0 : 30;
  let front = 0;
  let back = 0;
  for (const [index, kind] of kinds.entries()) {
    const deployed = index < deployedCount;
    const near = BLUE_ARCHIVE_UNITS[kind].stats.range <= 2;
    player.units.push({
      id: `${player.id}-${player.nextUnitId++}`, owner: player.id, kind, rank: 1,
      x: deployed ? (near ? front++ : back++) % COLS : -1,
      y: deployed ? ROWS / 2 - (near ? 1 : 2) : -1,
      benchSlot: deployed ? null : index - deployedCount, equipment: [],
    });
  }
}
