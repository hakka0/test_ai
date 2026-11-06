import { newMatch, newPlayer, botSetup, prepare, applyAction } from "../shared/engine";
import { GameClock, advanceMatch } from "../shared/game-time";
import { DebugSession } from "../shared/debug-session";
import { seedBlueArchive } from "../shared/practice-roster";
import { snapshotFor } from "../shared/snapshot";
import { INTRO_MINION_ROUNDS } from "../shared/minions";
import { isBot } from "../shared/bot-practice";
import type { Match } from "../shared/model";
import type { PlayRoom, RoomClient } from "./room-client";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const SAVE_KEY = "autochess-local-v1";
type SavedGame = {
  version: 1;
  token: string;
  sessionId: string;
  mode: "practice" | "botPractice";
  game: Match;
  clock: { now: number; speed: number; paused: boolean };
};

/** The same engine and snapshots as the server, without any HTTP or WebSocket. */
export class LocalPracticeRoom implements PlayRoom {
  readonly reconnectionToken: string;
  readonly sessionId: string;
  readonly connection = { isOpen: true, close: () => this.close(false) };
  private readonly messages = new Map<string, (data: any) => void>();
  private onLeft = (_code: number) => {};
  private readonly debugger = new DebugSession();
  private readonly clock: GameClock;
  private readonly timer: ReturnType<typeof setInterval>;
  private lastSave = 0;
  private lastReal: number;
  private readonly visibility = () => {
    // A backgrounded phone or a reloaded tab must not fast-forward the battle.
    this.lastReal = this.now();
    this.clock.seek(this.clock.now, this.lastReal);
    this.save();
  };

  constructor(private readonly saved: SavedGame, private readonly storage: Store,
    private readonly now = () => Date.now()) {
    this.sessionId = saved.sessionId;
    this.reconnectionToken = saved.token;
    this.lastReal = now();
    this.clock = new GameClock(this.lastReal);
    this.clock.seek(saved.clock.now, this.lastReal);
    this.clock.speed = saved.clock.speed;
    this.clock.paused = saved.clock.paused;
    this.timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      this.advance();
      this.publish();
      if (now() - this.lastSave >= 500) this.save();
    }, 100);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.visibility);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.visibility);
    this.save();
  }

  onMessage(type: string, callback: (data: any) => void) {
    this.messages.set(type, callback);
    if (type === "snapshot") queueMicrotask(() => this.publish());
    return () => this.messages.delete(type);
  }
  onLeave(callback: (code: number) => void) { this.onLeft = callback; }
  onError(_callback: (code: number, message?: string) => void) {}

  private advance() {
    const realNow = this.now();
    if (realNow - this.lastReal > 1000) this.clock.seek(this.clock.now, realNow);
    this.lastReal = realNow;
    advanceMatch(this.saved.game, this.clock.advance(realNow));
    return realNow;
  }

  private publish() {
    if (!this.connection.isOpen) return;
    const game = this.saved.game;
    if (game.phase === "prepare") for (const player of game.players)
      if (player.id === "practice-bot" || isBot(player)) player.ready = true;
    this.messages.get("snapshot")?.(snapshotFor(game, this.sessionId, this.now(), "LOCAL",
      this.clock.now, this.clock.scale, this.debugger.state(this.clock), this.saved.mode));
  }

  send(type: string, data: unknown) {
    if (!this.connection.isOpen) return;
    if (type === "ping") {
      this.messages.get("pong")?.({ sent: data, serverNow: this.now() });
      return;
    }
    const realNow = this.advance();
    const error = type === "action" ? applyAction(this.saved.game, this.sessionId, data, this.clock.now)
      : type === "debug" ? this.debugger.apply(this.saved.game, this.clock, data, realNow)
      : "지원하지 않는 연습 명령입니다.";
    if (error) this.messages.get("notice")?.(error);
    this.publish();
    this.save();
  }

  private save() {
    this.saved.clock = { now: this.clock.now, speed: this.clock.speed, paused: this.clock.paused };
    try { this.storage.setItem(SAVE_KEY, JSON.stringify(this.saved)); } catch { /* Storage can be unavailable. Play still works. */ }
    this.lastSave = this.now();
  }

  private close(consented: boolean) {
    if (!this.connection.isOpen) return;
    if (consented) { try { this.storage.removeItem(SAVE_KEY); } catch {} }
    else this.save();
    this.connection.isOpen = false;
    clearInterval(this.timer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.visibility);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.visibility);
    this.onLeft(consented ? 1000 : 1006);
    this.messages.clear();
  }
  async leave() { this.close(true); }
}

export class LocalPracticeClient implements RoomClient {
  constructor(private readonly storage: Store, private readonly now = () => Date.now()) {}

  async create(_room: string, options: {name: string; practice: boolean; botPractice?: boolean; roster?: string}) {
    if (!options.practice && !options.botPractice)
      throw new Error("이 버전에서는 혼자 연습과 봇 연습을 선택하세요. 친구 대전은 지원하지 않습니다.");
    const mode = options.botPractice ? "botPractice" : "practice";
    const roster = options.practice && options.roster === "blueArchive" ? "blueArchive" : undefined;
    const game = newMatch(mode, roster ? 0 : INTRO_MINION_ROUNDS);
    const sessionId = "local-player";
    const player = newPlayer(sessionId, options.name.trim().slice(0, 16) || "여행자", roster);
    game.players.push(player);
    if (options.botPractice) {
      for (let i = 1; i <= 5; i++) {
        const bot = newPlayer(`pvp-bot-${i}`, `연습 봇 ${i}`);
        bot.bot = true;
        game.players.push(bot);
      }
      for (const p of game.players) p.shop = [];
    } else {
      const bot = newPlayer("practice-bot", "연습 상대", roster);
      game.players.push(bot);
      if (roster) { seedBlueArchive(player); seedBlueArchive(bot, true); }
      else botSetup(bot, game.players);
    }
    prepare(game, this.now());
    return new LocalPracticeRoom({ version: 1, token: `local:${crypto.randomUUID()}`, sessionId, mode,
      game, clock: { now: this.now(), speed: 1, paused: false } }, this.storage, this.now);
  }

  async joinById(_code: string, _options: {name: string}): Promise<PlayRoom> {
    throw new Error("이 버전에서는 친구의 방에 참가할 수 없습니다. 혼자 연습을 선택하세요.");
  }

  async reconnect(token: string) {
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      const saved: SavedGame | null = raw ? JSON.parse(raw) : null;
      if (!saved || saved.version !== 1 || saved.token !== token || saved.sessionId !== "local-player"
        || !["practice", "botPractice"].includes(saved.mode)
        || !Array.isArray(saved.game?.players) || !saved.game.players.some(p => p.id === saved.sessionId)
        || !Number.isFinite(saved.clock?.now) || ![1, 2, 5, 10].includes(saved.clock.speed)
        || typeof saved.clock.paused !== "boolean") throw new Error("Invalid local save");
      snapshotFor(saved.game, saved.sessionId, this.now(), "LOCAL");
      return new LocalPracticeRoom(saved, this.storage, this.now);
    } catch {
      throw Object.assign(new Error("저장된 연습 경기를 찾을 수 없습니다. 새 연습을 시작하세요."), {code: 4212});
    }
  }
}
