type HealthState = { hp: number; maxHp: number; trail: number; holdUntil: number; lastTime: number };
export const HEALTH_TRAIL_COLOR = 0xffedc2;
export const HEALTH_TRAIL_HOLD = 160;

// Presentation only: current HP always follows the snapshot immediately.
export class HealthTrail {
  private states = new Map<string, HealthState>();
  clear() { this.states.clear(); }
  remove(id: string) { this.states.delete(id); }

  update(id: string, hp: number, maxHp: number, now: number, reduced: boolean) {
    const max = Math.max(1, maxHp), current = Math.min(max, Math.max(0, hp));
    let state = this.states.get(id);
    if (!state || state.maxHp !== max || now < state.lastTime) {
      state = { hp: current, maxHp: max, trail: current, holdUntil: now, lastTime: now };
      this.states.set(id, state);
    }
    if (reduced || current > state.hp) {
      state.trail = current; state.holdUntil = now;
    } else if (current < state.hp) {
      state.trail = Math.max(state.trail, state.hp);
      state.holdUntil = now + HEALTH_TRAIL_HOLD;
    }
    const elapsed = Math.max(0, now - Math.max(state.lastTime, state.holdUntil));
    state.trail = current + Math.max(0, state.trail - current) * Math.exp(-elapsed / 140);
    if (state.trail - current < max * 0.003) state.trail = current;
    state.hp = current; state.lastTime = now;
    return { current: current / max, trail: Math.min(max, state.trail) / max };
  }
}
