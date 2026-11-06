type Direction = { x: number; y: number };
type Impulse = Direction & { at: number };
type MotionState = {
  facing: number; seed: number; x: number; y: number; halfHeight: number;
  moving: boolean; moveBlend: number; idleBlend: number; lean: number; stoppedAt: number;
  recoil?: Impulse; hit?: Impulse; death?: Impulse; castAt?: number;
};
export const DEATH_DURATION = 420;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const direction = (x: number, y: number): Direction => {
  const length = Math.hypot(x, y);
  return length > 0.001 ? { x: x / length, y: y / length } : { x: 0, y: -1 };
};
function pulse(now: number, impulse: Impulse | undefined, duration: number, peak: number) {
  if (!impulse) return 0;
  const age = now - impulse.at;
  if (age < 0 || age >= duration) return 0;
  return age < peak ? age / peak : (1 - (age - peak) / (duration - peak)) ** 2;
}

// Only visual offsets live here. Board cells, combat positions and hit targets
// continue to come from the authoritative snapshot.
export class UnitMotion {
  private states = new Map<string, MotionState>();
  clear() { this.states.clear(); }
  remove(id: string) { this.states.delete(id); }
  isDying(id: string) { return !!this.states.get(id)?.death; }

  update(id: string, input: {
    x: number; y: number; targetX: number; targetY: number;
    aim?: Direction; facing: number; now: number; delta: number; reduced: boolean; idle?: boolean; halfHeight?: number;
  }) {
    let state = this.states.get(id);
    if (!state) {
      const seed = [...id].reduce((v, c) => (v * 31 + c.charCodeAt(0)) >>> 0, 0) % 1000;
      state = { facing: input.facing, seed, x: input.x, y: input.y, halfHeight: input.halfHeight ?? 42.5, moving: false, moveBlend: 0, idleBlend: 0, lean: 0, stoppedAt: -Infinity };
      this.states.set(id, state);
    }
    const dx = input.x - state.x, dy = input.y - state.y;
    const moving = Math.hypot(input.targetX - input.x, input.targetY - input.y) > 0.65;
    const look = input.aim ?? { x: moving ? input.targetX - input.x : dx, y: dy };
    if (Math.abs(look.x) > 0.5) state.facing = Math.sign(look.x);
    const blend = 1 - Math.exp(-clamp(input.delta, 0, 100) / 60);
    if (state.moving && !moving) state.stoppedAt = input.now;
    state.moving = moving;
    state.moveBlend += ((moving ? 1 : 0) - state.moveBlend) * blend;
    state.idleBlend += ((input.idle && !moving ? 1 : 0) - state.idleBlend) * blend;
    const tilt = moving ? (Math.abs(dx) > 0.01 ? Math.sign(dx) : state.facing) * 6 : 0;
    state.lean += (tilt - state.lean) * blend;
    state.x = input.x; state.y = input.y;
    state.halfHeight = input.halfHeight ?? 42.5;
    if (input.reduced) {
      state.recoil = state.hit = undefined;
      state.castAt = undefined;
      state.moveBlend = state.idleBlend = state.lean = 0; state.stoppedAt = -Infinity;
    }
  }

  attack(id: string, dx: number, dy: number, now: number) {
    const state = this.states.get(id);
    if (!state || state.death) return;
    if (Math.abs(dx) > 0.5) state.facing = Math.sign(dx);
    state.recoil = { ...direction(dx, dy), at: now };
  }

  hit(id: string, dx: number, dy: number, now: number) {
    const state = this.states.get(id);
    if (state && !state.death) state.hit = { ...direction(dx, dy), at: now };
  }

  cast(id: string, now: number) {
    const state = this.states.get(id);
    if (state && !state.death) state.castAt = now;
  }

  die(id: string, now: number) {
    const state = this.states.get(id);
    if (state && !state.death) state.death = {
      x: state.hit?.x ?? state.facing, y: state.hit?.y ?? 0, at: now,
    };
  }

  pose(id: string, now: number, reduced: boolean) {
    const state = this.states.get(id)!;
    const base = { x: 0, y: 0, angle: 0, scaleX: 1, scaleY: 1, alpha: 1, flipX: state.facing < 0, moving: state.moving, dying: !!state.death, finished: false };
    if (state.death) {
      const age = Math.max(0, now - state.death.at), progress = clamp(age / DEATH_DURATION, 0, 1);
      const ease = 1 - (1 - progress) ** 2;
      return { ...base,
        x: reduced ? 0 : state.death.x * ease * 11,
        y: reduced ? 0 : state.death.y * ease * 7 + ease * 12,
        angle: reduced ? 0 : (Math.abs(state.death.x) > 0.1 ? Math.sign(state.death.x) : state.facing) * ease * 65,
        scaleX: reduced ? 1 : 1 - ease * 0.25, scaleY: reduced ? 1 : 1 - ease * 0.25,
        alpha: reduced ? 0 : 1 - clamp((age - 70) / (DEATH_DURATION - 70), 0, 1),
        finished: reduced || progress >= 1,
      };
    }
    if (reduced) return base;
    const recoil = pulse(now, state.recoil, 180, 28), hit = pulse(now, state.hit, 220, 24);
    const cast = pulse(now, state.castAt === undefined ? undefined : { x: 0, y: 0, at: state.castAt }, 340, 65)
      * (1 - Math.max(hit, recoil * 0.7)) * (1 - state.moveBlend);
    const idle = state.idleBlend * (1 - Math.max(recoil, hit, cast));
    const phase = state.seed / 1000 * Math.PI * 2;
    const breath = Math.sin(now / 620 + phase) * idle;
    const stopAge = now - state.stoppedAt;
    const settle = stopAge >= 0 && stopAge < 220 ? Math.sin(stopAge / 220 * Math.PI * 2) * (1 - stopAge / 220) : 0;
    return { ...base,
      x: clamp(-(state.recoil?.x ?? 0) * recoil * 5 + (state.hit?.x ?? 0) * hit * 7, -10, 10),
      y: clamp(-(state.recoil?.y ?? 0) * recoil * 5 + (state.hit?.y ?? 0) * hit * 7, -10, 10)
        + Math.sin(now / 75 + state.seed) * state.moveBlend * 1.8
        // Scale around the centre with a matching offset to keep idle feet planted.
        - breath * 0.008 * state.halfHeight + cast * 1.8,
      angle: state.lean + settle * state.facing * 3
        - (state.recoil?.x ?? 0) * recoil * 2 + (state.hit?.x ?? 0) * hit * 5
        + Math.sin(now / 1150 + phase) * idle * 0.35 - state.facing * cast * 2,
      scaleX: 1 - recoil * 0.025 + hit * 0.03 - breath * 0.004 + cast * 0.025,
      scaleY: 1 + recoil * 0.02 - hit * 0.025 + breath * 0.008 - cast * 0.045,
    };
  }
}
