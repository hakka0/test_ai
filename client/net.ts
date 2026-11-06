import { snapshotGameNow } from "../shared/view-clock";
import { Client, ErrorCode, type Room } from "colyseus.js";
import type { Snapshot, Action, DebugAction } from "../shared/model";
import { RECONNECT_GRACE_SECONDS, CONNECTION_STALE_MS, HEARTBEAT_INTERVAL_MS } from "../shared/connection-policy";
type RoomClient = Pick<Client, "create" | "joinById" | "reconnect">;
type TokenStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ConnectionMode = "create" | "join" | "practice" | "botPractice";
function defaultClient() {
 const endpoint = import.meta.env?.VITE_SERVER_URL ||
  (location.port === "5173" ? `${location.protocol}//${location.hostname}:2567` : location.origin);
 return new Client(endpoint);
}
export class Connection {
  room: Room | null = null;
  offset = Date.now() - performance.now();
  latency = 0;
  connected = false;
  private alive = true;
  // Every new connection/leave cancels callbacks and pending reconnects from old rooms.
  private generation = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryWait: {timer: ReturnType<typeof setTimeout>; resolve: () => void} | null = null;
  private lastReceived = 0;
  private synced = false;
  private bestRTT = Infinity;
  private clockAnchor: Snapshot | null = null;
  private client: RoomClient;
  private storage: TokenStorage;
  constructor(options: {client?: RoomClient; storage?: TokenStorage} = {}) {
    this.client = options.client ?? defaultClient();
    this.storage = options.storage ?? sessionStorage;
  }
  onSnapshot: (s: Snapshot) => void = () => {};
  onStatus: (s: string) => void = () => {};
  onNotice: (s: string) => void = () => {};
  get hasSnapshot() { return this.clockAnchor !== null; }
  now() { return performance.now() + this.offset; }
  gameNow() { const s = this.clockAnchor;return s ? snapshotGameNow(s, this.now()) : this.now(); }
  private begin() {
    this.wakeRetry();
    this.alive = true;this.connected = false;this.room = null;this.clockAnchor = null;
    if(this.pingTimer)clearInterval(this.pingTimer);this.pingTimer = null;
    return ++this.generation;
  }
  private current(generation: number) {return this.alive && generation === this.generation;}
  async connect(mode: ConnectionMode, name: string, code = "") {
    const generation = this.begin();
    this.storage.removeItem("duel-token");this.onStatus("연결 중");
    const room = mode === "join" ? await this.client.joinById(code.trim().toUpperCase(), {name})
      : await this.client.create("duel", {
        name, practice: mode === "practice",
        ...(mode === "botPractice" ? { botPractice: true } : {}),
      });
    if(!this.current(generation)) {await room.leave();throw new Error("취소된 연결입니다.");}
    this.attach(room,generation);
  }
  async restore() {
    const token = this.storage.getItem("duel-token");if(!token)return false;
    const generation = this.begin();
    return this.retry(token,generation);
  }
  private attach(room: Room, generation: number) {
    this.room = room;this.connected = true;this.synced = false;this.bestRTT = Infinity;
    this.lastReceived = performance.now();
    this.storage.setItem("duel-token", room.reconnectionToken);
    const current = () => this.current(generation) && this.room === room && this.connected;
    room.onMessage("snapshot", (s: Snapshot) => {
      if(!current())return;
      this.lastReceived = performance.now();
      if(!this.synced)this.offset = s.serverNow - performance.now();
      this.clockAnchor = s;this.onSnapshot(s);
    });
    room.onMessage("notice", (s: string) => {if(current())this.onNotice(s);});
    room.onMessage("pong", (p: {sent:number;serverNow:number}) => {
      if(!current())return;
      this.lastReceived = performance.now();
      const rtt = performance.now() - p.sent;if(rtt < 0 || rtt > 10000)return;
      this.latency = Math.round(rtt);
      if(!this.synced || rtt <= this.bestRTT * 1.5) {
        this.offset = p.serverNow - (p.sent + performance.now()) / 2;
        this.bestRTT = Math.min(this.bestRTT,rtt);this.synced = true;
      }
      this.onStatus(`연결됨 · ${this.latency}ms`);
    });
    room.onError((_code,message) => {if(current())this.onNotice(message || "연결 오류");});
    room.onLeave((code) => {
      if(!current())return;
      this.connected = false;
      if(this.pingTimer)clearInterval(this.pingTimer);this.pingTimer = null;
      if(code === 4000) {
        this.endRecovery(generation,"서버에서 방 연결을 종료했습니다. 로비에서 새 경기를 시작하세요.");
      } else void this.retry(room.reconnectionToken,generation);
    });
    if(this.pingTimer)clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.checkConnection(room,generation),HEARTBEAT_INTERVAL_MS);
    this.onStatus("연결됨");this.checkConnection(room,generation);
  }
  // Called after network recovery or returning to a suspended browser tab.
  resume() {
    this.wakeRetry();
    if(this.room && this.connected)this.checkConnection(this.room,this.generation);
  }
  private checkConnection(room: Room, generation: number) {
    if(!this.current(generation) || this.room !== room || !this.connected)return;
    if(performance.now()-this.lastReceived < CONNECTION_STALE_MS && room.connection.isOpen) {
      room.send("ping",performance.now());return;
    }
    // A half-open socket may never emit onLeave (sleep, network switch, proxy).
    this.connected = false;
    if(this.pingTimer)clearInterval(this.pingTimer);this.pingTimer = null;
    room.connection.close();
    void this.retry(room.reconnectionToken,generation);
  }
  private wakeRetry() {
    const wait = this.retryWait;if(!wait)return;
    this.retryWait = null;clearTimeout(wait.timer);wait.resolve();
  }
  private waitToRetry(ms: number) {
    return new Promise<void>(resolve => {
      const timer = setTimeout(() => {this.retryWait = null;resolve();},ms);
      this.retryWait = {timer,resolve};
    });
  }
  private endRecovery(generation: number, message: string) {
    if(!this.current(generation))return false;
    this.storage.removeItem("duel-token");this.onStatus("연결 종료");this.onNotice(message);
    return false;
  }
  private async retry(token: string, generation: number) {
    this.onStatus(`재접속 중 · 최대 ${RECONNECT_GRACE_SECONDS/60}분`);
    const started = performance.now(), end = started+RECONNECT_GRACE_SECONDS*1000;
    let attempts = 0;
    while(this.current(generation) && performance.now()<end) {
      try {
        const room = await this.client.reconnect(token);
        if(!this.current(generation)) {await room.leave();return false;}
        this.attach(room,generation);return true;
      } catch (error) {
        if(!this.current(generation))return false;
        const code = (error as {code?:number})?.code;
        if(code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID)
          return this.endRecovery(generation,"방이 이미 종료되었거나 서버가 재시작되었습니다. 로비에서 새 경기를 시작하세요.");
        // The old socket's close may reach the server just after the first
        // reconnect request. Allow that handoff before treating a token as lost.
        if(code === ErrorCode.MATCHMAKE_EXPIRED && performance.now()-started >= 10_000)
          return this.endRecovery(generation,"재접속 유효 시간이 만료되었습니다. 로비에서 새 경기를 시작하세요.");
        const remaining = end-performance.now();if(remaining <= 0)break;
        await this.waitToRetry(Math.min(1500*2**Math.min(attempts++,2),5000,remaining));
      }
    }
    if(!this.current(generation))return false;
    return this.endRecovery(generation,"5분 동안 연결을 복구하지 못했습니다. 로비에서 새 경기를 시작하세요.");
  }
  send(action: Action) {
    if(!this.room || !this.connected) {this.onNotice("연결 복구 후 다시 시도하세요.");return;}
    this.room.send("action",action);
  }
  debug(action: DebugAction) {if(this.connected && this.clockAnchor?.debug)this.room?.send("debug",action);}
  async leave() {
    const room = this.room;
    this.alive = false;++this.generation;this.room = null;this.connected = false;this.clockAnchor = null;
    this.wakeRetry();
    this.storage.removeItem("duel-token");
    if(this.pingTimer)clearInterval(this.pingTimer);this.pingTimer = null;
    if(room?.connection.isOpen)await room.leave();
  }
}
